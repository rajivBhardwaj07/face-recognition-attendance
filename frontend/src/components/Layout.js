/**
 * Layout — Sidebar + Top bar wrapper
 */

import React, { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import {
  LayoutDashboard, Camera, ClipboardList, Users, LogOut,
  Menu, X, Sun, Moon, UserCheck, ChevronRight, Scan
} from 'lucide-react';

const NavItem = ({ to, icon: Icon, label, onClick }) => (
  <NavLink
    to={to}
    onClick={onClick}
    className={({ isActive }) =>
      `flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 group
      ${isActive
        ? 'bg-teal-500/10 text-teal-400 border border-teal-500/20 shadow-glow'
        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
      }`
    }
  >
    <Icon size={18} />
    <span>{label}</span>
    <ChevronRight size={14} className="ml-auto opacity-0 group-hover:opacity-50 transition-opacity" />
  </NavLink>
);

export default function Layout() {
  const { user, logout, isAdmin } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const adminLinks = [
    { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/attendance', icon: Scan, label: 'Mark Attendance' },
    { to: '/face-register', icon: Camera, label: 'Register Face' },
    { to: '/admin', icon: Users, label: 'Admin Panel' },
  ];

  const studentLinks = [
    { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/my-attendance', icon: ClipboardList, label: 'My Attendance' },
    { to: '/face-register', icon: Camera, label: 'Register Face' },
  ];

  const links = isAdmin ? adminLinks : studentLinks;

  const Sidebar = ({ mobile = false }) => (
    <div className={`flex flex-col h-full ${mobile ? '' : 'py-6'}`}>
      {/* Logo */}
      <div className="px-6 mb-8">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-gradient-to-br from-teal-400 to-teal-600 rounded-xl flex items-center justify-center shadow-glow">
            <UserCheck size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-white font-display font-bold text-base leading-tight">SmartAttend</h1>
            <p className="text-teal-500 text-xs font-mono">Face Recognition</p>
          </div>
        </div>
      </div>

      {/* Nav links */}
      <nav className="flex-1 px-3 space-y-1">
        {links.map(link => (
          <NavItem key={link.to} {...link} onClick={() => mobile && setSidebarOpen(false)} />
        ))}
      </nav>

      {/* User card */}
      <div className="px-3 pt-4 border-t border-slate-800">
        <div className="bg-slate-800/50 rounded-xl p-3 mb-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-to-br from-teal-500 to-cyan-600 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
              {user?.name?.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-slate-200 text-sm font-medium truncate">{user?.name}</p>
              <p className="text-slate-500 text-xs capitalize">{user?.role}</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={toggleTheme}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 text-xs transition-all"
          >
            {isDark ? <Sun size={14} /> : <Moon size={14} />}
            {isDark ? 'Light' : 'Dark'}
          </button>
          <button
            onClick={handleLogout}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-red-400 hover:text-red-300 hover:bg-red-500/10 text-xs transition-all"
          >
            <LogOut size={14} />
            Logout
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex font-sans">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex flex-col w-64 bg-slate-900/40 backdrop-blur-xl border-r border-white/5 flex-shrink-0">
        <Sidebar />
      </aside>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setSidebarOpen(false)} />
          <aside className="relative w-72 h-full bg-slate-900/90 backdrop-blur-xl border-r border-white/5 flex flex-col py-6">
            <button
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
              onClick={() => setSidebarOpen(false)}
            >
              <X size={20} />
            </button>
            <Sidebar mobile />
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile top bar */}
        <header className="lg:hidden flex items-center justify-between px-4 py-3 bg-slate-900/60 backdrop-blur-xl border-b border-white/5">
          <button onClick={() => setSidebarOpen(true)} className="text-slate-400 hover:text-white">
            <Menu size={22} />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-teal-500 rounded-lg flex items-center justify-center">
              <UserCheck size={13} className="text-white" />
            </div>
            <span className="text-white font-bold text-sm">SmartAttend</span>
          </div>
          <button onClick={toggleTheme} className="text-slate-400 hover:text-white">
            {isDark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto p-4 lg:p-8 animate-fade-in">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
