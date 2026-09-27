/**
 * RegisterPage — New user registration
 */

import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { Eye, EyeOff, UserCheck, ArrowRight, User, Mail, Lock, Hash, BookOpen } from 'lucide-react';

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: '', email: '', password: '', confirmPassword: '',
    role: 'student', studentId: '', department: '', semester: ''
  });
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);

  const onChange = (key, val) => setForm(p => ({ ...p, [key]: val }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.email || !form.password) return toast.error('Fill in required fields');
    if (form.password !== form.confirmPassword) return toast.error('Passwords do not match');
    if (form.role === 'student' && !form.studentId) return toast.error('Student ID is required');

    setLoading(true);
    try {
      const user = await register(form);
      toast.success(`Account created! Welcome, ${user.name.split(' ')[0]}! 🎉`);
      navigate('/dashboard');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const InputField = ({ label, icon: Icon, type = 'text', field, placeholder, required = false, children }) => (
    <div>
      <label className="block text-sm font-medium text-slate-300 mb-1.5">
        {label} {required && <span className="text-teal-400">*</span>}
      </label>
      {children || (
        <div className="relative">
          <Icon size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type={type}
            value={form[field]}
            onChange={e => onChange(field, e.target.value)}
            placeholder={placeholder}
            className="w-full bg-slate-900 border border-slate-700 text-white rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500/50 transition-all placeholder:text-slate-600"
          />
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen flex items-center justify-center p-6 font-sans">
      <div className="w-full max-w-lg animate-slide-up">
        {/* Logo */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-9 h-9 bg-gradient-to-br from-teal-400 to-teal-600 rounded-xl flex items-center justify-center">
            <UserCheck size={18} className="text-white" />
          </div>
          <span className="text-white font-display font-bold text-lg">SmartAttend</span>
        </div>

        <h1 className="text-3xl font-display font-bold text-white mb-1">Create account</h1>
        <p className="text-slate-400 mb-6">Join the smart attendance system</p>

        <div className="spotlight bg-slate-900/45 backdrop-blur-xl border border-white/[0.07] rounded-2xl shadow-xl shadow-black/20 p-6">
          {/* Role selector */}
          <div className="flex gap-2 mb-6">
            {['student', 'admin'].map(role => (
              <button
                key={role}
                type="button"
                onClick={() => onChange('role', role)}
                className={`flex-1 py-2.5 rounded-xl text-sm font-medium capitalize transition-all
                  ${form.role === role
                    ? 'bg-teal-500 text-white shadow-glow'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
              >
                {role}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <InputField label="Full Name" icon={User} field="name" placeholder="John Doe" required />
              <InputField label="Email" icon={Mail} type="email" field="email" placeholder="you@example.com" required />
            </div>

            {form.role === 'student' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <InputField label="Student ID" icon={Hash} field="studentId" placeholder="STU001" required />
                <InputField label="Department" icon={BookOpen} field="department" placeholder="Computer Science" />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">
                Password <span className="text-teal-400">*</span>
              </label>
              <div className="relative">
                <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type={showPass ? 'text' : 'password'}
                  value={form.password}
                  onChange={e => onChange('password', e.target.value)}
                  placeholder="Min 6 characters"
                  className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl pl-10 pr-12 py-2.5 text-sm focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500/50 transition-all placeholder:text-slate-600"
                />
                <button type="button" onClick={() => setShowPass(p => !p)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                  {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">
                Confirm Password <span className="text-teal-400">*</span>
              </label>
              <div className="relative">
                <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="password"
                  value={form.confirmPassword}
                  onChange={e => onChange('confirmPassword', e.target.value)}
                  placeholder="Repeat password"
                  className={`w-full bg-slate-800 border text-white rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none transition-all placeholder:text-slate-600
                    ${form.confirmPassword && form.password !== form.confirmPassword
                      ? 'border-red-500/50 focus:border-red-500'
                      : 'border-slate-700 focus:border-teal-500 focus:ring-1 focus:ring-teal-500/50'
                    }`}
                />
              </div>
              {form.confirmPassword && form.password !== form.confirmPassword && (
                <p className="text-red-400 text-xs mt-1">Passwords do not match</p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-teal-500 hover:bg-teal-400 disabled:bg-teal-500/50 text-white rounded-xl py-3 text-sm font-semibold transition-all flex items-center justify-center gap-2 shadow-glow mt-2"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              ) : (
                <>Create Account <ArrowRight size={16} /></>
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-slate-500 mt-4 text-sm">
          Already have an account?{' '}
          <Link to="/login" className="text-teal-400 hover:text-teal-300 font-medium">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
