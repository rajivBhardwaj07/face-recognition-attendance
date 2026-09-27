/**
 * StudentAttendancePage — Student views their own attendance history
 */

import React, { useState, useEffect } from 'react';
import { attendanceAPI } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { format, getMonth, getYear } from 'date-fns';
import { CalendarDays, TrendingUp, CheckCircle, Clock, XCircle, Download } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts';

const StatusBadge = ({ status }) => {
  const cfg = {
    present: { cls: 'bg-green-500/10 text-green-400', icon: CheckCircle },
    late: { cls: 'bg-amber-500/10 text-amber-400', icon: Clock },
    absent: { cls: 'bg-red-500/10 text-red-400', icon: XCircle },
  };
  const { cls, icon: Icon } = cfg[status] || cfg.present;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      <Icon size={10} /> {status}
    </span>
  );
};

export default function StudentAttendancePage() {
  const { user } = useAuth();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await attendanceAPI.getMy({ month, year });
      setData(res.data);
    } catch {
      toast.error('Failed to load attendance');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [month, year]);

  const handleExport = async () => {
    const paddedMonth = String(month).padStart(2, '0');
    const startDate = `${year}-${paddedMonth}-01`;
    const endDate = `${year}-${paddedMonth}-31`;
    try {
      const res = await attendanceAPI.exportCSV({ startDate, endDate });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `my_attendance_${year}_${paddedMonth}.csv`;
      a.click();
      toast.success('CSV downloaded!');
    } catch { toast.error('Export failed'); }
  };

  // Build calendar-style weekly bar data
  const weeklyData = data?.data?.reduce((acc, r) => {
    const week = `W${Math.ceil(parseInt(r.date.split('-')[2]) / 7)}`;
    const found = acc.find(a => a.week === week);
    if (found) {
      if (r.status === 'present') found.present++;
      else if (r.status === 'late') found.late++;
      else found.absent++;
    } else {
      acc.push({
        week,
        present: r.status === 'present' ? 1 : 0,
        late: r.status === 'late' ? 1 : 0,
        absent: r.status === 'absent' ? 1 : 0,
      });
    }
    return acc;
  }, []) || [];

  const stats = data?.stats;
  const pct = parseFloat(stats?.percentage || 0);

  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  return (
    <div className="space-y-6 animate-fade-in font-sans max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold text-white">My Attendance</h1>
          <p className="text-slate-400 text-sm">{user?.name} · {user?.studentId}</p>
        </div>
        <button onClick={handleExport}
          className="flex items-center gap-2 px-4 py-2.5 bg-teal-500/10 hover:bg-teal-500/20 border border-teal-500/20 text-teal-400 rounded-xl text-sm transition-all">
          <Download size={15} /> Export CSV
        </button>
      </div>

      {/* Month selector */}
      <div className="flex items-center gap-2 flex-wrap">
        <select value={month} onChange={e => setMonth(+e.target.value)}
          className="bg-slate-900 border border-slate-700 text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-teal-500">
          {months.map((m, i) => <option key={i} value={i+1}>{m}</option>)}
        </select>
        <select value={year} onChange={e => setYear(+e.target.value)}
          className="bg-slate-900 border border-slate-700 text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-teal-500">
          {[2024, 2025, 2026].map(y => <option key={y}>{y}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-10 h-10 border-4 border-teal-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* Stats row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Total', value: stats?.total, icon: CalendarDays, color: 'text-teal-400' },
              { label: 'Present', value: stats?.present, icon: CheckCircle, color: 'text-green-400' },
              { label: 'Late', value: stats?.late, icon: Clock, color: 'text-amber-400' },
              { label: 'Absent', value: stats?.absent, icon: XCircle, color: 'text-red-400' },
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} className="spotlight bg-slate-900/45 backdrop-blur-xl border border-white/[0.07] rounded-2xl shadow-xl shadow-black/20 p-5">
                <Icon size={18} className={`${color} mb-2`} />
                <p className="text-3xl font-display font-bold text-white">{value ?? 0}</p>
                <p className="text-slate-500 text-xs mt-1">{label}</p>
              </div>
            ))}
          </div>

          {/* Attendance rate + chart */}
          <div className="grid lg:grid-cols-3 gap-6">
            {/* Circular rate */}
            <div className="spotlight bg-slate-900/45 backdrop-blur-xl border border-white/[0.07] rounded-2xl shadow-xl shadow-black/20 p-6 flex flex-col items-center justify-center">
              <p className="text-slate-400 text-sm mb-4 flex items-center gap-2">
                <TrendingUp size={14} className="text-teal-400" /> Attendance Rate
              </p>
              <svg width="130" height="130" viewBox="0 0 130 130">
                <circle cx="65" cy="65" r="50" fill="none" stroke="#1e293b" strokeWidth="12" />
                <circle cx="65" cy="65" r="50" fill="none"
                  stroke={pct >= 75 ? '#22c55e' : pct >= 50 ? '#f59e0b' : '#ef4444'}
                  strokeWidth="12" strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 50}
                  strokeDashoffset={2 * Math.PI * 50 * (1 - pct / 100)}
                  transform="rotate(-90 65 65)"
                  style={{ transition: 'stroke-dashoffset 1.2s ease' }}
                />
                <text x="65" y="70" textAnchor="middle" fill="white" fontSize="24" fontWeight="bold">{pct}%</text>
              </svg>
              <p className={`mt-2 text-sm font-medium ${pct >= 75 ? 'text-green-400' : pct >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
                {pct >= 75 ? 'Excellent ✅' : pct >= 50 ? 'Needs Improvement ⚠️' : 'Critical ❌'}
              </p>
              {pct < 75 && (
                <p className="text-slate-500 text-xs mt-1 text-center">
                  Need {Math.max(0, Math.ceil((75 * stats?.total / 100) - (stats?.present + stats?.late)))} more classes for 75%
                </p>
              )}
            </div>

            {/* Weekly bar chart */}
            <div className="lg:col-span-2 spotlight bg-slate-900/45 backdrop-blur-xl border border-white/[0.07] rounded-2xl shadow-xl shadow-black/20 p-6">
              <h3 className="text-white font-semibold mb-4">Weekly Breakdown</h3>
              {weeklyData.length > 0 ? (
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={weeklyData} barSize={16}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="week" stroke="#475569" tick={{ fontSize: 11 }} />
                    <YAxis stroke="#475569" tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '10px', fontSize: 12 }}
                      labelStyle={{ color: '#94a3b8' }}
                    />
                    <Bar dataKey="present" name="Present" fill="#22c55e" radius={[4,4,0,0]} />
                    <Bar dataKey="late" name="Late" fill="#f59e0b" radius={[4,4,0,0]} />
                    <Bar dataKey="absent" name="Absent" fill="#ef4444" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-40 text-slate-600 text-sm">
                  No data for this month
                </div>
              )}
            </div>
          </div>

          {/* Records list */}
          <div className="spotlight bg-slate-900/45 backdrop-blur-xl border border-white/[0.07] rounded-2xl shadow-xl shadow-black/20 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-800">
              <h3 className="text-white font-semibold">Attendance Records</h3>
              <p className="text-slate-500 text-xs mt-0.5">{data?.data?.length || 0} records in {months[month-1]} {year}</p>
            </div>
            <div className="overflow-auto max-h-96">
              {data?.data?.length === 0 ? (
                <div className="flex flex-col items-center py-12 text-slate-600">
                  <CalendarDays size={28} className="mb-2 opacity-40" />
                  <p className="text-sm">No records for this period</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-slate-800/60 sticky top-0">
                    <tr>
                      {['Date', 'Day', 'Time', 'Status', 'Subject', 'Method'].map(h => (
                        <th key={h} className="text-left text-slate-400 text-xs px-4 py-3 font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data?.data?.map((r, i) => (
                      <tr key={r._id} className="border-t border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                        <td className="px-4 py-3 text-slate-200 font-mono text-xs">{r.date}</td>
                        <td className="px-4 py-3 text-slate-400 text-xs">
                          {format(new Date(r.date), 'EEE')}
                        </td>
                        <td className="px-4 py-3 text-slate-400 font-mono text-xs">{r.time}</td>
                        <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                        <td className="px-4 py-3 text-slate-500 text-xs">{r.subject || 'General'}</td>
                        <td className="px-4 py-3 text-slate-500 text-xs capitalize">{r.method?.replace('_', ' ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
