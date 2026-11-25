import React, { useState } from 'react';
import {
  AlertTriangle,
  Bell,
  BellRing,
  BookmarkCheck,
  CheckCircle2,
  Clock,
  CreditCard,
  QrCode,
  RotateCcw,
  XCircle,
} from 'lucide-react';
import { evaluateLoan, FINE_RATE_PER_DAY, formatRupiah } from '../lib/libraryRules';
import type {
  LibraryNotification,
  LoanRecord,
  ReservationRecord,
  UserProfile,
} from '../lib/types';
import type { PushPermissionState } from '../hooks/usePushNotifications';
import { QrCodeImage } from './QrAndBarcodeVisuals';

interface MemberDashboardViewProps {
  user: UserProfile;
  loans: LoanRecord[];
  reservations: ReservationRecord[];
  notifications: LibraryNotification[];
  pushPermission: PushPermissionState;
  onEnablePush: () => Promise<PushPermissionState>;
  onTestPush: () => Promise<void>;
  onOpenScanner: () => void;
  onReturnLoan: (loanId: string) => Promise<void>;
  onPayFine: (loanId: string) => Promise<void>;
  onCancelReservation: (reservationId: string) => Promise<void>;
  onBorrowReservedBook: (bookId: string) => Promise<void>;
  onMarkAllRead: () => Promise<void>;
}

