import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  BellRing,
  CheckCircle2,
  Clock,
  FileSpreadsheet,
  FileUp,
  Plus,
  QrCode,
  RotateCcw,
  Trash2,
  Users,
} from 'lucide-react';
import { evaluateLoan, formatRupiah, parseBooksCsv } from '../lib/libraryRules';
import type {
  AssetCondition,
  BookFormat,
  BookItem,
  InventorySummary,
  LibraryNotification,
  LoanRecord,
  UserProfile,
} from '../lib/types';

interface MemberSummaryRow extends UserProfile {
  activeLoans: number;
  overdueLoans: number;
  unpaidFines: number;
}

interface AdminDashboardViewProps {
  books: BookItem[];
  loans: LoanRecord[];
  summary: InventorySummary;
  notifications: LibraryNotification[];
  members: MemberSummaryRow[];
  token: string;
  onRefreshAll: () => Promise<void>;
  onShowLabel: (book: BookItem) => void;
  onReadPdf: (book: BookItem) => void;
}

type AdminTab = 'monitor' | 'inventory' | 'add_pdf' | 'bulk_csv' | 'members';

const SAMPLE_CSV_TEMPLATE = `judul,penulis,isbn,penerbit,tahun,kategori,format,lokasi_rak,kode_aset,jumlah,kondisi,deskripsi
"Sistem Informasi Perpustakaan Modern",Dr. Arif Wibowo,978-602-770-101-4,Pustaka Informatika,2026,Teknologi,hybrid,Rak B-08,AST-2026-101,5,Baik,"Panduan otomasi katalog dan sirkulasi QR."
"Manajemen Pelestarian Naskah Cetak",Lestari Handayani,978-602-770-102-1,Cakrawala Ilmu,2025,Sejarah,print,Rak C-04,AST-2026-102,4,Baik,"Standar konservasi buku fisik perpustakaan."
"Etika Hak Cipta Era Digital",Hendra Gunawan,978-602-770-103-8,Literasi Hukum,2026,Hukum,print,Rak E-02,AST-2026-103,3,Baik,"Regulasi akses konten terproteksi di institusi."`;

