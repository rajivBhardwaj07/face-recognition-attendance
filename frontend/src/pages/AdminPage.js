/**
 * AdminPage — Full student & user management panel
 */

import React, { useState, useEffect, useCallback } from 'react';
import { studentsAPI, adminAPI, attendanceAPI } from '../utils/api';
import toast from 'react-hot-toast';
import {
  Users, UserPlus, Trash2, Edit2, Search, Filter,
  Download, RefreshCw, CheckCircle, XCircle, Camera,
  ChevronLeft, ChevronRight, ToggleLeft, ToggleRight, BarChart2
} from 'lucide-react';
import { format } from 'date-fns';

// ─── Add Student Modal ────────────────────────────────────────────────────────

/**
 * Must stay at module scope. Defining this inside AddStudentModal creates a new
 * component type on every render, so React unmounts/remounts the <input> after
 * each keystroke and the field loses focus.
 */
const Field = ({ label, value, onChange, type = 'text', placeholder, required }) => (
  <div>
    <label className="block text-xs font-medium text-slate-400 mb-1.5">
      {label}{required && <span className="text-teal-400 ml-0.5">*</span>}
    </label>
    <input
      type={type} value={value} placeholder={placeholder} required={required}
      onChange={onChange}
      className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-teal-500 placeholder:text-slate-600"
    />
  </div>
);

