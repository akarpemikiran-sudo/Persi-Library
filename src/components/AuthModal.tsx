import React, { useEffect, useState } from 'react';
import { Lock, Shield, ShieldPlus, UserCheck, X } from 'lucide-react';
import type { UserProfile } from '../lib/types';

interface AuthModalProps {
  isOpen: boolean;
  initialRole?: 'member' | 'admin';
  onClose: () => void;
  onSuccess: (user: UserProfile, token: string) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  initialRole = 'member',
  onClose,
  onSuccess,
}) => {
  const [roleTab, setRoleTab] = useState<'member' | 'admin'>(initialRole);
  const [memberMode, setMemberMode] = useState<'login' | 'register'>('login');
  const [adminStatus, setAdminStatus] = useState<{
    claimed: boolean;
    superAdminClaimed: boolean;
    envConfigured: boolean;
    loaded: boolean;
  }>({ claimed: false, superAdminClaimed: false, envConfigured: false, loaded: false });

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setRoleTab(initialRole);
  }, [initialRole]);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    fetch('/api/auth/admin-status')
      .then((r) => r.json())
      .then((data: { claimed: boolean; superAdminClaimed?: boolean; envConfigured: boolean }) => {
        setAdminStatus({
          claimed: Boolean(data.claimed),
          superAdminClaimed: Boolean(data.superAdminClaimed ?? data.claimed),
          envConfigured: Boolean(data.envConfigured),
          loaded: true,
        });
      })
      .catch(() => {
        setAdminStatus((prev) => ({ ...prev, loaded: true }));
      });
  }, [isOpen]);

  if (!isOpen) return null;

  const isSuperAdminRegistrationRequired =
    roleTab === 'admin' && adminStatus.loaded && !adminStatus.superAdminClaimed;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      let endpoint = '/api/auth/login';
      let body: Record<string, string> = {
        email,
        password,
        role: roleTab,
      };

      if (isSuperAdminRegistrationRequired) {
        endpoint = '/api/auth/super-admin-register';
        body = { name, email, password };
      } else if (roleTab === 'member' && memberMode === 'register') {
        endpoint = '/api/auth/register';
        body = { name, email, password };
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as {
        user?: UserProfile;
        token?: string;
        error?: string;
      };
      if (!res.ok || !data.user || !data.token) {
        throw new Error(data.error || 'Otentikasi gagal.');
      }

      onSuccess(data.user, data.token);
      setName('');
      setEmail('');
      setPassword('');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal masuk ke sistem.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
    >
      <div className="w-full max-w-md rounded-2xl bg-white border border-slate-200 shadow-2xl p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="auth-modal-title" className="text-xl font-bold text-slate-900">
              {isSuperAdminRegistrationRequired
                ? 'Daftar Akun Super Admin'
                : 'Masuk ke PustakaKita'}
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {isSuperAdminRegistrationRequired
                ? 'Langkah awal wajib sebelum masuk ke Dasbor Admin perpustakaan.'
                : 'Akses peminjaman QR, pembaca PDF terproteksi, atau dasbor pengelola.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup dialog login"
            className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Role Switcher */}
        <div className="mt-5 grid grid-cols-2 gap-1 p-1 rounded-xl bg-slate-100">
          <button
            type="button"
            onClick={() => {
              setRoleTab('member');
              setError(null);
            }}
            className={`inline-flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition-colors whitespace-nowrap ${
              roleTab === 'member'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <UserCheck className="w-4 h-4" />
            Anggota (Member)
          </button>
          <button
            type="button"
            onClick={() => {
              setRoleTab('admin');
              setError(null);
            }}
            className={`inline-flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition-colors whitespace-nowrap ${
              roleTab === 'admin'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Shield className="w-4 h-4" />
            Admin Pustaka
          </button>
        </div>

        {roleTab === 'member' && (
          <div className="mt-4 flex items-center justify-between text-xs border-b border-slate-200 pb-3">
            <span className="text-slate-600">
              {memberMode === 'login' ? 'Belum punya kartu anggota?' : 'Sudah terdaftar?'}
            </span>
            <button
              type="button"
              onClick={() => {
                setMemberMode(memberMode === 'login' ? 'register' : 'login');
                setError(null);
              }}
              className="font-semibold text-teal-700 hover:text-teal-800 underline underline-offset-4"
            >
              {memberMode === 'login' ? 'Daftar Anggota Baru' : 'Masuk dengan Akun'}
            </button>
          </div>
        )}

        {isSuperAdminRegistrationRequired && (
          <div className="mt-4 rounded-xl border border-teal-200 bg-teal-50 p-3.5 text-xs text-teal-900">
            <div className="flex items-center gap-2 font-semibold">
              <ShieldPlus className="w-4 h-4 text-teal-700 shrink-0" />
              <span>Buat Akun Super Admin Terlebih Dahulu</span>
            </div>
            <p className="mt-1 text-teal-800 leading-relaxed">
              Belum ada akun Super Admin di sistem ini. Daftarkan akun Super Admin utama terlebih dahulu untuk membuka akses Dasbor Admin dan mengelola akun staf pustakawan lainnya.
            </p>
          </div>
        )}

        {roleTab === 'admin' && adminStatus.loaded && adminStatus.superAdminClaimed && (
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-600">
            Masuk menggunakan kredensial <span className="font-semibold text-slate-800">Super Admin</span> atau akun <span className="font-semibold text-slate-800">Admin Staf</span> yang telah didaftarkan.
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-3.5">
          {(isSuperAdminRegistrationRequired ||
            (roleTab === 'member' && memberMode === 'register')) && (
            <div>
              <label htmlFor="auth-name" className="block text-xs font-medium text-slate-700 mb-1">
                {isSuperAdminRegistrationRequired ? 'Nama Super Admin' : 'Nama Lengkap'}
              </label>
              <input
                id="auth-name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={
                  isSuperAdminRegistrationRequired ? 'Kepala Perpustakaan / Super Admin' : 'Nama Anggota'
                }
                className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>
          )}

          {(!adminStatus.envConfigured || roleTab === 'member') && (
            <div>
              <label htmlFor="auth-email" className="block text-xs font-medium text-slate-700 mb-1">
                Alamat Email
              </label>
              <input
                id="auth-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={
                  isSuperAdminRegistrationRequired
                    ? 'superadmin@pustakakita.id'
                    : roleTab === 'admin'
                      ? 'admin@pustakakita.id'
                      : 'anggota@email.com'
                }
                className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>
          )}

          <div>
            <label
              htmlFor="auth-password"
              className="block text-xs font-medium text-slate-700 mb-1"
            >
              {roleTab === 'admin' && adminStatus.envConfigured
                ? 'Passcode Admin'
                : 'Kata Sandi (min. 6 karakter)'}
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="auth-password"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-lg border border-slate-300 pl-9 pr-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-800">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || (roleTab === 'admin' && !adminStatus.loaded)}
            className="w-full rounded-lg bg-teal-700 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50 transition-colors"
          >
            {loading
              ? 'Memverifikasi...'
              : isSuperAdminRegistrationRequired
                ? 'Daftar Akun Super Admin & Masuk'
                : roleTab === 'admin'
                  ? 'Masuk Dasbor Admin'
                  : memberMode === 'register'
                    ? 'Daftar & Masuk Anggota'
                    : 'Masuk sebagai Anggota'}
          </button>
        </form>
      </div>
    </div>
  );
};