export const AdminDashboardView: React.FC<AdminDashboardViewProps> = ({
  books,
  loans,
  summary,
  notifications,
  members,
  token,
  onRefreshAll,
  onShowLabel,
  onReadPdf,
}) => {
  const [activeTab, setActiveTab] = useState<AdminTab>('monitor');
  const [statusBanner, setStatusBanner] = useState<{ type: 'ok' | 'err'; text: string } | null>(
    null
  );
  const [busyAction, setBusyAction] = useState(false);

  // Single Book + PDF Form State
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [isbn, setIsbn] = useState('');
  const [publisher, setPublisher] = useState('PustakaKita Press');
  const [year, setYear] = useState('2026');
  const [category, setCategory] = useState('Teknologi');
  const [format, setFormat] = useState<BookFormat>('digital_pdf');
  const [rackLocation, setRackLocation] = useState('Rak A-01');
  const [assetCode, setAssetCode] = useState('');
  const [totalCopies, setTotalCopies] = useState('3');
  const [description, setDescription] = useState('');
  const [pdfFile, setPdfFile] = useState<File | null>(null);

  // Bulk CSV State
  const [csvText, setCsvText] = useState('');
  const csvPreview = useMemo(() => {
    if (!csvText.trim()) return null;
    return parseBooksCsv(csvText);
  }, [csvText]);

  const now = new Date();

  const handleRunOverdueAudit = async () => {
    setBusyAction(true);
    setStatusBanner(null);
    try {
      const res = await fetch('/api/admin/run-overdue-audit', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json()) as { generatedCount?: number; error?: string };
      if (!res.ok) throw new Error(data.error || 'Gagal menjalankan audit.');
      await onRefreshAll();
      setStatusBanner({
        type: 'ok',
        text: `Audit keterlambatan selesai. ${data.generatedCount ?? 0} notifikasi pengingat/denda baru dikirim.`,
      });
    } catch (err) {
      setStatusBanner({
        type: 'err',
        text: err instanceof Error ? err.message : 'Gagal menjalankan audit.',
      });
    } finally {
      setBusyAction(false);
    }
  };

  const handleSimulateOverdue = async (loanId: string) => {
    setBusyAction(true);
    setStatusBanner(null);
    try {
      const res = await fetch(`/api/admin/loans/${encodeURIComponent(loanId)}/simulate-overdue`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ daysOverdue: 4 }),
      });
      if (!res.ok) throw new Error('Gagal mensimulasikan keterlambatan.');
      await onRefreshAll();
      setStatusBanner({
        type: 'ok',
        text: 'Status keterlambatan (+4 hari, denda Rp 8.000) dan notifikasi otomatis diperbarui.',
      });
    } catch (err) {
      setStatusBanner({
        type: 'err',
        text: err instanceof Error ? err.message : 'Gagal memproses aksi.',
      });
    } finally {
      setBusyAction(false);
    }
  };

  const handleAdminReturnLoan = async (loanId: string) => {
    setBusyAction(true);
    try {
      await fetch(`/api/loans/${encodeURIComponent(loanId)}/return`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      await onRefreshAll();
      setStatusBanner({ type: 'ok', text: 'Pengembalian buku tercatat.' });
    } finally {
      setBusyAction(false);
    }
  };

  const handleAdminPayFine = async (loanId: string) => {
    setBusyAction(true);
    try {
      await fetch(`/api/loans/${encodeURIComponent(loanId)}/pay-fine`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      await onRefreshAll();
      setStatusBanner({ type: 'ok', text: 'Denda keterlambatan ditandai lunas.' });
    } finally {
      setBusyAction(false);
    }
  };

  const handleUpdateCondition = async (bookId: string, condition: AssetCondition) => {
    await fetch(`/api/books/${encodeURIComponent(bookId)}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ condition }),
    });
    await onRefreshAll();
  };

  const handleDeleteBook = async (bookId: string, bookTitle: string) => {
    setBusyAction(true);
    try {
      await fetch(`/api/books/${encodeURIComponent(bookId)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      await onRefreshAll();
      setStatusBanner({ type: 'ok', text: `Aset "${bookTitle}" dihapus dari katalog.` });
    } finally {
      setBusyAction(false);
    }
  };

  const handleCreateBookSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusyAction(true);
    setStatusBanner(null);

    try {
      const formData = new FormData();
      formData.append('title', title);
      formData.append('author', author);
      formData.append('isbn', isbn);
      formData.append('publisher', publisher);
      formData.append('year', year);
      formData.append('category', category);
      formData.append('format', format);
      formData.append('rackLocation', rackLocation);
      formData.append('assetCode', assetCode);
      formData.append('totalCopies', totalCopies);
      formData.append('description', description);
      if (pdfFile) {
        formData.append('pdfFile', pdfFile);
      }

      const res = await fetch('/api/books', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = (await res.json()) as { book?: BookItem; error?: string };
      if (!res.ok || !data.book) {
        throw new Error(data.error || 'Gagal menginput buku baru.');
      }

      setTitle('');
      setAuthor('');
      setIsbn('');
      setAssetCode('');
      setDescription('');
      setPdfFile(null);
      await onRefreshAll();
      setStatusBanner({
        type: 'ok',
        text: `Buku "${data.book.title}" (${data.book.assetCode}) berhasil ditambahkan ke katalog dan repositori aman.`,
      });
      setActiveTab('inventory');
    } catch (err) {
      setStatusBanner({
        type: 'err',
        text: err instanceof Error ? err.message : 'Gagal menambahkan buku.',
      });
    } finally {
      setBusyAction(false);
    }
  };

  const handleCsvFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setCsvText(text);
    e.target.value = '';
  };

  const handleBulkCsvImport = async () => {
    if (!csvText.trim()) return;
    setBusyAction(true);
    setStatusBanner(null);
    try {
      const res = await fetch('/api/books/bulk-csv', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ csvText }),
      });
      const data = (await res.json()) as {
        importedCount?: number;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || 'Gagal mengimpor CSV.');
      setCsvText('');
      await onRefreshAll();
      setStatusBanner({
        type: 'ok',
        text: `${data.importedCount ?? 0} judul buku berhasil diimpor massal dari CSV beserta kode QR & barcode aset.`,
      });
      setActiveTab('inventory');
    } catch (err) {
      setStatusBanner({
        type: 'err',
        text: err instanceof Error ? err.message : 'Gagal mengimpor data CSV.',
      });
    } finally {
      setBusyAction(false);
    }
  };

  const handleDownloadCsvTemplate = () => {
    const blob = new Blob([SAMPLE_CSV_TEMPLATE], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'template-koleksi-pustakakita.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Top Admin Header & Quick Entry Buttons */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white border border-slate-200 rounded-2xl p-6">
        <div>
          <p className="text-xs font-mono text-teal-800 font-semibold">
            DASBOR ADMINISTRATOR &amp; INVENTARISASI ASET
          </p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">
            Pusat Kendali Sirkulasi &amp; Koleksi PustakaKita
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Pantau status buku real-time, unggah koleksi PDF terproteksi, impor CSV massal, dan kelola denda otomatis.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => {
              setStatusBanner(null);
              setActiveTab('add_pdf');
            }}
            className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 transition-colors whitespace-nowrap shrink-0"
          >
            <FileUp className="w-4 h-4" />
            Input Buku &amp; PDF
          </button>
          <button
            type="button"
            onClick={() => {
              setStatusBanner(null);
              setActiveTab('bulk_csv');
            }}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
          >
            <FileSpreadsheet className="w-4 h-4 text-teal-700" />
            Unggah Massal CSV
          </button>
        </div>
      </div>

      {/* Real-Time KPI Summary Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500">Total Aset Judul</p>
          <p className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">
            {summary.totalTitles}
          </p>
          <p className="mt-1 text-xs text-slate-500 tabular-nums">
            {summary.conditionCounts.Baik} Baik · {summary.conditionCounts['Perlu Perawatan']} Perawatan
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500">Stok Eksemplar Cetak</p>
          <p className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">
            {summary.availablePhysicalCopies} / {summary.totalPhysicalCopies}
          </p>
          <p className="mt-1 text-xs text-slate-500 tabular-nums">
            {summary.borrowedPhysicalCopies} sedang dipinjam
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500">Keterlambatan Aktif</p>
          <p
            className={`mt-1 text-2xl font-bold tabular-nums ${
              summary.overdueLoansCount > 0 ? 'text-red-700' : 'text-emerald-700'
            }`}
          >
            {summary.overdueLoansCount}
          </p>
          <p className="mt-1 text-xs text-slate-500">Dari {summary.activeLoansCount} pinjaman aktif</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500">Denda Belum Lunas</p>
          <p className="mt-1 text-2xl font-bold text-red-700 tabular-nums">
            {formatRupiah(summary.totalOutstandingFines)}
          </p>
          <p className="mt-1 text-xs text-slate-500">Otomatis Rp 2.000/hari</p>
        </div>
      </div>

      {/* Sub-Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-xl w-fit">
        {(
          [
            { id: 'monitor', label: 'Pemantauan Real-Time' },
            { id: 'inventory', label: 'Inventaris Aset OPAC' },
            { id: 'add_pdf', label: 'Input Buku PDF' },
            { id: 'bulk_csv', label: 'Unggah Massal CSV' },
            { id: 'members', label: 'Daftar Anggota' },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
              activeTab === tab.id
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {statusBanner && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm flex items-center gap-2.5 ${
            statusBanner.type === 'ok'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : 'border-red-200 bg-red-50 text-red-900'
          }`}
        >
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{statusBanner.text}</span>
        </div>
      )}

      {/* TAB 1: REAL-TIME MONITORING & OVERDUE NOTIFICATIONS */}
      {activeTab === 'monitor' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Sirkulasi &amp; Denda Otomatis Real-Time
                </h2>
                <p className="text-xs text-slate-500">
                  Pemantauan peminjaman QR/Barcode dan status keterlambatan anggota.
                </p>
              </div>
              <button
                type="button"
                disabled={busyAction}
                onClick={() => void handleRunOverdueAudit()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50 transition-colors whitespace-nowrap"
              >
                <BellRing className="w-3.5 h-3.5" />
                Jalankan Audit Keterlambatan
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                    <th className="py-3 px-3 whitespace-nowrap">Anggota</th>
                    <th className="py-3 px-3 whitespace-nowrap">Buku / Aset</th>
                    <th className="py-3 px-3 whitespace-nowrap">Jatuh Tempo</th>
                    <th className="py-3 px-3 whitespace-nowrap">Status</th>
                    <th className="py-3 px-3 text-right whitespace-nowrap">Denda</th>
                    <th className="py-3 px-3 text-right whitespace-nowrap">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {loans.map((loan) => {
                    const ev = evaluateLoan(loan, now);
                    return (
                      <tr key={loan.id} className="hover:bg-slate-50/70">
                        <td className="py-3 px-3 whitespace-nowrap">
                          <p className="font-semibold text-slate-900">{loan.memberName}</p>
                          <p className="font-mono text-[11px] text-slate-500">{loan.memberCode}</p>
                        </td>
                        <td className="py-3 px-3 max-w-[155px]">
                          <p className="font-medium text-slate-900 truncate">{loan.bookTitle}</p>
                          <p className="font-mono text-[11px] text-slate-500">
                            {loan.bookAssetCode}
                          </p>
                        </td>
                        <td className="py-3 px-3 font-mono tabular-nums text-slate-600 whitespace-nowrap">
                          {new Date(loan.dueAt).toLocaleDateString('id-ID')}
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center gap-1 font-semibold whitespace-nowrap ${
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
                              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                            ) : (
                              <Clock className="w-3.5 h-3.5 shrink-0" />
                            )}
                            {ev.label}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-bold tabular-nums text-slate-900 whitespace-nowrap">
                          {ev.unpaidFine > 0 ? (
                            <span className="text-red-700">{formatRupiah(ev.unpaidFine)}</span>
                          ) : (
                            'Rp 0'
                          )}
                        </td>
                        <td className="py-3 px-3 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            {loan.status === 'active' && ev.health !== 'overdue' && (
                              <button
                                type="button"
                                disabled={busyAction}
                                onClick={() => void handleSimulateOverdue(loan.id)}
                                title="Simulasikan keterlambatan 4 hari untuk menguji denda & notifikasi"
                                className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-900 hover:bg-amber-100 whitespace-nowrap"
                              >
                                Uji Telat
                              </button>
                            )}
                            {ev.unpaidFine > 0 && (
                              <button
                                type="button"
                                disabled={busyAction}
                                onClick={() => void handleAdminPayFine(loan.id)}
                                className="rounded-md bg-red-700 px-2 py-1 text-[11px] font-semibold text-white hover:bg-red-800 whitespace-nowrap"
                              >
                                Lunasi
                              </button>
                            )}
                            {loan.status === 'active' && (
                              <button
                                type="button"
                                disabled={busyAction}
                                onClick={() => void handleAdminReturnLoan(loan.id)}
                                className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                              >
                                <RotateCcw className="w-3 h-3" />
                                Kembali
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Live System Alerts Feed */}
          <div className="lg:col-span-4 bg-white border border-slate-200 rounded-2xl overflow-hidden flex flex-col">
            <div className="px-5 py-4 border-b border-slate-200">
              <h2 className="text-base font-bold text-slate-900">
                Log Notifikasi Keterlambatan
              </h2>
              <p className="text-xs text-slate-500">
                Peringatan otomatis pengingat jatuh tempo &amp; denda.
              </p>
            </div>
            <div className="divide-y divide-slate-100 max-h-[420px] overflow-y-auto">
              {notifications.length === 0 ? (
                <p className="p-6 text-xs text-slate-500 text-center">
                  Belum ada log notifikasi.
                </p>
              ) : (
                notifications.slice(0, 12).map((n) => (
                  <div key={n.id} className="px-5 py-3.5">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`text-xs font-semibold ${
                          n.type === 'overdue'
                            ? 'text-red-700'
                            : n.type === 'due_soon'
                              ? 'text-amber-700'
                              : 'text-teal-800'
                        }`}
                      >
                        {n.title}
                      </span>
                      <span className="font-mono text-[10px] text-slate-400 tabular-nums">
                        {new Date(n.createdAt).toLocaleTimeString('id-ID', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-600 leading-relaxed">{n.message}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: ASSET INVENTORY & OPAC MANAGEMENT */}
      {activeTab === 'inventory' && (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Inventarisasi Aset Perpustakaan &amp; OPAC
              </h2>
              <p className="text-xs text-slate-500">
                Kelola kode aset QR, barcode ISBN, lokasi rak cetak, kondisi fisik, dan akses PDF.
              </p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                  <th className="py-3 px-4">Kode Aset &amp; Rak</th>
                  <th className="py-3 px-4">Judul &amp; Penulis</th>
                  <th className="py-3 px-4">Format</th>
                  <th className="py-3 px-4">Stok</th>
                  <th className="py-3 px-4">Kondisi Aset</th>
                  <th className="py-3 px-4 text-right">Label &amp; Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {books.map((book) => (
                  <tr key={book.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4">
                      <p className="font-mono font-semibold text-slate-900">{book.assetCode}</p>
                      <p className="text-[11px] text-slate-500">{book.rackLocation}</p>
                    </td>
                    <td className="py-3 px-4 max-w-[260px]">
                      <p className="font-bold text-slate-900 truncate">{book.title}</p>
                      <p className="text-[11px] text-slate-500 truncate">
                        {book.author} · ISBN {book.isbn}
                      </p>
                    </td>
                    <td className="py-3 px-4 text-slate-700">
                      {book.format === 'digital_pdf'
                        ? 'Digital PDF'
                        : book.format === 'hybrid'
                          ? 'Cetak + PDF'
                          : 'Cetak OPAC'}
                    </td>
                    <td className="py-3 px-4 font-mono tabular-nums text-slate-800">
                      {book.format === 'digital_pdf'
                        ? 'Tak Terbatas'
                        : `${book.availableCopies} / ${book.totalCopies}`}
                    </td>
                    <td className="py-3 px-4">
                      <select
                        aria-label={`Ubah kondisi aset ${book.title}`}
                        value={book.condition}
                        onChange={(e) =>
                          void handleUpdateCondition(book.id, e.target.value as AssetCondition)
                        }
                        className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800"
                      >
                        <option value="Baik">Baik</option>
                        <option value="Perlu Perawatan">Perlu Perawatan</option>
                        <option value="Rusak">Rusak</option>
                      </select>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        {book.hasPdf && (
                          <button
                            type="button"
                            onClick={() => onReadPdf(book)}
                            className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            Pratinjau PDF
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onShowLabel(book)}
                          className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          <QrCode className="w-3.5 h-3.5 text-teal-700" />
                          Label QR
                        </button>
                        <button
                          type="button"
                          disabled={busyAction}
                          onClick={() => void handleDeleteBook(book.id, book.title)}
                          aria-label={`Hapus ${book.title}`}
                          className="p-1.5 rounded-md text-slate-400 hover:text-red-700 hover:bg-red-50 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: INPUT SINGLE BOOK + PDF UPLOAD */}
      {activeTab === 'add_pdf' && (
        <form
          onSubmit={handleCreateBookSubmit}
          className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5 max-w-3xl"
        >
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Input Koleksi Baru &amp; Unggah Berkas PDF
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Berkas PDF yang diunggah disimpan di repositori aman dan hanya dapat dibaca anggota melalui pembaca canvas terproteksi (tidak dapat diunduh).
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label htmlFor="book-title" className="block text-xs font-medium text-slate-700 mb-1">
                Judul Buku *
              </label>
              <input
                id="book-title"
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Contoh: Pengantar Arsitektur Cloud Modern"
                className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>

            <div>
              <label htmlFor="book-author" className="block text-xs font-medium text-slate-700 mb-1">
                Penulis *
              </label>
              <input
                id="book-author"
                type="text"
                required
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                placeholder="Nama Penulis"
                className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>

            <div>
              <label htmlFor="book-isbn" className="block text-xs font-medium text-slate-700 mb-1">
                ISBN / Kode Barcode
              </label>
              <input
                id="book-isbn"
                type="text"
                value={isbn}
                onChange={(e) => setIsbn(e.target.value)}
                placeholder="978-602-481-999-0"
                className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>

            <div>
              <label
                htmlFor="book-format"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Format Koleksi
              </label>
              <select
                id="book-format"
                value={format}
                onChange={(e) => setFormat(e.target.value as BookFormat)}
                className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-600"
              >
                <option value="digital_pdf">Digital PDF (Baca di Sistem)</option>
                <option value="hybrid">Cetak OPAC + Digital PDF</option>
                <option value="print">Buku Cetak OPAC</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="book-category"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Kategori
              </label>
              <input
                id="book-category"
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>

            <div>
              <label
                htmlFor="book-publisher"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Penerbit
              </label>
              <input
                id="book-publisher"
                type="text"
                value={publisher}
                onChange={(e) => setPublisher(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>

            <div>
              <label htmlFor="book-year" className="block text-xs font-medium text-slate-700 mb-1">
                Tahun Terbit
              </label>
              <input
                id="book-year"
                type="number"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>

            {format !== 'digital_pdf' && (
              <>
                <div>
                  <label
                    htmlFor="book-rack"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    Lokasi Rak OPAC
                  </label>
                  <input
                    id="book-rack"
                    type="text"
                    value={rackLocation}
                    onChange={(e) => setRackLocation(e.target.value)}
                    placeholder="Rak A-01"
                    className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
                  />
                </div>
                <div>
                  <label
                    htmlFor="book-copies"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    Jumlah Eksemplar Cetak
                  </label>
                  <input
                    id="book-copies"
                    type="number"
                    min={1}
                    value={totalCopies}
                    onChange={(e) => setTotalCopies(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-teal-600"
                  />
                </div>
              </>
            )}

            <div>
              <label
                htmlFor="book-asset-code"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Kode Aset (Opsional, otomatis jika kosong)
              </label>
              <input
                id="book-asset-code"
                type="text"
                value={assetCode}
                onChange={(e) => setAssetCode(e.target.value)}
                placeholder="AST-2026-015"
                className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="book-pdf-file" className="block text-xs font-medium text-slate-700 mb-1">
                Unggah Berkas PDF {format === 'digital_pdf' ? '(Wajib untuk Digital PDF)' : '(Opsional)'}
              </label>
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="text-xs text-slate-600">
                  {pdfFile ? (
                    <span className="font-semibold text-teal-800">
                      Berkas dipilih: {pdfFile.name} ({Math.round(pdfFile.size / 1024)} KB)
                    </span>
                  ) : (
                    <span>Pilih dokumen .pdf maksimal 25 MB untuk pembacaan terproteksi.</span>
                  )}
                </div>
                <label className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-100 cursor-pointer shrink-0">
                  <FileUp className="w-4 h-4 text-teal-700" />
                  Pilih File PDF
                  <input
                    id="book-pdf-file"
                    type="file"
                    accept=".pdf,application/pdf"
                    onChange={(e) => setPdfFile(e.target.files?.[0] ?? null)}
                    className="sr-only"
                  />
                </label>
              </div>
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="book-desc" className="block text-xs font-medium text-slate-700 mb-1">
                Ringkasan / Deskripsi
              </label>
              <textarea
                id="book-desc"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Deskripsi singkat isi koleksi untuk katalog OPAC..."
                className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setActiveTab('inventory')}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={busyAction}
              className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              {busyAction ? 'Menyimpan...' : 'Simpan & Generate QR'}
            </button>
          </div>
        </form>
      )}

      {/* TAB 4: BULK CSV UPLOAD */}
      {activeTab === 'bulk_csv' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5 max-w-4xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                Unggah Massal Koleksi via CSV
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Percepat entri data inventaris buku cetak maupun katalog OPAC secara massal. Setiap baris otomatis memperoleh QR Code &amp; Barcode aset.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleDownloadCsvTemplate}
                className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
              >
                Unduh Template CSV
              </button>
              <button
                type="button"
                onClick={() => setCsvText(SAMPLE_CSV_TEMPLATE)}
                className="rounded-lg border border-teal-300 bg-teal-50 px-3.5 py-2 text-xs font-semibold text-teal-800 hover:bg-teal-100 whitespace-nowrap"
              >
                Isi Contoh CSV
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <p className="text-xs text-slate-600">
              Unggah berkas <span className="font-mono">.csv</span> atau tempel data CSV langsung di area teks di bawah.
            </p>
            <label className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 cursor-pointer shrink-0">
              <FileSpreadsheet className="w-4 h-4" />
              Pilih File CSV
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => void handleCsvFileSelect(e)}
                className="sr-only"
              />
            </label>
          </div>

          <div>
            <label htmlFor="bulk-csv-textarea" className="block text-xs font-medium text-slate-700 mb-1">
              Data CSV (Header: judul, penulis, isbn, penerbit, tahun, kategori, format, lokasi_rak, kode_aset, jumlah, kondisi)
            </label>
            <textarea
              id="bulk-csv-textarea"
              rows={7}
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              placeholder={SAMPLE_CSV_TEMPLATE}
              className="w-full rounded-xl border border-slate-300 px-3.5 py-3 text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-600"
            />
          </div>

          {csvPreview && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2">
              <p className="text-xs font-semibold text-slate-900 tabular-nums">
                Pratinjau Impor: {csvPreview.validBooks.length} baris valid siap disimpan
                {csvPreview.errors.length > 0 && ` · ${csvPreview.errors.length} baris bermasalah`}
              </p>
              {csvPreview.errors.map((err, i) => (
                <p key={i} className="text-xs text-red-700">
                  {err}
                </p>
              ))}
              {csvPreview.validBooks.length > 0 && (
                <ul className="text-xs text-slate-600 space-y-1 pt-1">
                  {csvPreview.validBooks.slice(0, 5).map((b, i) => (
                    <li key={i} className="font-mono">
                      • {b.assetCode} — {b.title} ({b.author}) [{b.rackLocation}, {b.totalCopies} eks]
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="button"
              disabled={busyAction || !csvPreview || csvPreview.validBooks.length === 0}
              onClick={() => void handleBulkCsvImport()}
              className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-45"
            >
              <FileSpreadsheet className="w-4 h-4" />
              {busyAction
                ? 'Mengimpor...'
                : `Impor ${csvPreview?.validBooks.length ?? 0} Buku ke Inventaris`}
            </button>
          </div>
        </div>
      )}

      {/* TAB 5: MEMBERS DIRECTORY */}
      {activeTab === 'members' && (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center gap-2">
            <Users className="w-4 h-4 text-teal-700" />
            <h2 className="text-base font-bold text-slate-900">
              Direktori Anggota &amp; Status Denda
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                  <th className="py-3 px-4">ID Anggota</th>
                  <th className="py-3 px-4">Nama &amp; Email</th>
                  <th className="py-3 px-4 text-right">Pinjaman Aktif</th>
                  <th className="py-3 px-4 text-right">Terlambat</th>
                  <th className="py-3 px-4 text-right">Denda Berjalan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {members.map((m) => (
                  <tr key={m.id}>
                    <td className="py-3 px-4 font-mono font-semibold text-slate-900">
                      {m.memberCode}
                    </td>
                    <td className="py-3 px-4">
                      <p className="font-semibold text-slate-900">{m.name}</p>
                      <p className="text-[11px] text-slate-500">{m.email}</p>
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">{m.activeLoans}</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">
                      <span className={m.overdueLoans > 0 ? 'text-red-700 font-bold' : ''}>
                        {m.overdueLoans}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold tabular-nums">
                      <span className={m.unpaidFines > 0 ? 'text-red-700' : 'text-slate-700'}>
                        {formatRupiah(m.unpaidFines)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
