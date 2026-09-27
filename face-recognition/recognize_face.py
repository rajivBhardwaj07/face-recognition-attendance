"""
recognize_face.py
-----------------
Flask REST API that:
1. Loads all student face encodings from the Node.js backend
2. Opens webcam and recognizes faces in real-time
3. Requires a blink (liveness check) before accepting a face, so a photo can't be used
4. Marks attendance via the Node.js backend API

Endpoints:
  GET  /status          — Health check
  POST /start           — Start recognition session
  POST /stop            — Stop recognition session
  POST /recognize-frame — Recognize a single base64 frame (for browser integration)
  POST /encode          — Compute a face encoding from captured images (registration)
  GET  /encodings/reload — Reload encodings from backend

Usage:
    python recognize_face.py
    # API runs at http://localhost:8000
"""

import cv2
import face_recognition
import numpy as np
import requests
import threading
import time
import os
import base64
from io import BytesIO
from datetime import datetime, date
from flask import Flask, jsonify, request
from flask_cors import CORS
from dotenv import load_dotenv

load_dotenv()

# ─── Configuration ───────────────────────────────────────────────────────────

API_URL = os.getenv('BACKEND_URL', 'http://localhost:5000/api')
RECOGNITION_THRESHOLD = float(os.getenv('RECOGNITION_THRESHOLD', '0.55'))  # Lower = stricter
COOLDOWN_SECONDS = int(os.getenv('COOLDOWN_SECONDS', '30'))  # Avoid duplicate marks
SERVICE_TOKEN = os.getenv('SERVICE_TOKEN', '')  # Admin JWT token (optional)
SERVICE_EMAIL = os.getenv('SERVICE_EMAIL', '')  # Admin login used to fetch a token
SERVICE_PASSWORD = os.getenv('SERVICE_PASSWORD', '')

# Liveness (anti-spoofing): a face must blink before attendance is marked
LIVENESS_REQUIRED = os.getenv('LIVENESS_REQUIRED', 'true').lower() != 'false'
EYE_CLOSED_RATIO = 0.70   # Eye openness below this fraction of the person's baseline = closed
EYE_OPEN_RATIO = 0.85     # Back above this fraction = reopened (blink complete)
POSE_TOLERANCE = 0.12     # Max face-shape change allowed during a blink (rejects tilting a photo)
BASELINE_FRAMES = 3       # Open-eye frames needed before a blink can count
TRACK_TTL = 2.0           # Seconds a face can vanish before its track is dropped
REIDENTIFY_SECONDS = 2.0  # How often to retry identifying an unknown face

app = Flask(__name__)
CORS(app)

# ─── Global State ────────────────────────────────────────────────────────────

known_encodings = []     # List of 128-dim numpy arrays
known_student_ids = []   # Matching student IDs 
known_names = []         # Matching student names

recently_marked = {}     # {studentId: timestamp} — cooldown tracking
recognition_active = False
recognition_thread = None
last_recognition_result = None

# Faces currently in view. Identifying a face (encoding) is slow, so each face is
# identified once and then followed frame-to-frame by position while its eyes
# are watched for a blink.
tracks = []
tracks_lock = threading.Lock()


# ─── Backend Auth ────────────────────────────────────────────────────────────

def refresh_token():
    """Log in as the service admin account to get a fresh JWT."""
    global SERVICE_TOKEN
    if not (SERVICE_EMAIL and SERVICE_PASSWORD):
        return False
    try:
        response = requests.post(
            f'{API_URL}/auth/login',
            json={'email': SERVICE_EMAIL, 'password': SERVICE_PASSWORD},
            timeout=10
        )
        response.raise_for_status()
        SERVICE_TOKEN = response.json()['token']
        return True
    except Exception as e:
        print(f"❌ Service login failed: {e}")
        return False


def backend_request(method: str, path: str, **kwargs):
    """Call the backend with the service token, re-logging in once on 401."""
    if not SERVICE_TOKEN:
        refresh_token()
    for attempt in range(2):
        headers = {'Authorization': f'Bearer {SERVICE_TOKEN}'}
        response = requests.request(method, f'{API_URL}{path}', headers=headers, **kwargs)
        if response.status_code != 401 or attempt == 1 or not refresh_token():
            return response
    return response


# ─── Load Encodings from Backend ─────────────────────────────────────────────

def load_encodings_from_backend():
    """Fetch all face encodings from Node.js backend."""
    global known_encodings, known_student_ids, known_names

    try:
        response = backend_request('GET', '/students/encodings/all', timeout=15)
        response.raise_for_status()
        data = response.json()

        temp_encodings = []
        temp_ids = []
        temp_names = []

        for student in data.get('data', []):
            if student.get('faceEncoding') and len(student['faceEncoding']) == 128:
                temp_encodings.append(np.array(student['faceEncoding']))
                temp_ids.append(student['studentId'])
                temp_names.append(student['name'])

        known_encodings = temp_encodings
        known_student_ids = temp_ids
        known_names = temp_names
        with tracks_lock:
            tracks.clear()  # Drop identities that may be stale

        print(f"✅ Loaded {len(known_encodings)} face encodings from backend")
        return True

    except Exception as e:
        print(f"❌ Failed to load encodings: {e}")
        return False