const AddStudentModal = ({ onClose, onAdded }) => {
  const [form, setForm] = useState({
    name: '', email: '', password: '', studentId: '', department: '', semester: 1
  });
  const [loading, setLoading] = useState(false);

  const set = field => e => setForm(p => ({ ...p, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.email || !form.password || !form.studentId) {
      return toast.error('Fill all required fields');
    }
    if (form.password.length < 6) {
      return toast.error('Password must be at least 6 characters');
    }
    setLoading(true);
    try {
      const res = await adminAPI.bulkCreateStudents({ students: [{ ...form, role: 'student' }] });

      // The bulk endpoint reports per-student failures in results.errors, so a
      // 2xx response does not by itself mean the student was created.
      const errors = res.data?.results?.errors || [];
      if (errors.length > 0) {
        toast.error(errors[0].error || 'Failed to add student');
        return; // keep the modal open so the admin can correct the input
      }

      toast.success(`Student ${form.name} added!`);
      onAdded();
      onClose();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to add student');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md p-6 animate-slide-up">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-white font-semibold text-lg flex items-center gap-2">
            <UserPlus size={18} className="text-teal-400" /> Add Student
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-2xl leading-none">×</button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Full Name" value={form.name} onChange={set('name')} placeholder="John Doe" required />
            <Field label="Student ID" value={form.studentId} onChange={set('studentId')} placeholder="STU001" required />
          </div>
          <Field label="Email" value={form.email} onChange={set('email')} type="email" placeholder="student@college.edu" required />
          <Field label="Password" value={form.password} onChange={set('password')} type="password" placeholder="Min 6 chars" required />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Department" value={form.department} onChange={set('department')} placeholder="Computer Science" />
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Semester</label>
              <select value={form.semester} onChange={e => setForm(p => ({ ...p, semester: +e.target.value }))}
                className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-teal-500">
                {Array.from({ length: 8 }, (_, i) => i + 1).map(s => (
                  <option key={s} value={s}>Semester {s}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-xl text-sm transition-all">
              Cancel
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 py-2.5 bg-teal-500 hover:bg-teal-400 disabled:opacity-50 text-white rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2">
              {loading ? <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : 'Add Student'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ─── Student Detail Modal ─────────────────────────────────────────────────────
const StudentDetailModal = ({ student, onClose, onUpdate }) => {
  const [records, setRecords] = useState([]);
  const [loadingRec, setLoadingRec] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ department: student.department, semester: student.semester });

  useEffect(() => {
    attendanceAPI.getAll({ studentId: student.studentId, limit: 30 })
      .then(r => setRecords(r.data.data))
      .catch(() => {})
      .finally(() => setLoadingRec(false));
  }, [student.studentId]);

  const saveEdit = async () => {
    try {
      await studentsAPI.update(student._id, form);
      toast.success('Student updated');
      onUpdate();
      setEditing(false);
    } catch { toast.error('Update failed'); }
  };

  const totalPresent = records.filter(r => r.status === 'present').length;
  const pct = records.length > 0 ? ((totalPresent / records.length) * 100).toFixed(1) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-slide-up">
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-slate-800">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-gradient-to-br from-teal-500 to-cyan-600 rounded-2xl flex items-center justify-center text-white text-2xl font-bold">
              {student.name?.charAt(0)}
            </div>
            <div>
              <h2 className="text-white font-semibold text-lg">{student.name}</h2>
              <p className="text-slate-400 text-sm">{student.studentId}</p>
              <div className="flex items-center gap-2 mt-1">
                {student.isFaceRegistered
                  ? <span className="text-xs bg-green-500/10 text-green-400 px-2 py-0.5 rounded-full flex items-center gap-1"><CheckCircle size={10} /> Face Registered</span>
                  : <span className="text-xs bg-slate-700 text-slate-400 px-2 py-0.5 rounded-full flex items-center gap-1"><Camera size={10} /> No Face Data</span>
                }
              </div>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-2xl leading-none">×</button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 p-6 border-b border-slate-800">
          <div className="bg-slate-800/50 rounded-xl p-4 text-center">
            <p className="text-3xl font-display font-bold text-white">{records.length}</p>
            <p className="text-slate-400 text-xs mt-1">Total Classes</p>
          </div>
          <div className="bg-green-500/5 border border-green-500/20 rounded-xl p-4 text-center">
            <p className="text-3xl font-display font-bold text-green-400">{totalPresent}</p>
            <p className="text-slate-400 text-xs mt-1">Present</p>
          </div>
          <div className={`rounded-xl p-4 text-center border ${parseFloat(pct) >= 75 ? 'bg-teal-500/5 border-teal-500/20' : 'bg-red-500/5 border-red-500/20'}`}>
            <p className={`text-3xl font-display font-bold ${parseFloat(pct) >= 75 ? 'text-teal-400' : 'text-red-400'}`}>{pct}%</p>
            <p className="text-slate-400 text-xs mt-1">Rate</p>
          </div>
        </div>

        {/* Info / Edit */}
        <div className="p-6 border-b border-slate-800">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-white font-medium text-sm">Student Info</h3>
            <button onClick={() => setEditing(!editing)}
              className="text-xs text-teal-400 hover:text-teal-300 flex items-center gap-1">
              <Edit2 size={12} /> {editing ? 'Cancel' : 'Edit'}
            </button>
          </div>
          {editing ? (
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Department</label>
                <input value={form.department || ''} onChange={e => setForm(p => ({ ...p, department: e.target.value }))}
                  className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:border-teal-500" />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Semester</label>
                <select value={form.semester || 1} onChange={e => setForm(p => ({ ...p, semester: +e.target.value }))}
                  className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:border-teal-500">
                  {Array.from({ length: 8 }, (_, i) => i + 1).map(s => <option key={s} value={s}>Semester {s}</option>)}
                </select>
              </div>
              <button onClick={saveEdit} className="w-full py-2.5 bg-teal-500 hover:bg-teal-400 text-white rounded-xl text-sm font-medium">Save Changes</button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 text-sm">
              {[
                ['Email', student.email],
                ['Department', student.department || 'N/A'],
                ['Semester', student.semester ? `Semester ${student.semester}` : 'N/A'],
                ['Registered', format(new Date(student.createdAt), 'MMM d, yyyy')],
              ].map(([k, v]) => (
                <div key={k} className="bg-slate-800/40 rounded-lg px-3 py-2.5">
                  <p className="text-slate-500 text-xs">{k}</p>
                  <p className="text-slate-200 mt-0.5 truncate">{v}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent records */}
        <div className="p-6">
          <h3 className="text-white font-medium text-sm mb-3">Recent Attendance</h3>
          {loadingRec ? (
            <div className="flex justify-center py-6">
              <div className="w-6 h-6 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : records.length === 0 ? (
            <p className="text-slate-600 text-sm text-center py-4">No attendance records yet</p>
          ) : (
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {records.slice(0, 15).map(r => (
                <div key={r._id} className="flex items-center justify-between px-3 py-2 bg-slate-800/40 rounded-lg">
                  <span className="text-slate-400 text-xs font-mono">{r.date}</span>
                  <span className="text-slate-500 text-xs">{r.time}</span>
                  <span className={`text-xs capitalize px-2 py-0.5 rounded-full
                    ${r.status === 'present' ? 'bg-green-500/10 text-green-400'
                      : r.status === 'late' ? 'bg-amber-500/10 text-amber-400'
                      : 'bg-red-500/10 text-red-400'}`}>
                    {r.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Main Admin Page ──────────────────────────────────────────────────────────
export default function AdminPage() {
  const [students, setStudents] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ search: '', department: '', isFaceRegistered: '' });
  const [showAdd, setShowAdd] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [activeTab, setActiveTab] = useState('students'); // students | overview
  const [dashData, setDashData] = useState(null);

  const LIMIT = 15;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: LIMIT, ...filters };
      if (!params.isFaceRegistered) delete params.isFaceRegistered;
      const res = await studentsAPI.getAll(params);
      setStudents(res.data.data);
      setTotal(res.data.total);
    } catch { toast.error('Failed to load students'); }
    finally { setLoading(false); }
  }, [page, filters]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    adminAPI.getDashboard().then(r => setDashData(r.data.data)).catch(() => {});
  }, []);

  const handleDelete = async (student) => {
    if (!window.confirm(`Delete ${student.name}? This will remove all their attendance records too.`)) return;
    try {
      await studentsAPI.delete(student._id);
      toast.success('Student deleted');
      load();
    } catch { toast.error('Delete failed'); }
  };

  const handleExportAll = async () => {
    try {
      const res = await attendanceAPI.exportCSV({});
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `all_attendance_${format(new Date(), 'yyyy-MM-dd')}.csv`;
      a.click();
      toast.success('Full attendance exported!');
    } catch { toast.error('Export failed'); }
  };

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div className="space-y-6 animate-fade-in font-sans">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold text-white">Admin Panel</h1>
          <p className="text-slate-400 text-sm">Manage students, attendance records and system settings</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleExportAll}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm transition-all">
            <Download size={15} /> Export All
          </button>
          <button onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-teal-500 hover:bg-teal-400 text-white rounded-xl text-sm font-medium shadow-glow transition-all">
            <UserPlus size={15} /> Add Student
          </button>
        </div>
      </div>

      {/* Quick stats */}
      {dashData && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Total Students', value: dashData.totalStudents, color: 'text-teal-400' },
            { label: 'Face Registered', value: dashData.faceRegistered, color: 'text-green-400' },
            { label: 'Present Today', value: dashData.todayPresent, color: 'text-blue-400' },
            { label: 'Attendance Rate', value: `${dashData.todayAttendanceRate}%`, color: 'text-amber-400' },
          ].map(({ label, value, color }) => (
            <div key={label} className="spotlight bg-slate-900/45 backdrop-blur-xl border border-white/[0.07] rounded-2xl shadow-xl shadow-black/20 p-4">
              <p className={`text-2xl font-display font-bold ${color}`}>{value}</p>
              <p className="text-slate-500 text-xs mt-1">{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="spotlight bg-slate-900/45 backdrop-blur-xl border border-white/[0.07] rounded-2xl shadow-xl shadow-black/20 p-4 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text" placeholder="Search by name, ID or email..."
            value={filters.search}
            onChange={e => { setFilters(p => ({ ...p, search: e.target.value })); setPage(1); }}
            className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:border-teal-500 placeholder:text-slate-600"
          />
        </div>
        <input
          type="text" placeholder="Department..."
          value={filters.department}
          onChange={e => { setFilters(p => ({ ...p, department: e.target.value })); setPage(1); }}
          className="bg-slate-800 border border-slate-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-teal-500 placeholder:text-slate-600 w-40"
        />
        <select
          value={filters.isFaceRegistered}
          onChange={e => { setFilters(p => ({ ...p, isFaceRegistered: e.target.value })); setPage(1); }}
          className="bg-slate-800 border border-slate-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-teal-500">
          <option value="">All Face Status</option>
          <option value="true">Face Registered</option>
          <option value="false">Not Registered</option>
        </select>
        <button onClick={load} className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-xl transition-all">
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Students table */}
      <div className="spotlight bg-slate-900/45 backdrop-blur-xl border border-white/[0.07] rounded-2xl shadow-xl shadow-black/20 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="text-white font-semibold">Students</h3>
            <p className="text-slate-500 text-xs mt-0.5">{total} total students</p>
          </div>
          <span className="text-slate-400 text-xs">Page {page} of {totalPages || 1}</span>
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <div className="w-8 h-8 border-3 border-teal-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : students.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-slate-600">
              <Users size={32} className="mb-2 opacity-40" />
              <p className="text-sm">No students found</p>
              <button onClick={() => setShowAdd(true)} className="mt-3 text-teal-400 text-xs hover:text-teal-300">
                + Add your first student
              </button>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-800/50">
                <tr>
                  {['Student', 'ID', 'Department', 'Semester', 'Face', 'Registered', 'Actions'].map(h => (
                    <th key={h} className="text-left text-slate-400 text-xs px-4 py-3.5 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {students.map((s, i) => (
                  <tr key={s._id}
                    className="border-t border-slate-800/50 hover:bg-slate-800/30 transition-colors cursor-pointer"
                    onClick={() => setSelectedStudent(s)}>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-gradient-to-br from-teal-500/20 to-cyan-500/20 border border-teal-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
                          <span className="text-teal-400 text-sm font-bold">{s.name?.charAt(0)}</span>
                        </div>
                        <div>
                          <p className="text-slate-200 font-medium">{s.name}</p>
                          <p className="text-slate-500 text-xs">{s.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-slate-400 font-mono text-xs">{s.studentId}</td>
                    <td className="px-4 py-3.5 text-slate-400 text-xs">{s.department || '—'}</td>
                    <td className="px-4 py-3.5 text-slate-400 text-xs">{s.semester ? `Sem ${s.semester}` : '—'}</td>
                    <td className="px-4 py-3.5">
                      {s.isFaceRegistered
                        ? <span className="inline-flex items-center gap-1 text-xs text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full"><CheckCircle size={10} /> Registered</span>
                        : <span className="inline-flex items-center gap-1 text-xs text-slate-500 bg-slate-800 px-2 py-0.5 rounded-full"><XCircle size={10} /> Pending</span>
                      }
                    </td>
                    <td className="px-4 py-3.5 text-slate-500 text-xs">
                      {s.createdAt ? format(new Date(s.createdAt), 'MMM d, yyyy') : '—'}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => setSelectedStudent(s)}
                          className="p-1.5 hover:bg-slate-700 text-slate-400 hover:text-teal-400 rounded-lg transition-all"
                          title="View details">
                          <BarChart2 size={14} />
                        </button>
                        <button
                          onClick={() => handleDelete(s)}
                          className="p-1.5 hover:bg-red-500/10 text-slate-400 hover:text-red-400 rounded-lg transition-all"
                          title="Delete student">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-5 py-4 border-t border-slate-800 flex items-center justify-between">
            <p className="text-slate-500 text-xs">Showing {(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, total)} of {total}</p>
            <div className="flex items-center gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="p-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-400 rounded-lg transition-all">
                <ChevronLeft size={15} />
              </button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const pageNum = page <= 3 ? i + 1 : page - 2 + i;
                if (pageNum > totalPages) return null;
                return (
                  <button key={pageNum} onClick={() => setPage(pageNum)}
                    className={`w-8 h-8 rounded-lg text-xs font-medium transition-all
                      ${pageNum === page ? 'bg-teal-500 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>
                    {pageNum}
                  </button>
                );
              })}
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="p-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-400 rounded-lg transition-all">
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {showAdd && <AddStudentModal onClose={() => setShowAdd(false)} onAdded={load} />}
      {selectedStudent && (
        <StudentDetailModal
          student={selectedStudent}
          onClose={() => setSelectedStudent(null)}
          onUpdate={() => { setSelectedStudent(null); load(); }}
        />
      )}
    </div>
  );
}