export const MemberDashboardView: React.FC<MemberDashboardViewProps> = ({
  user,
  loans,
  reservations,
  notifications,
  pushPermission,
  onEnablePush,
  onTestPush,
  onOpenScanner,
  onReturnLoan,
  onPayFine,
  onCancelReservation,
  onBorrowReservedBook,
  onMarkAllRead,
}) => {
  const [busyLoanId, setBusyLoanId] = useState<string | null>(null);
  const [busyReservationId, setBusyReservationId] = useState<string | null>(null);
  const [bannerMsg, setBannerMsg] = useState<string | null>(null);

  const now = new Date();
  const activeLoans = loans.filter((l) => l.status === 'active');
  const overdueLoans = activeLoans.filter((l) => evaluateLoan(l, now).health === 'overdue');
  const totalUnpaidFine = loans.reduce(
    (acc, loan) => acc + evaluateLoan(loan, now).unpaidFine,
    0
  );
  const activeReservations = reservations.filter(
    (r) => r.status === 'waiting' || r.status === 'ready'
  );
  const unreadNotifs = notifications.filter((n) => !n.read);

  const handleReturn = async (loanId: string) => {
    setBusyLoanId(loanId);
    setBannerMsg(null);
    try {
      await onReturnLoan(loanId);
      setBannerMsg('Buku berhasil dikembalikan ke sirkulasi perpustakaan.');
    } finally {
      setBusyLoanId(null);
    }
  };

  const handlePay = async (loanId: string) => {
    setBusyLoanId(loanId);
    setBannerMsg(null);
    try {
      await onPayFine(loanId);
      setBannerMsg('Denda keterlambatan berhasil dilunasi.');
    } finally {
      setBusyLoanId(null);
    }
  };

  const handleCancelRes = async (reservationId: string) => {
    setBusyReservationId(reservationId);
    setBannerMsg(null);
    try {
      await onCancelReservation(reservationId);
      setBannerMsg('Reservasi buku telah dibatalkan.');
    } finally {
      setBusyReservationId(null);
    }
  };

  const handleBorrowReserved = async (reservation: ReservationRecord) => {
    setBusyReservationId(reservation.id);
    setBannerMsg(null);
    try {
      await onBorrowReservedBook(reservation.bookId);
      setBannerMsg(`Buku "${reservation.bookTitle}" berhasil dipinjam dari reservasi Anda.`);
    } finally {
      setBusyReservationId(null);
    }
  };

  return (
    <div data-testid="member-dashboard" className="space-y-8">
      {/* Header & Member QR Card Split */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <div className="lg:col-span-8 bg-white border border-slate-200 rounded-2xl p-6 flex flex-col justify-between gap-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <p className="text-xs font-mono text-teal-800 font-semibold">
                DASBOR ANGGOTA · {user.memberCode}
              </p>
              <h1 className="mt-1 text-2xl font-bold text-slate-900">{user.name}</h1>
              <p className="text-sm text-slate-500">{user.email}</p>
            </div>
            <button
              type="button"
              onClick={onOpenScanner}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 transition-colors whitespace-nowrap shrink-0"
            >
              <QrCode className="w-4 h-4" />
              Pindai QR / Barcode Pinjam
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-slate-100">
            <div>
              <p className="text-xs text-slate-500">Pinjaman Aktif</p>
              <p className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">
                {activeLoans.length}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Buku Dipesan</p>
              <p className="mt-1 text-2xl font-bold text-amber-700 tabular-nums">
                {activeReservations.length}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Terlambat</p>
              <p
                className={`mt-1 text-2xl font-bold tabular-nums ${
                  overdueLoans.length > 0 ? 'text-red-700' : 'text-emerald-700'
                }`}
              >
                {overdueLoans.length}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Total Denda</p>
              <p
                className={`mt-1 text-2xl font-bold tabular-nums ${
                  totalUnpaidFine > 0 ? 'text-red-700' : 'text-slate-900'
                }`}
              >
                {formatRupiah(totalUnpaidFine)}
              </p>
            </div>
          </div>

          {/* Push Notification Reminder Control */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <BellRing className="w-5 h-5 text-teal-700 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  Push Notifikasi Pengingat Jatuh Tempo
                </p>
                <p className="text-xs text-slate-600 mt-0.5">
                  Tarif denda otomatis {formatRupiah(FINE_RATE_PER_DAY)}/hari setelah tanggal jatuh tempo.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {pushPermission === 'granted' ? (
                <button
                  type="button"
                  onClick={() => void onTestPush()}
                  className="rounded-lg border border-teal-300 bg-white px-3.5 py-2 text-xs font-semibold text-teal-800 hover:bg-teal-50 transition-colors whitespace-nowrap"
                >
                  Kirim Uji Push Notifikasi
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void onEnablePush()}
                  className="rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition-colors whitespace-nowrap"
                >
                  Aktifkan Push Notifikasi
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-2xl p-6 flex flex-col items-center justify-center text-center">
          <p className="text-xs font-semibold text-slate-500">KARTU ANGGOTA DIGITAL QR</p>
          <div className="mt-3">
            <QrCodeImage
              value={`PK-MEMBER:${user.memberCode}:${user.id}`}
              size={140}
              alt={`Kartu QR Anggota ${user.name}`}
            />
          </div>
          <p className="mt-3 font-mono text-sm font-bold text-slate-900 tabular-nums">
            {user.memberCode}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Tunjukkan QR ini di meja pustakawan untuk verifikasi cepat.
          </p>
        </div>
      </section>

      {bannerMsg && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
          <span>{bannerMsg}</span>
        </div>
      )}

      {/* Member Book Reservations */}
      <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <BookmarkCheck className="w-4 h-4 text-amber-700" />
            <div>
              <h2 className="text-lg font-bold text-slate-900">Reservasi Buku Saya</h2>
              <p className="text-xs text-slate-500">
                Daftar buku sedang dipinjam orang lain yang Anda pesan melalui katalog OPAC.
              </p>
            </div>
          </div>
        </div>

        {reservations.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            Anda belum memiliki reservasi buku. Gunakan tombol &ldquo;Pesan Buku&rdquo; di katalog OPAC jika stok buku sedang dipinjam semua.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {reservations.map((res) => (
              <div
                key={res.id}
                className="px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="min-w-0">
                  <p className="text-xs font-mono text-slate-500">
                    {res.bookAssetCode} · {res.rackLocation}
                  </p>
                  <h3 className="mt-0.5 text-sm font-bold text-slate-900 truncate">
                    {res.bookTitle}
                  </h3>
                  <p className="mt-1 text-xs text-slate-600 tabular-nums">
                    Dipesan: {new Date(res.reservedAt).toLocaleDateString('id-ID')}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3 shrink-0">
                  <span
                    className={`inline-flex items-center gap-1.5 text-xs font-semibold ${
                      res.status === 'ready'
                        ? 'text-emerald-700'
                        : res.status === 'waiting'
                          ? 'text-amber-700'
                          : 'text-slate-500'
                    }`}
                  >
                    <Clock className="w-3.5 h-3.5 shrink-0" />
                    {res.status === 'ready'
                      ? 'Dipesan · Siap Diambil'
                      : res.status === 'waiting'
                        ? 'Dipesan · Menunggu Kembali'
                        : res.status === 'fulfilled'
                          ? 'Sudah Dipinjam'
                          : 'Dibatalkan'}
                  </span>

                  {res.status === 'ready' && (
                    <button
                      type="button"
                      disabled={busyReservationId === res.id}
                      onClick={() => void handleBorrowReserved(res)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-50 transition-colors whitespace-nowrap"
                    >
                      <QrCode className="w-3.5 h-3.5" />
                      Pinjam Sekarang
                    </button>
                  )}

                  {(res.status === 'waiting' || res.status === 'ready') && (
                    <button
                      type="button"
                      disabled={busyReservationId === res.id}
                      onClick={() => void handleCancelRes(res.id)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors whitespace-nowrap"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      Batalkan
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Active & Historical Loans */}
      <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Riwayat &amp; Status Peminjaman</h2>
            <p className="text-xs text-slate-500">
              Pemantauan tenggat waktu dan perhitungan denda keterlambatan secara real-time.
            </p>
          </div>
        </div>

        {loans.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm font-medium text-slate-700">
              Anda belum memiliki riwayat peminjaman buku fisik.
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Pindai kode QR atau barcode buku dari katalog OPAC untuk memulai peminjaman.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {loans.map((loan) => {
              const ev = evaluateLoan(loan, now);
              return (
                <div
                  key={loan.id}
                  className="px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-mono text-slate-500">
                      {loan.bookAssetCode} · Token {loan.loanQrToken}
                    </p>
                    <h3 className="mt-0.5 text-sm font-bold text-slate-900 truncate">
                      {loan.bookTitle}
                    </h3>
                    <p className="mt-1 text-xs text-slate-600 tabular-nums">
                      Pinjam: {new Date(loan.borrowedAt).toLocaleDateString('id-ID')} · Jatuh Tempo:{' '}
                      {new Date(loan.dueAt).toLocaleDateString('id-ID')}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 shrink-0">
                    <div className="text-left md:text-right">
                      <span
                        className={`inline-flex items-center gap-1.5 text-xs font-semibold ${
                          ev.health === 'overdue'
                            ? 'text-red-700'
                            : ev.health === 'due_soon'
                              ? 'text-amber-700'
                              : ev.health === 'returned'
                                ? 'text-slate-500'
                                : 'text-emerald-700'
                        }`}
                      >
                        {ev.health === 'overdue' ? (
                          <AlertTriangle className="w-3.5 h-3.5" />
                        ) : (
                          <Clock className="w-3.5 h-3.5" />
                        )}
                        {ev.label}
                        {ev.health === 'overdue' && ` (${ev.daysOverdue} hari)`}
                        {ev.health === 'due_soon' && ` (${ev.daysRemaining} hari lagi)`}
                      </span>
                      {ev.unpaidFine > 0 && (
                        <p className="text-xs font-mono font-bold text-red-700 tabular-nums mt-0.5">
                          Denda: {formatRupiah(ev.unpaidFine)}
                        </p>
                      )}
                    </div>

                    {ev.unpaidFine > 0 && (
                      <button
                        type="button"
                        disabled={busyLoanId === loan.id}
                        onClick={() => void handlePay(loan.id)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-red-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-red-800 disabled:opacity-50 transition-colors whitespace-nowrap"
                      >
                        <CreditCard className="w-3.5 h-3.5" />
                        Lunasi Denda
                      </button>
                    )}

                    {loan.status === 'active' && (
                      <button
                        type="button"
                        disabled={busyLoanId === loan.id}
                        onClick={() => void handleReturn(loan.id)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50 transition-colors whitespace-nowrap"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        Kembalikan Buku
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Member Notification Center */}
      <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-teal-700" />
            <h2 className="text-base font-bold text-slate-900">
              Pusat Notifikasi ({unreadNotifs.length} belum dibaca)
            </h2>
          </div>
          {unreadNotifs.length > 0 && (
            <button
              type="button"
              onClick={() => void onMarkAllRead()}
              className="text-xs font-semibold text-teal-700 hover:text-teal-800 underline underline-offset-4"
            >
              Tandai Semua Dibaca
            </button>
          )}
        </div>

        {notifications.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            Belum ada notifikasi pengingat atau transaksi.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {notifications.map((n) => (
              <div
                key={n.id}
                className={`px-6 py-3.5 flex items-start justify-between gap-4 ${
                  n.read ? 'bg-white' : 'bg-teal-50/40'
                }`}
              >
                <div>
                  <p className="text-sm font-semibold text-slate-900">{n.title}</p>
                  <p className="mt-0.5 text-xs text-slate-600">{n.message}</p>
                </div>
                <span className="text-[11px] font-mono text-slate-400 shrink-0 tabular-nums">
                  {new Date(n.createdAt).toLocaleTimeString('id-ID', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
