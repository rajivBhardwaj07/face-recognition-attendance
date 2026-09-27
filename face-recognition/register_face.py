"""
register_face.py
----------------
Captures face images from webcam, encodes the face, and sends the
128-dimension encoding to the Node.js backend for storage in MongoDB.

Usage:
    python register_face.py --student-id STU001 --token <JWT_TOKEN>
    python register_face.py --student-id STU001 --token <JWT_TOKEN> --samples 5
"""

import cv2
import face_recognition
import numpy as np
import requests
import argparse
import os
import time
import sys
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

# ─── Configuration ───────────────────────────────────────────────────────────

API_URL = os.getenv('BACKEND_URL', 'http://localhost:5000/api')
CAPTURE_DIR = os.path.join(os.path.dirname(__file__), 'captured_images')
os.makedirs(CAPTURE_DIR, exist_ok=True)


def capture_face_samples(student_id: str, num_samples: int = 5) -> list:
    """
    Open webcam, detect face, capture multiple samples.
    Returns list of face encoding arrays.
    """
    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        raise RuntimeError("Cannot open webcam. Check connection.")

    encodings = []
    sample_count = 0
    frame_count = 0

    print(f"\n🎥 Webcam started. Capturing {num_samples} face samples for {student_id}...")
    print("📌 Position your face in the frame. Press 'q' to quit.\n")

    while sample_count < num_samples:
        ret, frame = cap.read()
        if not ret:
            print("Failed to read frame")
            continue

        frame_count += 1
        display = frame.copy()

        # Only process every 3rd frame (performance)
        if frame_count % 3 == 0:
            # Convert BGR (OpenCV) to RGB (face_recognition)
            rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

            # Detect face locations
            face_locations = face_recognition.face_locations(rgb_frame, model='hog')

            for (top, right, bottom, left) in face_locations:
                # Draw rectangle around face
                color = (0, 255, 0) if sample_count > 0 else (0, 165, 255)
                cv2.rectangle(display, (left, top), (right, bottom), color, 2)

                # Auto-capture every 15 frames after face detected
                if frame_count % 15 == 0:
                    encoding = face_recognition.face_encodings(rgb_frame, [(top, right, bottom, left)])
                    if encoding:
                        encodings.append(encoding[0])
                        sample_count += 1
                        print(f"  ✅ Sample {sample_count}/{num_samples} captured")

                        # Save sample image
                        img_path = os.path.join(CAPTURE_DIR, f"{student_id}_sample_{sample_count}.jpg")
                        cv2.imwrite(img_path, frame[top:bottom, left:right])

            # Overlay info
            cv2.putText(display, f"Samples: {sample_count}/{num_samples}",
                        (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2)
            cv2.putText(display, f"Student: {student_id}",
                        (10, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (200, 200, 200), 1)

            if not face_locations:
                cv2.putText(display, "No face detected",
                            (10, 90), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)

        cv2.imshow(f'Face Registration — {student_id}', display)

        if cv2.waitKey(1) & 0xFF == ord('q'):
            break

    cap.release()
    cv2.destroyAllWindows()

    return encodings


def compute_average_encoding(encodings: list) -> list:
    """Average multiple encodings for a more robust representation."""
    if not encodings:
        raise ValueError("No face encodings captured")
    avg = np.mean(encodings, axis=0)
    return avg.tolist()  # Convert numpy array to plain list for JSON


def find_student_by_id(student_id: str, token: str) -> dict:
    """Look up student in backend by studentId."""
    headers = {'Authorization': f'Bearer {token}'}
    response = requests.get(f'{API_URL}/students?search={student_id}', headers=headers, timeout=10)
    response.raise_for_status()

    data = response.json()
    for student in data.get('data', []):
        if student['studentId'] == student_id:
            return student
    raise ValueError(f"Student '{student_id}' not found in database")


def register_encoding(student_db_id: str, encoding: list, face_image_path: str, token: str):
    """Send face encoding to backend API."""
    headers = {
        'Authorization': f'Bearer {token}',
        'Content-Type': 'application/json'
    }

    # Optionally encode the face image as base64
    face_image_b64 = None
    if face_image_path and os.path.exists(face_image_path):
        import base64
        with open(face_image_path, 'rb') as f:
            face_image_b64 = f"data:image/jpeg;base64,{base64.b64encode(f.read()).decode()}"

    payload = {
        'faceEncoding': encoding,
        'faceImage': face_image_b64
    }

    response = requests.post(
        f'{API_URL}/students/{student_db_id}/encode-face',
        json=payload,
        headers=headers,
        timeout=30
    )
    response.raise_for_status()
    return response.json()


def main():
    parser = argparse.ArgumentParser(description='Register student face for attendance system')
    parser.add_argument('--student-id', required=True, help='Student ID (e.g. STU001)')
    parser.add_argument('--token', required=True, help='Admin JWT token for API auth')
    parser.add_argument('--samples', type=int, default=5, help='Number of face samples to capture (default: 5)')
    args = parser.parse_args()

    print(f"\n{'='*50}")
    print(f"  Smart Attendance — Face Registration")
    print(f"{'='*50}")
    print(f"  Student ID : {args.student_id}")
    print(f"  Samples    : {args.samples}")
    print(f"  Backend    : {API_URL}")
    print(f"{'='*50}\n")

    try:
        # 1. Validate student exists in DB
        print("🔍 Looking up student in database...")
        student = find_student_by_id(args.student_id, args.token)
        print(f"✅ Found: {student['name']} ({student['studentId']})")

        # 2. Capture face samples from webcam
        encodings = capture_face_samples(args.student_id, args.samples)

        if len(encodings) < 3:
            print(f"\n❌ Only {len(encodings)} samples captured. Need at least 3. Try again.")
            sys.exit(1)

        # 3. Average all encodings
        avg_encoding = compute_average_encoding(encodings)
        print(f"\n🧮 Averaged {len(encodings)} encodings → 128-dim vector")

        # 4. Save best sample image
        best_image = os.path.join(CAPTURE_DIR, f"{args.student_id}_sample_1.jpg")

        # 5. Upload to backend
        print("📤 Uploading encoding to server...")
        result = register_encoding(student['_id'], avg_encoding, best_image, args.token)

        print(f"\n{'='*50}")
        print(f"  ✅ Face Registered Successfully!")
        print(f"  Student : {student['name']}")
        print(f"  Samples : {len(encodings)}")
        print(f"  Time    : {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"{'='*50}\n")

    except requests.exceptions.ConnectionError:
        print(f"\n❌ Cannot connect to backend at {API_URL}. Is the server running?")
        sys.exit(1)
    except requests.exceptions.HTTPError as e:
        print(f"\n❌ API Error: {e.response.status_code} — {e.response.text}")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ Error: {e}")
        sys.exit(1)


if __name__ == '__main__':
    main()