# ─── Mark Attendance via Backend ─────────────────────────────────────────────

def mark_attendance(student_id: str, confidence: float):
    """Call Node.js backend to mark attendance."""
    try:
        # Check cooldown (avoid marking same student multiple times)
        if student_id in recently_marked:
            elapsed = time.time() - recently_marked[student_id]
            if elapsed < COOLDOWN_SECONDS:
                return None  # Skip — already marked recently

        payload = {
            'studentId': student_id,
            'method': 'face_recognition',
            'confidence': round(confidence, 4)
        }
        response = backend_request('POST', '/attendance/mark', json=payload, timeout=10)

        if response.ok:
            recently_marked[student_id] = time.time()
            result = response.json()
            print(f"✅ Marked: {result['message']}")
            return result
        else:
            print(f"⚠️  Failed to mark: {response.text}")
            return None

    except Exception as e:
        print(f"❌ Error marking attendance: {e}")
        return None


# ─── Liveness (Blink Detection) ──────────────────────────────────────────────

def _dist(a, b) -> float:
    return float(np.linalg.norm(np.subtract(a, b)))


def eye_aspect_ratio(eye) -> float:
    """Eye openness from its 6 landmarks: vertical gaps / horizontal width."""
    return (_dist(eye[1], eye[5]) + _dist(eye[2], eye[4])) / (2.0 * _dist(eye[0], eye[3]))


def face_metrics(landmarks: dict):
    """
    Returns (eye openness, face shape ratio). The shape ratio (nose-to-chin
    height / outer eye-corner width) barely changes during a real blink but
    shifts when a flat photo is tilted, which also squashes the eyes.
    """
    left, right = landmarks['left_eye'], landmarks['right_eye']
    ear = (eye_aspect_ratio(left) + eye_aspect_ratio(right)) / 2.0
    shape = _dist(landmarks['nose_bridge'][0], landmarks['chin'][8]) / _dist(left[0], right[3])
    return ear, shape


def update_liveness(track: dict, ear: float, shape: float) -> bool:
    """Advance a track's blink state machine. Returns True once a full blink is seen."""
    if len(track['open_samples']) < BASELINE_FRAMES:
        track['open_samples'].append((ear, shape))
        if len(track['open_samples']) == BASELINE_FRAMES:
            track['baseline_ear'] = float(np.median([e for e, _ in track['open_samples']]))
            track['baseline_shape'] = float(np.median([sh for _, sh in track['open_samples']]))
        return False

    if abs(shape / track['baseline_shape'] - 1) > POSE_TOLERANCE:
        return False  # Head/photo moved too much for this frame to count either way

    if not track['eyes_closed']:
        if ear < track['baseline_ear'] * EYE_CLOSED_RATIO:
            track['eyes_closed'] = True
        else:
            # Slowly follow the person's natural eye openness while eyes are open
            track['baseline_ear'] = 0.8 * track['baseline_ear'] + 0.2 * ear
            track['baseline_shape'] = 0.8 * track['baseline_shape'] + 0.2 * shape
        return False

    return ear > track['baseline_ear'] * EYE_OPEN_RATIO


# ─── Face Tracking ───────────────────────────────────────────────────────────

def box_iou(a, b) -> float:
    """Overlap of two (top, right, bottom, left) boxes, 0..1."""
    top, bottom = max(a[0], b[0]), min(a[2], b[2])
    left, right = max(a[3], b[3]), min(a[1], b[1])
    inter = max(0, bottom - top) * max(0, right - left)
    area = lambda r: (r[2] - r[0]) * (r[1] - r[3])
    union = area(a) + area(b) - inter
    return inter / union if union else 0.0


def new_track(box) -> dict:
    return {
        'box': box, 'last_seen': 0.0,
        'student_id': None, 'name': None, 'encoding': None, 'confidence': 0.0,
        'identified_at': 0.0,
        'open_samples': [], 'baseline_ear': None, 'baseline_shape': None, 'eyes_closed': False,
        'verified': False, 'marked': False, 'attendance_status': None, 'mark_attempted_at': 0.0,
    }


def reset_liveness(track: dict):
    track.update(open_samples=[], baseline_ear=None, baseline_shape=None, eyes_closed=False)


