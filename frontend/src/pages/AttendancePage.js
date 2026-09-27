/**
 * AttendancePage — Live face recognition attendance marking
 * Admin can also manually mark attendance
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import Webcam from 'react-webcam';
import { attendanceAPI, faceAPI, studentsAPI } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import {
  Scan, UserCheck, Download, Filter, Search,
  RefreshCw, CheckCircle, Clock, XCircle, Wifi, WifiOff, Play, Square, Eye, ShieldCheck
} from 'lucide-react';
import { format } from 'date-fns';

// ─── Status Badge ─────────────────────────────────────────────────────────────
const StatusBadge = ({ status }) => {
  const styles = {
    present: 'bg-green-500/10 text-green-400 border-green-500/20',
    late: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    absent: 'bg-red-500/10 text-red-400 border-red-500/20',
  };
  const icons = { present: CheckCircle, late: Clock, absent: XCircle };
  const Icon = icons[status] || CheckCircle;

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${styles[status] || styles.present}`}>
      <Icon size={11} />
      {status}
    </span>
  );
};

// ─── Recognition Feed ─────────────────────────────────────────────────────────
const RecognitionFeed = ({ onRecognized }) => {
  const webcamRef = useRef(null);
  const [isRunning, setIsRunning] = useState(false);
  const [serviceOnline, setServiceOnline] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const [frameCount, setFrameCount] = useState(0);
  const runningRef = useRef(false);

  // Check Python service status
  useEffect(() => {
    const check = async () => {
      try {
        await faceAPI.status();
        setServiceOnline(true);
      } catch {
        setServiceOnline(false);
      }
    };
    check();
    const t = setInterval(check, 10000);
    return () => clearInterval(t);
  }, []);

  const sendFrame = useCallback(async () => {
    if (!webcamRef.current || !serviceOnline) return;
    const imageSrc = webcamRef.current.getScreenshot();
    if (!imageSrc) return;

    setFrameCount(p => p + 1);
    try {
      const res = await faceAPI.recognizeFrame(imageSrc);
      const result = res.data.data;
      if (!runningRef.current) return; // Stopped while this frame was in flight
      setLastResult(result);
      result?.recognized?.forEach(r => {
        if (r.justMarked) {
          onRecognized(r);
          toast.success(`✅ ${r.name} — ${r.attendanceStatus || 'present'}`, { id: r.studentId });
        }
      });
    } catch (err) {
      // Silent fail — service may be momentarily busy
    }
  }, [serviceOnline, onRecognized]);

  // Send frames back-to-back (next one as soon as the last is processed):
  // the liveness check needs a steady stream to catch a blink.
  const loop = useCallback(async () => {
    while (runningRef.current) {
      await sendFrame();
      await new Promise(r => setTimeout(r, 50));
    }
  }, [sendFrame]);

  // While the camera runs, pause decorative background animations (see index.css)
  // so they don't compete with the face service for CPU.
  const start = () => {
    runningRef.current = true;
    setIsRunning(true);
    document.documentElement.classList.add('camera-active');
    loop();
  };

  const stop = () => {
    runningRef.current = false;
    setIsRunning(false);
    setLastResult(null);
    document.documentElement.classList.remove('camera-active');
  };

  useEffect(() => () => {
    runningRef.current = false;
    document.documentElement.classList.remove('camera-active');
  }, []);

  return (
    <div className="spotlight bg-slate-900/45 backdrop-blur-xl border border-white/[0.07] rounded-2xl shadow-xl shadow-black/20 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Scan size={18} className="text-teal-400" />
          <span className="text-white font-semibold">Live Recognition</span>
        </div>
        <div className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border
          ${serviceOnline ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
          {serviceOnline ? <Wifi size={12} /> : <WifiOff size={12} />}
          {serviceOnline ? 'Service Online' : 'Service Offline'}
        </div>
      </div>

      {/* Webcam */}
      <div className="relative aspect-video bg-slate-950">
        <Webcam
          ref={webcamRef}
          screenshotFormat="image/jpeg"
          screenshotQuality={0.8}
          minScreenshotWidth={640}
          videoConstraints={{ width: 640, height: 480, facingMode: 'user' }}
          className="w-full h-full object-cover"
        />

        {/* Corner markers */}
        {['top-4 left-4', 'top-4 right-4', 'bottom-4 left-4', 'bottom-4 right-4'].map((pos, i) => (
          <div key={i} className={`absolute ${pos} w-6 h-6 border-2 border-teal-400/60`}
            style={{
              borderRight: i % 2 === 0 ? 'none' : undefined,
              borderLeft: i % 2 === 1 ? 'none' : undefined,
              borderBottom: i < 2 ? 'none' : undefined,
              borderTop: i >= 2 ? 'none' : undefined,
            }}
          />
        ))}

        {/* Running indicator */}
        {isRunning && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-slate-900/80 backdrop-blur px-3 py-1.5 rounded-full flex items-center gap-2">
            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            <span className="text-white text-xs font-mono">LIVE · {frameCount} frames</span>
            {lastResult?.liveness_required && (
              <span className="flex items-center gap-1 text-teal-300 text-xs font-mono border-l border-slate-700 pl-2">
                <ShieldCheck size={12} /> blink check
              </span>
            )}
          </div>
        )}

        {/* Last result overlay */}
        {lastResult?.recognized?.length > 0 && (
          <div className="absolute bottom-4 left-4 right-4 space-y-2">
            {lastResult.recognized.map((r, i) => {
              const pending = r.liveness === 'pending';
              return (
                <div key={i} className={`bg-slate-900/90 backdrop-blur border rounded-xl px-4 py-2 flex items-center justify-between
                  ${pending ? 'border-amber-500/40' : 'border-green-500/30'}`}>
                  <div className="flex items-center gap-3">
                    {pending
                      ? <Eye size={18} className="text-amber-400 animate-pulse" />
                      : <ShieldCheck size={18} className="text-green-400" />}
                    <div>
                      <p className={`font-semibold text-sm ${pending ? 'text-amber-300' : 'text-green-400'}`}>{r.name}</p>
                      <p className="text-slate-400 text-xs">
                        {pending ? 'Blink slowly to verify you’re live' : r.studentId}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`text-xs ${pending ? 'text-amber-400' : 'text-green-400'}`}>{r.confidence}% match</p>
                    {!pending && (
                      <p className="text-slate-500 text-xs">
                        {r.marked ? `✓ Marked${r.attendanceStatus ? ` · ${r.attendanceStatus}` : ''}` : 'Live ✓ · marking…'}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="p-4 flex gap-3">
        <button
          onClick={isRunning ? stop : start}
          disabled={!serviceOnline}
          className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all
            ${isRunning
              ? 'bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20'
              : 'bg-teal-500 hover:bg-teal-400 text-white shadow-glow disabled:opacity-40 disabled:cursor-not-allowed'
            }`}
        >
          {isRunning ? <><Square size={15} /> Stop Recognition</> : <><Play size={15} /> Start Recognition</>}
        </button>
        <button
          onClick={() => faceAPI.reloadEncodings().then(() => toast.success('Encodings reloaded'))}
          className="px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-xl transition-all"
          title="Reload face encodings"
        >
          <RefreshCw size={15} />
        </button>
      </div>

      {!serviceOnline && (
        <div className="px-4 pb-4">
          <p className="text-xs text-slate-500 text-center">
            Start Python service: <code className="text-teal-400 font-mono">cd face-recognition && python recognize_face.py</code>
          </p>
        </div>
      )}
    </div>
  );
};

// ─── Manual Mark Modal ────────────────────────────────────────────────────────
const ManualMarkModal = ({ onClose, onMarked }) => {
  const [search, setSearch] = useState('');
  const [students, setStudents] = useState([]);
  const [marking, setMarking] = useState(null);

  useEffect(() => {
    studentsAPI.getAll({ search, limit: 10 }).then(r => setStudents(r.data.data));
  }, [search]);

  const markManually = async (student, status = 'present') => {
    setMarking(student._id);
    try {
      await attendanceAPI.mark({ studentId: student.studentId, method: 'manual', status });
      toast.success(`Marked ${student.name} as ${status}`);
      onMarked();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to mark');
    } finally {
      setMarking(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md p-6 animate-slide-up">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-semibold">Manual Attendance</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl">×</button>
        </div>
        <input
          type="text"
          placeholder="Search student..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-2.5 text-sm mb-3 focus:outline-none focus:border-teal-500"
        />
        <div className="space-y-2 max-h-72 overflow-y-auto">
          {students.map(s => (
            <div key={s._id} className="flex items-center justify-between bg-slate-800/50 rounded-xl px-4 py-3">
              <div>
                <p className="text-slate-200 text-sm">{s.name}</p>
                <p className="text-slate-500 text-xs">{s.studentId}</p>
              </div>
              <div className="flex gap-1.5">
                {['present', 'late', 'absent'].map(status => (
                  <button
                    key={status}
                    onClick={() => markManually(s, status)}
                    disabled={marking === s._id}
                    className={`px-2.5 py-1 rounded-lg text-xs capitalize transition-all
                      ${status === 'present' ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                        : status === 'late' ? 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30'
                        : 'bg-red-500/20 text-red-400 hover:bg-red-500/30'}`}
                  >
                    {marking === s._id ? '...' : status}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function AttendancePage() {
  const { isAdmin } = useAuth();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ date: format(new Date(), 'yyyy-MM-dd'), search: '' });
  const [showManual, setShowManual] = useState(false);
  const [recentlyMarked, setRecentlyMarked] = useState([]);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    try {
      const res = await attendanceAPI.getAll({ date: filters.date, limit: 100 });
      setRecords(res.data.data);
    } catch {
      toast.error('Failed to load records');
    } finally {
      setLoading(false);
    }
  }, [filters.date]);

  useEffect(() => { loadRecords(); }, [loadRecords]);

  const handleExport = async () => {
    try {
      const res = await attendanceAPI.exportCSV({ startDate: filters.date, endDate: filters.date });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `attendance_${filters.date}.csv`;
      a.click();
      toast.success('CSV exported!');
    } catch {
      toast.error('Export failed');
    }
  };

  const handleRecognized = (result) => {
    setRecentlyMarked(p => [{ ...result, time: new Date().toLocaleTimeString() }, ...p.slice(0, 4)]);
    loadRecords();
  };

  const filtered = records.filter(r =>
    !filters.search ||
    r.studentName?.toLowerCase().includes(filters.search.toLowerCase()) ||
    r.studentId?.toLowerCase().includes(filters.search.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-fade-in font-sans">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold text-white">Attendance</h1>
          <p className="text-slate-400 text-sm">{format(new Date(filters.date), 'EEEE, MMMM d yyyy')}</p>
        </div>
        <div className="flex gap-2">
          {isAdmin && (
            <button onClick={() => setShowManual(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm transition-all">
              <UserCheck size={15} /> Manual Mark
            </button>
          )}
          <button onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2.5 bg-teal-500/10 hover:bg-teal-500/20 border border-teal-500/20 text-teal-400 rounded-xl text-sm transition-all">
            <Download size={15} /> Export CSV
          </button>
        </div>
      </div>

      <div className="grid lg:grid-cols-5 gap-6">
        {/* Left: Recognition + Recent */}
        <div className="lg:col-span-2 space-y-4">
          <RecognitionFeed onRecognized={handleRecognized} />

          {recentlyMarked.length > 0 && (
            <div className="spotlight bg-slate-900/45 backdrop-blur-xl border border-white/[0.07] rounded-2xl shadow-xl shadow-black/20 p-4">
              <p className="text-slate-400 text-xs font-medium mb-3">Recently Recognized</p>
              <div className="space-y-2">
                {recentlyMarked.map((r, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 bg-green-500/10 rounded-full flex items-center justify-center">
                        <span className="text-green-400 text-xs font-bold">{r.name?.charAt(0)}</span>
                      </div>
                      <div>
                        <p className="text-slate-200 text-xs font-medium">{r.name}</p>
                        <p className="text-slate-500 text-xs">{r.time}</p>
                      </div>
                    </div>
                    <span className="text-green-400 text-xs">{r.confidence}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: Records table */}
        <div className="lg:col-span-3 spotlight bg-slate-900/45 backdrop-blur-xl border border-white/[0.07] rounded-2xl shadow-xl shadow-black/20 overflow-hidden flex flex-col">
          {/* Filters */}
          <div className="flex gap-3 p-4 border-b border-slate-800">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="Search student..."
                value={filters.search}
                onChange={e => setFilters(p => ({ ...p, search: e.target.value }))}
                className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-teal-500"
              />
            </div>
            <input
              type="date"
              value={filters.date}
              onChange={e => setFilters(p => ({ ...p, date: e.target.value }))}
              className="bg-slate-800 border border-slate-700 text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-teal-500"
            />
            <button onClick={loadRecords} className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-xl transition-all">
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>

          {/* Summary chips */}
          <div className="flex gap-3 px-4 py-3 border-b border-slate-800">
            {[
              { label: 'Present', count: records.filter(r => r.status === 'present').length, color: 'text-green-400' },
              { label: 'Late', count: records.filter(r => r.status === 'late').length, color: 'text-amber-400' },
              { label: 'Total', count: records.length, color: 'text-teal-400' },
            ].map(({ label, count, color }) => (
              <div key={label} className="flex items-center gap-1.5 text-xs">
                <span className={`font-bold text-sm ${color}`}>{count}</span>
                <span className="text-slate-500">{label}</span>
              </div>
            ))}
          </div>

          {/* Table */}
          <div className="flex-1 overflow-auto">
            {loading ? (
              <div className="flex items-center justify-center h-40">
                <div className="w-8 h-8 border-3 border-teal-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-slate-600">
                <Scan size={28} className="mb-2 opacity-40" />
                <p className="text-sm">No attendance records for this date</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-slate-800/50 sticky top-0">
                  <tr>
                    {['Student', 'ID', 'Time', 'Status', 'Method'].map(h => (
                      <th key={h} className="text-left text-slate-400 text-xs px-4 py-3 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r, i) => (
                    <tr key={r._id}
                      className={`border-t border-slate-800/50 hover:bg-slate-800/30 transition-colors ${i === 0 ? 'animate-slide-up' : ''}`}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 bg-teal-500/10 rounded-full flex items-center justify-center flex-shrink-0">
                            <span className="text-teal-400 text-xs font-bold">{r.studentName?.charAt(0)}</span>
                          </div>
                          <span className="text-slate-200 truncate max-w-[120px]">{r.studentName}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-500 font-mono text-xs">{r.studentId}</td>
                      <td className="px-4 py-3 text-slate-400 font-mono text-xs">{r.time}</td>
                      <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                      <td className="px-4 py-3 text-slate-500 text-xs capitalize">{r.method?.replace('_', ' ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {showManual && (
        <ManualMarkModal onClose={() => setShowManual(false)} onMarked={() => { setShowManual(false); loadRecords(); }} />
      )}
    </div>
  );
}
