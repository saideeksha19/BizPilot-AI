import React, { useState } from 'react';
import { Lock, LogIn, ShieldCheck, UserPlus } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Modal } from '../common/Modal';

export function AuthModal() {
  const {
    authModalOpen,
    setAuthModalOpen,
    loginWithBackend,
    registerWithBackend,
  } = useApp();

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleClose = () => {
    if (submitting) return;
    setAuthModalOpen(false);
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const cleanEmail = email.trim();
    if (!cleanEmail || !password) {
      setError('Email and password are required.');
      return;
    }
    if (mode === 'register') {
      if (!fullName.trim()) {
        setError('Full name is required to create an account.');
        return;
      }
      if (password.length < 8) {
        setError('Password must be at least 8 characters.');
        return;
      }
    }

    setSubmitting(true);
    try {
      if (mode === 'login') {
        await loginWithBackend(cleanEmail, password);
      } else {
        await registerWithBackend(fullName.trim(), cleanEmail, password);
      }
      setPassword('');
      setAuthModalOpen(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Authentication failed.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={authModalOpen}
      onClose={handleClose}
      title={mode === 'login' ? 'Sign In to BizPilot AI' : 'Create BizPilot AI Account'}
      subtitle="Connect your workspace to the live PostgreSQL financial engine & Gemini Copilot"
      maxWidthClass="max-w-md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-slate-100 dark:bg-white/[0.04]">
          <button
            type="button"
            onClick={() => {
              setMode('login');
              setError('');
            }}
            className={`py-2 text-xs font-medium rounded-md transition-colors flex items-center justify-center gap-1.5 ${
              mode === 'login'
                ? 'bg-white dark:bg-[#2e4152] text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            <LogIn className="w-3.5 h-3.5" />
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('register');
              setError('');
            }}
            className={`py-2 text-xs font-medium rounded-md transition-colors flex items-center justify-center gap-1.5 ${
              mode === 'register'
                ? 'bg-white dark:bg-[#2e4152] text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            <UserPlus className="w-3.5 h-3.5" />
            Register
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs text-rose-600 dark:text-rose-400">
            {error}
          </div>
        )}

        {mode === 'register' && (
          <div>
            <label htmlFor="auth-fullname" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Full Name *
            </label>
            <input
              id="auth-fullname"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g., Ananya Deshmukh"
              required
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-500/40"
            />
          </div>
        )}

        <div>
          <label htmlFor="auth-email" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
            Work Email *
          </label>
          <input
            id="auth-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="founder@company.com"
            required
            className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-500/40"
          />
        </div>

        <div>
          <label htmlFor="auth-password" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
            Password *
          </label>
          <div className="relative">
            <Lock className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              id="auth-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === 'register' ? 'Minimum 8 characters' : 'Enter password'}
              required
              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-500/40"
            />
          </div>
        </div>

        <div className="p-3 rounded-lg bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/8 flex items-start gap-2 text-[11px] text-slate-500 dark:text-slate-400">
          <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
          <span>
            Authenticated workspaces enforce multi-tenant RBAC isolation, Decimal accounting, and backend-only Gemini Copilot reasoning. Unauthenticated sessions stay safely in local Illustrative Demo Mode.
          </span>
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-200 dark:border-white/8">
          <button
            type="button"
            onClick={handleClose}
            disabled={submitting}
            className="px-3.5 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5"
          >
            Continue in Demo Mode
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 text-xs font-medium rounded-lg bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white"
          >
            {submitting
              ? mode === 'login'
                ? 'Signing in...'
                : 'Creating account...'
              : mode === 'login'
              ? 'Sign In'
              : 'Create Account'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