def identify(frame_rgb: np.ndarray, box):
    """Encode the face at `box` and match it. Returns (index or None, confidence)."""
    encoding = face_recognition.face_encodings(frame_rgb, [box])[0]
    distances = face_recognition.face_distance(known_encodings, encoding)
    best = int(np.argmin(distances))
    confidence = 1 - float(distances[best])
    return (best if distances[best] <= RECOGNITION_THRESHOLD else None), confidence


def match_tracks(boxes, now: float) -> list:
    """Pair each detected box with the existing track it overlaps most (or a new one)."""
    global tracks
    tracks = [t for t in tracks if now - t['last_seen'] <= TRACK_TTL]
    available = list(tracks)
    matched = []
    for box in boxes:
        best = max(available, key=lambda t: box_iou(t['box'], box), default=None)
        if best is not None and box_iou(best['box'], box) > 0.3:
            available.remove(best)
        else:
            best = new_track(box)
            tracks.append(best)
        best['box'], best['last_seen'] = box, now
        matched.append(best)
    return matched


# ─── Recognize a Single Frame ─────────────────────────────────────────────────

def process_frame(frame_rgb: np.ndarray) -> dict:
    """
    Run face recognition + liveness on a single RGB frame. Call it on a steady
    stream of frames (~5-10 fps): a blink only shows up across several frames.
    Returns dict with recognized students and their liveness state.
    """
    global last_recognition_result

    result = {
        'recognized': [],
        'unknown_faces': 0,
        'total_faces': 0,
        'liveness_required': LIVENESS_REQUIRED,
        'timestamp': datetime.now().isoformat()
    }

    if not known_encodings:
        return result

    # Detect on a half-size grayscale frame for speed (HOG only needs edges),
    # then measure landmarks at full size
    small_gray = cv2.cvtColor(cv2.resize(frame_rgb, (0, 0), fx=0.5, fy=0.5), cv2.COLOR_RGB2GRAY)
    boxes = [tuple(v * 2 for v in loc)
             for loc in face_recognition.face_locations(small_gray, model='hog')]
    result['total_faces'] = len(boxes)
    all_landmarks = face_recognition.face_landmarks(frame_rgb, boxes) if boxes else []
    now = time.time()

    with tracks_lock:
        for track, landmarks in zip(match_tracks(boxes, now), all_landmarks):
            # 1. Identify new faces (slow — once per track, retried for unknowns)
            if track['student_id'] is None:
                if now - track['identified_at'] < REIDENTIFY_SECONDS:
                    result['unknown_faces'] += 1
                    continue
                track['identified_at'] = now
                idx, confidence = identify(frame_rgb, track['box'])
                if idx is None:
                    result['unknown_faces'] += 1
                    continue
                track.update(student_id=known_student_ids[idx], name=known_names[idx],
                             encoding=known_encodings[idx], confidence=confidence)

            # 2. Liveness — wait for a blink before accepting the face
            just_marked = False
            if not track['verified']:
                blinked = update_liveness(track, *face_metrics(landmarks))
                if LIVENESS_REQUIRED and blinked:
                    # Re-check identity on the post-blink frame so a photo can't be
                    # swapped for a different, real face partway through
                    encoding = face_recognition.face_encodings(frame_rgb, [track['box']])[0]
                    distance = face_recognition.face_distance([track['encoding']], encoding)[0]
                    if distance > RECOGNITION_THRESHOLD:
                        track.update(student_id=None, identified_at=0.0)
                        reset_liveness(track)
                        result['unknown_faces'] += 1
                        continue
                track['verified'] = blinked or not LIVENESS_REQUIRED

            # 3. Mark attendance once per verified face (retried if the backend call fails)
            if track['verified'] and not track['marked'] and now - track['mark_attempted_at'] >= 2:
                track['mark_attempted_at'] = now
                student_id = track['student_id']
                last = recently_marked.get(student_id)
                if last and now - last < COOLDOWN_SECONDS:
                    track['marked'] = True  # Already marked moments ago
                else:
                    mark_result = mark_attendance(student_id, track['confidence'])
                    if mark_result:
                        track.update(marked=True, attendance_status=mark_result['data']['status'])
                        just_marked = True

            result['recognized'].append({
                'studentId': track['student_id'],
                'name': track['name'],
                'confidence': round(track['confidence'] * 100, 1),
                'liveness': 'verified' if track['verified'] else 'pending',
                'marked': track['marked'],
                'justMarked': just_marked,
                'attendanceStatus': track['attendance_status'],
            })

    last_recognition_result = result
    return result


# ─── Live Webcam Recognition Thread ──────────────────────────────────────────

