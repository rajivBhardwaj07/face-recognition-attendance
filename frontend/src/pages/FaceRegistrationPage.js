/**
 * FaceRegistrationPage
 * Captures face via webcam, encodes and stores it
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import Webcam from 'react-webcam';
import { studentsAPI, faceAPI } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { Camera, CheckCircle, RefreshCw, Zap, User, AlertCircle, Upload } from 'lucide-react';

export default function FaceRegistrationPage() {
  const { user, isAdmin } = useAuth();
  const webcamRef = useRef(null);

  const [students, setStudents] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [capturing, setCapturing] = useState(false);
  const [capturedImages, setCapturedImages] = useState([]);
  const [step, setStep] = useState('select'); // select | capture | process | done
  const [webcamReady, setWebcamReady] = useState(false);
  const [processingMsg, setProcessingMsg] = useState('');

  // For students: auto-select themselves
  useEffect(() => {
    if (!isAdmin) {
      setSelectedStudent({ _id: user?.studentProfile?._id, studentId: user?.studentId, name: user?.name });
      setStep('capture');
    }
  }, [user, isAdmin]);

  // Load students for admin
  useEffect(() => {
    if (isAdmin) {
      studentsAPI.getAll({ limit: 100 }).then(res => {
        setStudents(res.data.data);
      }).catch(() => toast.error('Failed to load students'));
    }
  }, [isAdmin]);

  const captureImage = useCallback(() => {
    if (!webcamRef.current) return;
    const imageSrc = webcamRef.current.getScreenshot();
    if (imageSrc) {
      setCapturedImages(prev => [...prev, imageSrc]);
      if (capturedImages.length + 1 >= 5) {
        setCapturing(false);
      }
    }
  }, [capturedImages.length]);

  // Auto-capture with interval
  const startAutoCapture = useCallback(() => {
    setCapturing(true);
    setCapturedImages([]);
  }, []);

  useEffect(() => {
    if (!capturing) return;
    const interval = setInterval(() => {
      if (capturedImages.length < 5) {
        captureImage();
      } else {
        clearInterval(interval);
        setCapturing(false);
      }
    }, 800);
    return () => clearInterval(interval);
  }, [capturing, capturedImages.length, captureImage]);

  const processAndRegister = async () => {
    if (!selectedStudent || capturedImages.length < 3) {
      toast.error('Need at least 3 face captures');
      return;
    }

    setStep('process');
    setProcessingMsg('Sending frames to recognition service...');

    try {
      // Check Python service
      setProcessingMsg('Connecting to face recognition service...');
      await faceAPI.status();

      // Python service detects the face in each frame and averages the encodings
      setProcessingMsg('Encoding face data (this may take a moment)...');
      const encRes = await faceAPI.encodeFaces(capturedImages);
      const encoding = encRes.data.data.encoding;

      setProcessingMsg('Saving face data to database...');
      await studentsAPI.encodeFace(selectedStudent._id, {
        faceEncoding: encoding,
        faceImage: capturedImages[0] // Store thumbnail
      });

      // Let the recognition service pick up the new face right away
      await faceAPI.reloadEncodings().catch(() => {});

      setStep('done');
      toast.success(`✅ Face registered for ${selectedStudent.name}!`);

    } catch (err) {
      toast.error(
        err.response?.data?.error ||
        (err.response ? 'Registration failed' : 'Face recognition service is offline (port 8000)')
      );
      setCapturedImages([]);
      setStep('capture');
    }
  };

  const reset = () => {
    setCapturedImages([]);
    setCapturing(false);
    setStep(isAdmin ? 'select' : 'capture');
    setSelectedStudent(isAdmin ? null : selectedStudent);
    setProcessingMsg('');
  };

  return (
    <div className="max-w-3xl mx-auto animate-fade-in font-sans">
      <div className="mb-6">
        <h1 className="text-2xl font-display font-bold text-white">Face Registration</h1>
        <p className="text-slate-400 text-sm mt-1">Capture your face to enable automatic attendance marking</p>
      </div>

      {/* Progress Steps */}
      <div className="flex items-center gap-2 mb-8">
        {(isAdmin ? ['Select Student', 'Capture Face', 'Processing', 'Done']
                   : ['Capture Face', 'Processing', 'Done']
        ).map((s, i) => {
          const stepMap = isAdmin
            ? ['select', 'capture', 'process', 'done']
            : ['capture', 'process', 'done'];
          const isActive = step === stepMap[i];
          const isDone = stepMap.indexOf(step) > i;

          return (
            <React.Fragment key={s}>
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all
                ${isActive ? 'bg-teal-500/10 border border-teal-500/30 text-teal-400'
                  : isDone ? 'text-green-400' : 'text-slate-600'}`}>
                {isDone ? <CheckCircle size={13} /> : <span className="w-4 h-4 rounded-full border flex items-center justify-center text-[10px]">{i+1}</span>}
                {s}
              </div>
              {i < stepMap.length - 1 && <div className="flex-1 h-px bg-slate-800" />}
            </React.Fragment>
          );
        })}
      </div>

      {/* Step: Select Student (Admin only) */}
      {step === 'select' && isAdmin && (
        <div className="spotlight bg-slate-900/45 backdrop-blur-xl border border-white/[0.07] rounded-2xl shadow-xl shadow-black/20 p-6">
          <h2 className="text-white font-semibold mb-4 flex items-center gap-2">
            <User size={18} className="text-teal-400" /> Select Student
          </h2>
          <div className="relative mb-4">
            <input type="text" placeholder="Search by name or ID..."
              className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-teal-500 placeholder:text-slate-600"
              onChange={e => {
                const q = e.target.value.toLowerCase();
                studentsAPI.getAll({ search: q, limit: 20 }).then(res => setStudents(res.data.data));
              }}
            />
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {students.map(s => (
              <button key={s._id}
                onClick={() => { setSelectedStudent(s); setStep('capture'); }}
                className="w-full flex items-center justify-between px-4 py-3 bg-slate-800/50 hover:bg-slate-800 border border-slate-700/50 hover:border-teal-500/30 rounded-xl transition-all text-left">
                <div>
                  <p className="text-slate-200 text-sm font-medium">{s.name}</p>
                  <p className="text-slate-500 text-xs">{s.studentId} · {s.department}</p>
                </div>
                {s.isFaceRegistered
                  ? <span className="text-xs bg-green-500/10 text-green-400 px-2 py-0.5 rounded-full">Registered</span>
                  : <span className="text-xs bg-slate-700 text-slate-400 px-2 py-0.5 rounded-full">Pending</span>
                }
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step: Capture */}
      {step === 'capture' && (
        <div className="space-y-4">
          {selectedStudent && (
            <div className="bg-teal-500/5 border border-teal-500/20 rounded-xl px-4 py-3 flex items-center gap-3">
              <div className="w-8 h-8 bg-teal-500/20 rounded-full flex items-center justify-center">
                <span className="text-teal-400 font-bold text-sm">{selectedStudent.name?.charAt(0)}</span>
              </div>
              <div>
                <p className="text-white text-sm font-medium">{selectedStudent.name}</p>
                <p className="text-slate-400 text-xs">{selectedStudent.studentId}</p>
              </div>
            </div>
          )}

          <div className="spotlight bg-slate-900/45 backdrop-blur-xl border border-white/[0.07] rounded-2xl shadow-xl shadow-black/20 overflow-hidden">
            {/* Camera feed */}
            <div className="relative aspect-video bg-slate-950">
              <Webcam
                ref={webcamRef}
                screenshotFormat="image/jpeg"
                videoConstraints={{ width: 640, height: 480, facingMode: 'user' }}
                className="w-full h-full object-cover"
                onUserMedia={() => setWebcamReady(true)}
                onUserMediaError={() => toast.error('Camera access denied')}
              />

              {/* Scanning overlay */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-56 h-56 border-2 border-teal-400/50 rounded-full flex items-center justify-center relative">
                  <div className="w-52 h-52 border border-teal-400/20 rounded-full" />
                  {capturing && (
                    <div className="absolute inset-0 rounded-full overflow-hidden">
                      <div
                        className="absolute left-0 right-0 h-0.5 bg-teal-400/60 animate-scan"
                        style={{ boxShadow: '0 0 12px rgba(20,184,166,0.8)' }}
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Sample count */}
              <div className="absolute top-4 right-4 bg-slate-900/80 backdrop-blur px-3 py-1.5 rounded-lg flex items-center gap-2">
                <Camera size={13} className="text-teal-400" />
                <span className="text-white text-xs font-mono">{capturedImages.length}/5</span>
              </div>

              {!webcamReady && (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-950">
                  <div className="text-center">
                    <div className="w-8 h-8 border-2 border-teal-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                    <p className="text-slate-400 text-sm">Starting camera...</p>
                  </div>
                </div>
              )}
            </div>

            {/* Captured thumbnails */}
            {capturedImages.length > 0 && (
              <div className="flex gap-2 p-4 bg-slate-950">
                {capturedImages.map((img, i) => (
                  <div key={i} className="w-12 h-12 rounded-lg overflow-hidden border-2 border-teal-500/40 flex-shrink-0">
                    <img src={img} alt={`sample ${i+1}`} className="w-full h-full object-cover" />
                  </div>
                ))}
                {Array.from({ length: 5 - capturedImages.length }).map((_, i) => (
                  <div key={i} className="w-12 h-12 rounded-lg border-2 border-dashed border-slate-700 flex-shrink-0" />
                ))}
              </div>
            )}

            {/* Controls */}
            <div className="p-4 border-t border-slate-800 flex gap-3">
              {capturedImages.length < 5 ? (
                <button
                  onClick={capturing ? () => setCapturing(false) : startAutoCapture}
                  disabled={!webcamReady}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all
                    ${capturing ? 'bg-red-500/10 border border-red-500/30 text-red-400'
                      : 'bg-teal-500 hover:bg-teal-400 text-white shadow-glow'}`}
                >
                  {capturing
                    ? <><div className="w-3 h-3 bg-red-400 rounded-full animate-pulse" /> Stop</>
                    : <><Zap size={16} /> {capturedImages.length === 0 ? 'Start Capture' : 'Continue'}</>
                  }
                </button>
              ) : (
                <button
                  onClick={processAndRegister}
                  className="flex-1 flex items-center justify-center gap-2 py-3 bg-teal-500 hover:bg-teal-400 text-white rounded-xl text-sm font-semibold shadow-glow"
                >
                  <Upload size={16} /> Register Face
                </button>
              )}

              {capturedImages.length > 0 && (
                <button onClick={() => setCapturedImages([])}
                  className="px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-xl">
                  <RefreshCw size={15} />
                </button>
              )}
            </div>
          </div>

          <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 flex gap-3">
            <AlertCircle size={16} className="text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-slate-400 text-sm">
              Ensure your face is well-lit and centered. Remove glasses and look directly at the camera for best results.
            </p>
          </div>
        </div>
      )}

      {/* Step: Processing */}
      {step === 'process' && (
        <div className="spotlight bg-slate-900/45 backdrop-blur-xl border border-white/[0.07] rounded-2xl shadow-xl shadow-black/20 p-12 flex flex-col items-center text-center">
          <div className="w-16 h-16 border-4 border-teal-500 border-t-transparent rounded-full animate-spin mb-6" />
          <h3 className="text-white font-semibold text-lg mb-2">Processing Face Data</h3>
          <p className="text-slate-400 text-sm">{processingMsg}</p>
        </div>
      )}

      {/* Step: Done */}
      {step === 'done' && (
        <div className="spotlight bg-slate-900/45 backdrop-blur-xl border border-green-500/20 rounded-2xl shadow-xl shadow-black/20 p-12 flex flex-col items-center text-center">
          <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mb-4">
            <CheckCircle size={32} className="text-green-400" />
          </div>
          <h3 className="text-white font-semibold text-xl mb-2">Face Registered!</h3>
          <p className="text-slate-400 text-sm mb-6">
            {selectedStudent?.name}'s face has been successfully registered. Attendance can now be marked automatically.
          </p>
          <button onClick={reset} className="px-6 py-2.5 bg-teal-500 hover:bg-teal-400 text-white rounded-xl text-sm font-medium">
            Register Another
          </button>
        </div>
      )}
    </div>
  );
}
