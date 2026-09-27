/**
 * DashboardPage — Main analytics dashboard
 * Admin: system-wide stats + charts
 * Student: personal attendance stats
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { adminAPI, attendanceAPI } from '../utils/api';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, BarChart, Bar
} from 'recharts';
import { Users, UserCheck, UserX, Clock, TrendingUp, Activity, Camera, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { format, subDays } from 'date-fns';

// ─── Stat Card ────────────────────────────────────────────────────────────────
const StatCard = ({ icon: Icon, label, value, sub, color = 'teal', trend }) => {
  const colors = {
    teal: 'from-teal-500/10 to-teal-500/5 border-teal-500/20 text-teal-400',
    green: 'from-green-500/10 to-green-500/5 border-green-500/20 text-green-400',
    red: 'from-red-500/10 to-red-500/5 border-red-500/20 text-red-400',
    amber: 'from-amber-500/10 to-amber-500/5 border-amber-500/20 text-amber-400',
  };

  return (
    <div className={`bg-gradient-to-br ${colors[color]} border rounded-2xl p-5 animate-slide-up spotlight`}>
      <div className="flex items-start justify-between mb-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center bg-current/10`}>
          <Icon size={20} className="opacity-80" />
        </div>
        {trend !== undefined && (
          <span className={`text-xs font-mono px-2 py-0.5 rounded-full bg-current/10`}>
            {trend > 0 ? '+' : ''}{trend}%
          </span>
        )}
      </div>
      <p className="text-slate-400 text-xs mb-1">{label}</p>
      <p className="text-white text-3xl font-display font-bold">{value ?? '—'}</p>
      {sub && <p className="text-slate-500 text-xs mt-1">{sub}</p>}
    </div>
  );
};

// ─── Custom Tooltip ───────────────────────────────────────────────────────────
const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm shadow-xl">
      <p className="text-slate-400 mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }} className="font-semibold">
          {p.name}: {p.value}
        </p>
      ))}
    </div>
  );
};

// ─── Admin Dashboard ──────────────────────────────────────────────────────────
const AdminDashboard = () => {
  const [data, setData] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [dashRes, statsRes] = await Promise.all([
        adminAPI.getDashboard(),
        attendanceAPI.getStats()
      ]);
      setData(dashRes.data.data);
      setStats(statsRes.data.data);
    } catch (e) {
      toast.error('Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-10 h-10 border-4 border-teal-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!data) return null;

  const COLORS = ['#14b8a6', '#0ea5e9', '#a855f7', '#f59e0b'];

  const pieData = stats?.departmentStats?.map(d => ({
    name: d._id || 'Unknown', value: d.count
  })) || [];

  const areaData = stats?.monthlyTrend?.map(d => ({
    date: format(new Date(`${d._id}T00:00:00`), 'MMM d'),
    present: d.present,
    late: d.late
  })) || [];

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Users} label="Total Students" value={data.totalStudents} color="teal" />
        <StatCard icon={UserCheck} label="Present Today" value={data.todayPresent}
          sub={`${data.todayAttendanceRate}% attendance rate`} color="green" />
        <StatCard icon={UserX} label="Absent Today" value={data.todayAbsent} color="red" />
        <StatCard icon={Camera} label="Face Registered" value={data.faceRegistered}
          sub={`${data.notRegistered} pending`} color="amber" />
      </div>

      {/* Charts */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Trend area chart */}
        <div className="lg:col-span-2 spotlight bg-slate-900/45 backdrop-blur-xl border border-white/[0.07] rounded-2xl shadow-xl shadow-black/20 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-white font-semibold">Attendance Trend</h3>
              <p className="text-slate-500 text-xs">Last 30 days</p>
            </div>
            <TrendingUp size={18} className="text-teal-400" />
          </div>
          {areaData.length === 0 ? (
            <div className="h-[200px] flex items-center justify-center text-slate-500 text-sm">
              No attendance recorded in the last 30 days
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={areaData}>
                <defs>
                  <linearGradient id="tealGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#14b8a6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#14b8a6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="amberGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="date" stroke="#475569" tick={{ fontSize: 11 }} minTickGap={16} />
                <YAxis stroke="#475569" tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area type="monotone" dataKey="present" name="On Time" stackId="1"
                  stroke="#14b8a6" fill="url(#tealGrad)" strokeWidth={2} />
                <Area type="monotone" dataKey="late" name="Late" stackId="1"
                  stroke="#f59e0b" fill="url(#amberGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Dept pie */}
        <div className="spotlight bg-slate-900/45 backdrop-blur-xl border border-white/[0.07] rounded-2xl shadow-xl shadow-black/20 p-6">
          <h3 className="text-white font-semibold mb-1">By Department</h3>
          <p className="text-slate-500 text-xs mb-4">Today's attendance</p>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80}
                  paddingAngle={3} dataKey="value">
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
                <Legend iconSize={10} iconType="circle"
                  formatter={v => <span className="text-slate-400 text-xs">{v}</span>} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-48 text-slate-600 text-sm">
              No data for today
            </div>
          )}
        </div>
      </div>

      {/* Recent activity */}
      <div className="spotlight bg-slate-900/45 backdrop-blur-xl border border-white/[0.07] rounded-2xl shadow-xl shadow-black/20 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-semibold">Recent Activity</h3>
          <button onClick={load} className="text-slate-400 hover:text-teal-400 transition-colors">
            <RefreshCw size={15} />
          </button>
        </div>
        <div className="space-y-2">
          {data.recentActivity?.length > 0 ? data.recentActivity.map((r, i) => (
            <div key={i} className="flex items-center justify-between py-2 px-3 rounded-xl hover:bg-slate-800/50 transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-teal-500/10 rounded-full flex items-center justify-center">
                  <span className="text-teal-400 text-xs font-bold">
                    {r.studentName?.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div>
                  <p className="text-slate-200 text-sm">{r.studentName}</p>
                  <p className="text-slate-500 text-xs font-mono">{r.studentId}</p>
                </div>
              </div>
              <div className="text-right">
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium
                  ${r.status === 'present' ? 'bg-green-500/10 text-green-400'
                    : r.status === 'late' ? 'bg-amber-500/10 text-amber-400'
                    : 'bg-red-500/10 text-red-400'}`}>
                  {r.status}
                </span>
                <p className="text-slate-600 text-xs mt-0.5">{r.time}</p>
              </div>
            </div>
          )) : (
            <p className="text-center text-slate-600 py-8 text-sm">No recent activity</p>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Student Dashboard ────────────────────────────────────────────────────────
const StudentDashboard = () => {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await attendanceAPI.getMy();
        setData(res.data);
      } catch {
        toast.error('Failed to load attendance');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-10 h-10 border-4 border-teal-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const stats = data?.stats;
  const pct = parseFloat(stats?.percentage || 0);
  const circumference = 2 * Math.PI * 45;
  const strokeDashoffset = circumference * (1 - pct / 100);

  // Last 7 days bar chart
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const d = subDays(new Date(), 6 - i);
    const dateStr = format(d, 'yyyy-MM-dd');
    const record = data?.data?.find(r => r.date === dateStr);
    return {
      day: format(d, 'EEE'),
      status: record ? (record.status === 'present' ? 1 : record.status === 'late' ? 0.5 : 0) : null
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-white">
          Good {new Date().getHours() < 12 ? 'morning' : 'afternoon'},{' '}
          <span className="text-teal-400">{user?.name?.split(' ')[0]}</span>
        </h1>
        <p className="text-slate-400 text-sm mt-1">Here's your attendance overview</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Activity} label="Total Classes" value={stats?.total} color="teal" />
        <StatCard icon={UserCheck} label="Present" value={stats?.present} color="green" />
        <StatCard icon={Clock} label="Late" value={stats?.late} color="amber" />
        <StatCard icon={UserX} label="Absent" value={stats?.absent} color="red" />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Circular progress */}
        <div className="spotlight bg-slate-900/45 backdrop-blur-xl border border-white/[0.07] rounded-2xl shadow-xl shadow-black/20 p-6 flex flex-col items-center justify-center">
          <p className="text-slate-400 text-sm mb-4">Attendance Rate</p>
          <svg width="120" height="120" viewBox="0 0 120 120">
            <circle cx="60" cy="60" r="45" fill="none" stroke="#1e293b" strokeWidth="10" />
            <circle cx="60" cy="60" r="45" fill="none" stroke="#14b8a6" strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              transform="rotate(-90 60 60)"
              style={{ transition: 'stroke-dashoffset 1s ease' }}
            />
            <text x="60" y="64" textAnchor="middle" fill="white" fontSize="22" fontWeight="bold">
              {pct}%
            </text>
          </svg>
          <p className={`mt-3 text-sm font-medium ${pct >= 75 ? 'text-green-400' : pct >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
            {pct >= 75 ? '✅ Good standing' : pct >= 50 ? '⚠️ Needs improvement' : '❌ Critical — improve attendance'}
          </p>
        </div>

        {/* Last 7 days */}
        <div className="lg:col-span-2 spotlight bg-slate-900/45 backdrop-blur-xl border border-white/[0.07] rounded-2xl shadow-xl shadow-black/20 p-6">
          <h3 className="text-white font-semibold mb-4">Last 7 Days</h3>
          <div className="flex items-end gap-3 h-24">
            {last7Days.map((d, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div
                  className={`w-full rounded-t-lg transition-all duration-500 ${
                    d.status === null ? 'bg-slate-800' :
                    d.status === 1 ? 'bg-teal-500' :
                    d.status === 0.5 ? 'bg-amber-500' : 'bg-red-500'
                  }`}
                  style={{ height: d.status !== null ? `${Math.max(d.status * 80, 8)}px` : '8px' }}
                />
                <p className="text-slate-500 text-xs">{d.day}</p>
              </div>
            ))}
          </div>
          <div className="flex gap-4 mt-4 text-xs">
            {[['bg-teal-500', 'Present'], ['bg-amber-500', 'Late'], ['bg-red-500', 'Absent'], ['bg-slate-800', 'No class']].map(([c, l]) => (
              <div key={l} className="flex items-center gap-1.5">
                <div className={`w-2 h-2 rounded-full ${c}`} />
                <span className="text-slate-500">{l}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Main Export ──────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { isAdmin } = useAuth();
  return (
    <div className="animate-fade-in">
      {isAdmin ? <AdminDashboard /> : <StudentDashboard />}
    </div>
  );
}