def live_recognition_loop():
    """Background thread: opens webcam, recognizes faces continuously."""
    global recognition_active

    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print("❌ Cannot open webcam")
        recognition_active = False
        return

    print("🎥 Live recognition started...")

    while recognition_active:
        ret, frame = cap.read()
        if not ret:
            continue

        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        result = process_frame(rgb_frame)

        # Draw annotations on frame
        for rec in result['recognized']:
            cv2.putText(frame, f"{rec['name']} ({rec['confidence']}%)",
                        (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 0), 2)

        cv2.imshow('Smart Attendance — Live Recognition', frame)
        if cv2.waitKey(1) & 0xFF == ord('q'):
            break

        time.sleep(0.1)  # ~10 fps

    cap.release()
    cv2.destroyAllWindows()
    recognition_active = False
    print("🛑 Live recognition stopped.")


# ─── Image Decoding ──────────────────────────────────────────────────────────

def decode_image(data_url: str):
    """Decode a base64 (optionally data-URL) image into an RGB array, or None."""
    img_data = data_url.split(',')[1] if ',' in data_url else data_url
    img_array = np.frombuffer(base64.b64decode(img_data), dtype=np.uint8)
    frame = cv2.imdecode(img_array, cv2.IMREAD_COLOR)
    return None if frame is None else cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)


# ─── Flask API Routes ─────────────────────────────────────────────────────────

@app.route('/status', methods=['GET'])
def status():
    return jsonify({
        'status': 'running',
        'encodings_loaded': len(known_encodings),
        'recognition_active': recognition_active,
        'threshold': RECOGNITION_THRESHOLD,
        'cooldown_seconds': COOLDOWN_SECONDS,
        'liveness_required': LIVENESS_REQUIRED
    })


@app.route('/encodings/reload', methods=['POST'])
def reload_encodings():
    success = load_encodings_from_backend()
    return jsonify({
        'success': success,
        'count': len(known_encodings),
        'message': f"Loaded {len(known_encodings)} encodings" if success else "Failed to load"
    })


@app.route('/start', methods=['POST'])
def start_recognition():
    global recognition_active, recognition_thread

    if recognition_active:
        return jsonify({'success': False, 'message': 'Recognition already running'})

    if not known_encodings:
        load_encodings_from_backend()

    recognition_active = True
    recognition_thread = threading.Thread(target=live_recognition_loop, daemon=True)
    recognition_thread.start()

    return jsonify({'success': True, 'message': 'Live recognition started'})


@app.route('/stop', methods=['POST'])
def stop_recognition():
    global recognition_active
    recognition_active = False
    return jsonify({'success': True, 'message': 'Recognition stopped'})


@app.route('/recognize-frame', methods=['POST'])
def recognize_frame():
    """
    Recognize faces in a single base64-encoded image frame.
    Used by the React frontend to send webcam snapshots.
    Body: { "image": "data:image/jpeg;base64,..." }
    """
    try:
        data = request.get_json()
        if not data or 'image' not in data:
            return jsonify({'success': False, 'error': 'No image provided'}), 400

        rgb_frame = decode_image(data['image'])
        if rgb_frame is None:
            return jsonify({'success': False, 'error': 'Invalid image data'}), 400

        result = process_frame(rgb_frame)

        return jsonify({'success': True, 'data': result})

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/encode', methods=['POST'])
def encode_faces():
    """
    Compute a face encoding from one or more base64 images of the same person.
    Frames with exactly one face are averaged into a single 128-dim encoding.
    Body: { "images": ["data:image/jpeg;base64,...", ...] }
    """
    try:
        data = request.get_json()
        images = (data or {}).get('images') or []
        if not images:
            return jsonify({'success': False, 'error': 'No images provided'}), 400

        encodings = []
        for image in images:
            rgb_frame = decode_image(image)
            if rgb_frame is None:
                continue
            locations = face_recognition.face_locations(rgb_frame, model='hog')
            if len(locations) != 1:
                continue  # Skip frames with no face or multiple faces
            encodings.append(face_recognition.face_encodings(rgb_frame, locations)[0])

        if not encodings:
            return jsonify({
                'success': False,
                'error': 'No single clear face detected. Face the camera in good lighting, alone in frame.'
            }), 422

        encoding = np.mean(encodings, axis=0)
        return jsonify({
            'success': True,
            'data': {'encoding': encoding.tolist(), 'framesUsed': len(encodings), 'framesTotal': len(images)}
        })

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/last-result', methods=['GET'])
def last_result():
    return jsonify({'success': True, 'data': last_recognition_result})


# ─── Entry Point ─────────────────────────────────────────────────────────────

if __name__ == '__main__':
    print("\n" + "="*50)
    print("  Smart Attendance — Face Recognition Service")
    print("="*50)
    print(f"  Backend    : {API_URL}")
    print(f"  Threshold  : {RECOGNITION_THRESHOLD} (distance ≤ = match)")
    print(f"  Cooldown   : {COOLDOWN_SECONDS}s between marks")
    print("="*50 + "\n")

    # Load encodings on startup
    load_encodings_from_backend()

    # Start Flask server
    app.run(host='0.0.0.0', port=8000, debug=False)
