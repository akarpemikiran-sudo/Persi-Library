import React, { useMemo, useState } from 'react';
import {
  BookmarkCheck,
  BookmarkPlus,
  BookOpen,
  Lock,
  QrCode,
  Search,
  Tag,
} from 'lucide-react';
import { isActiveReservation } from '../lib/libraryRules';
import type {
  BookFormat,
  BookItem,
  InventorySummary,
  LoanRecord,
  ReservationRecord,
  UserProfile,
} from '../lib/types';

interface OpacCatalogViewProps {
  books: BookItem[];
  summary: InventorySummary;
  user: UserProfile | null;
  loans: LoanRecord[];
  reservations: ReservationRecord[];
  onOpenScanner: () => void;
  onBorrowDirect: (book: BookItem) => Promise<void>;
  onReserveBook: (book: BookItem) => Promise<void>;
  onReadPdf: (book: BookItem) => void;
  onShowLabel: (book: BookItem) => void;
  onOpenAuth: () => void;
}

export const OpacCatalogView: React.FC<OpacCatalogViewProps> = ({
  books,
  summary,
  user,
  loans,
  reservations,
  onOpenScanner,
  onBorrowDirect,
  onReserveBook,
  onReadPdf,
  onShowLabel,
  onOpenAuth,
}) => {
  const [query, setQuery] = useState('');
  const [formatFilter, setFormatFilter] = useState<'all' | BookFormat>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [busyBookId, setBusyBookId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const categories = useMemo(() => {
    const set = new Set<string>();
    books.forEach((b) => set.add(b.category));
    return ['all', ...Array.from(set).sort()];
  }, [books]);

  const filteredBooks = useMemo(() => {
    const q = query.trim().toLowerCase();
    return books.filter((b) => {
      if (formatFilter !== 'all' && b.format !== formatFilter) return false;
      if (categoryFilter !== 'all' && b.category !== categoryFilter) return false;
      if (!q) return true;
      return (
        b.title.toLowerCase().includes(q) ||
        b.author.toLowerCase().includes(q) ||
        b.isbn.toLowerCase().includes(q) ||
        b.assetCode.toLowerCase().includes(q) ||
        b.rackLocation.toLowerCase().includes(q) ||
        b.barcode.toLowerCase().includes(q)
      );
    });
  }, [books, query, formatFilter, categoryFilter]);

  const handleBorrowClick = async (book: BookItem) => {
    if (!user) {
      onOpenAuth();
      return;
    }
    setBusyBookId(book.id);
    setFeedback(null);
    try {
      await onBorrowDirect(book);
      setFeedback({
        type: 'ok',
        text: `Peminjaman "${book.title}" tercatat. Cek dasbor anggota untuk jadwal pengembalian.`,
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Gagal meminjam buku.',
      });
    } finally {
      setBusyBookId(null);
    }
  };

  const handleReserveClick = async (book: BookItem) => {
    if (!user) {
      onOpenAuth();
      return;
    }
    setBusyBookId(book.id);
    setFeedback(null);
    try {
      await onReserveBook(book);
      setFeedback({
        type: 'ok',
        text: `Reservasi "${book.title}" berhasil dibuat. Status buku kini 'Dipesan' dan Anda akan diberi tahu saat buku kembali.`,
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Gagal memesan buku.',
      });
    } finally {
      setBusyBookId(null);
    }
  };

  return (
    <div className="space-y-10">
      {/* 2-Column Editorial Hero Section */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
        <div className="lg:col-span-7 flex flex-col justify-center bg-white border border-slate-200 rounded-2xl p-7 sm:p-10">
          <p className="text-xs font-semibold tracking-wide text-teal-800">
            Katalog Publik OPAC · Sirkulasi QR &amp; Barcode · Reservasi Buku · Baca PDF Terproteksi
          </p>
          <h1 className="mt-3 text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 leading-tight [text-wrap:balance]">
            Perpustakaan Digital Modern dengan Kendali Aset Real-Time
          </h1>
          <p className="mt-4 text-base text-slate-600 leading-relaxed max-w-2xl">
            Cari ketersediaan buku cetak di rak OPAC, pesan buku yang sedang dipinjam anggota lain, pinjam lebih cepat lewat pemindaian QR dan barcode, dan baca koleksi PDF langsung di sistem tanpa risiko unduhan ilegal.
          </p>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onOpenScanner}
              className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-5 py-3 text-sm font-semibold text-white hover:bg-teal-800 transition-colors whitespace-nowrap shrink-0"
            >
              <QrCode className="w-4 h-4" />
              Pindai QR / Barcode Buku
            </button>
            <a
              href="#katalog-opac"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
            >
              <Search className="w-4 h-4" />
              Jelajahi Katalog OPAC
            </a>
          </div>
        </div>

        <div className="lg:col-span-5 relative rounded-2xl overflow-hidden border border-slate-200 bg-slate-100 min-h-[260px]">
          <img
            src="/src/assets/images/hero_library_atrium_1795609544438.jpg"
            alt="Ruang baca modern PustakaKita dengan rak buku kayu dan pencahayaan alami"
            referrerPolicy="no-referrer"
            className="w-full h-full lg:h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/75 via-slate-950/15 to-transparent flex items-end p-6">
            <div className="text-white">
              <p className="text-xs font-mono text-teal-200">SISTEM INVENTARISASI TERPADU</p>
              <p className="mt-1 text-sm font-semibold">
                Sinkronisasi stok rak fisik, kode QR aset, reservasi anggota, dan repositori PDF dalam satu layar.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Full-Width 4-Column Live Library Status Strip */}
      <section
        aria-label="Ringkasan status perpustakaan real-time"
        className="grid grid-cols-2 lg:grid-cols-4 gap-4 bg-white border border-slate-200 rounded-2xl p-5"
      >
        <div className="px-2 py-1 border-r border-slate-100 last:border-r-0">
          <p className="text-xs text-slate-500">Total Judul OPAC</p>
          <p className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">
            {summary.totalTitles}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">Koleksi cetak &amp; digital</p>
        </div>
        <div className="px-2 py-1 lg:border-r border-slate-100">
          <p className="text-xs text-slate-500">Eksemplar Cetak Tersedia</p>
          <p className="mt-1 text-2xl font-bold text-emerald-700 tabular-nums">
            {summary.availablePhysicalCopies}{' '}
            <span className="text-sm font-normal text-slate-400">
              / {summary.totalPhysicalCopies}
            </span>
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            {summary.activeReservationsCount > 0
              ? `${summary.activeReservationsCount} antrean reservasi`
              : 'Siap dipinjam di rak'}
          </p>
        </div>
        <div className="px-2 py-1 border-r border-slate-100">
          <p className="text-xs text-slate-500">E-Book PDF Terproteksi</p>
          <p className="mt-1 text-2xl font-bold text-teal-800 tabular-nums">
            {summary.digitalTitles}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">Baca di sistem (tanpa unduh)</p>
        </div>
        <div className="px-2 py-1">
          <p className="text-xs text-slate-500">Sirkulasi Aktif</p>
          <p className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">
            {summary.activeLoansCount}
          </p>
          <p className="mt-0.5 text-xs text-slate-500 tabular-nums">
            {summary.overdueLoansCount > 0
              ? `${summary.overdueLoansCount} peminjaman terlambat`
              : 'Semua tepat waktu'}
          </p>
        </div>
      </section>

      {/* OPAC Search & Filter Bar */}
      <section id="katalog-opac" className="space-y-5">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">
              Katalog OPAC &amp; Koleksi Digital
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Telusuri lokasi rak buku cetak, pesan buku yang sedang dipinjam, dan baca e-book PDF langsung di sistem.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-xl">
            {(
              [
                { id: 'all', label: 'Semua' },
                { id: 'print', label: 'Buku Cetak' },
                { id: 'hybrid', label: 'Cetak + PDF' },
                { id: 'digital_pdf', label: 'Digital PDF' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFormatFilter(tab.id)}
                className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                  formatFilter === tab.id
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          <div className="md:col-span-9 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <label htmlFor="opac-search-input" className="sr-only">
              Cari judul, penulis, ISBN, barcode, atau lokasi rak
            </label>
            <input
              id="opac-search-input"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari judul buku, penulis, ISBN, kode aset (AST-...), atau nomor rak..."
              className="w-full rounded-xl border border-slate-300 bg-white pl-10 pr-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-600"
            />
          </div>
          <div className="md:col-span-3">
            <label htmlFor="opac-category-select" className="sr-only">
              Filter kategori
            </label>
            <select
              id="opac-category-select"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-600"
            >
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat === 'all' ? 'Semua Kategori' : cat}
                </option>
              ))}
            </select>
          </div>
        </div>

        {feedback && (
          <div
            className={`rounded-xl border px-4 py-3 text-sm ${
              feedback.type === 'ok'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                : 'border-red-200 bg-red-50 text-red-900'
            }`}
          >
            {feedback.text}
          </div>
        )}

        {/* Catalog Grid */}
        {filteredBooks.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center">
            <BookOpen className="w-10 h-10 text-slate-300 mx-auto" />
            <h3 className="mt-3 text-base font-bold text-slate-900">
              Tidak ada koleksi yang cocok
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              Ubah kata kunci pencarian atau reset filter format dan kategori.
            </p>
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setFormatFilter('all');
                setCategoryFilter('all');
              }}
              className="mt-4 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Reset Pencarian
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredBooks.map((book) => {
              const isDigitalOnly = book.format === 'digital_pdf';
              const isAvailable = isDigitalOnly || book.availableCopies > 0;
              const activeResCount = book.activeReservationsCount ?? 0;

              const userHasActiveLoan = Boolean(
                user &&
                  loans.some(
                    (l) => l.bookId === book.id && l.memberId === user.id && l.status === 'active'
                  )
              );
              const userHasActiveReservation = Boolean(
                user &&
                  reservations.some(
                    (r) =>
                      r.bookId === book.id && r.memberId === user.id && isActiveReservation(r)
                  )
              );

              return (
                <article
                  key={book.id}
                  className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col justify-between gap-4 hover:border-slate-300 transition-colors"
                >
                  <div>
                    <div className="flex gap-4">
                      <img
                        src={book.coverUrl}
                        alt={`Sampul ${book.title}`}
                        referrerPolicy="no-referrer"
                        className="w-20 h-28 object-cover rounded-lg border border-slate-200 bg-slate-100 shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        {/* Unboxed Clean Metadata (Zero-Pill Rule) */}
                        <p className="text-xs text-slate-500 truncate">
                          {book.category} <span aria-hidden="true">·</span> {book.year}{' '}
                          <span aria-hidden="true">·</span>{' '}
                          {book.format === 'digital_pdf'
                            ? 'Digital PDF'
                            : book.format === 'hybrid'
                              ? 'Cetak + PDF'
                              : 'Cetak OPAC'}
                        </p>
                        <h3 className="mt-1 text-base font-bold text-slate-900 leading-snug line-clamp-2">
                          {book.title}
                        </h3>
                        <p className="mt-1 text-xs font-medium text-slate-700 truncate">
                          {book.author}
                        </p>
                        <p className="mt-2 font-mono text-[11px] text-slate-500 truncate tabular-nums">
                          {book.assetCode} · {book.rackLocation}
                        </p>
                      </div>
                    </div>

                    <p className="mt-3 text-xs text-slate-600 leading-relaxed line-clamp-2">
                      {book.description}
                    </p>
                  </div>

                  <div className="pt-3 border-t border-slate-100 space-y-3">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span
                        className={`font-semibold tabular-nums ${
                          isAvailable ? 'text-emerald-700' : 'text-amber-700'
                        }`}
                      >
                        {isDigitalOnly
                          ? `Akses Penuh (${book.pageCount || 'PDF'} hal · Terproteksi)`
                          : isAvailable
                            ? `Tersedia ${book.availableCopies} dari ${book.totalCopies} eks${
                                activeResCount > 0 ? ` · ${activeResCount} Dipesan` : ''
                              }`
                            : activeResCount > 0
                              ? `Sedang Dipinjam · Dipesan (${activeResCount})`
                              : 'Sedang Dipinjam Semua'}
                      </span>
                      <span className="font-mono text-[11px] text-slate-400 shrink-0">
                        ISBN {book.isbn}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {book.hasPdf && (
                        <button
                          type="button"
                          onClick={() => onReadPdf(book)}
                          className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 transition-colors whitespace-nowrap"
                        >
                          <Lock className="w-3.5 h-3.5 text-teal-700" />
                          Baca di Sistem
                        </button>
                      )}
                      {!isDigitalOnly && isAvailable && (
                        <button
                          type="button"
                          disabled={busyBookId === book.id || userHasActiveLoan}
                          onClick={() => void handleBorrowClick(book)}
                          className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-teal-700 px-3 py-2 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-45 transition-colors whitespace-nowrap"
                        >
                          <QrCode className="w-3.5 h-3.5" />
                          {busyBookId === book.id
                            ? 'Meminjam...'
                            : userHasActiveLoan
                              ? 'Sedang Dipinjam'
                              : 'Pinjam Buku'}
                        </button>
                      )}
                      {!isDigitalOnly && !isAvailable && (
                        <button
                          type="button"
                          disabled={
                            busyBookId === book.id ||
                            userHasActiveLoan ||
                            userHasActiveReservation
                          }
                          onClick={() => void handleReserveClick(book)}
                          className={`flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
                            userHasActiveReservation || userHasActiveLoan
                              ? 'border border-amber-300 bg-amber-50 text-amber-900 opacity-85'
                              : 'bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50'
                          }`}
                        >
                          {userHasActiveReservation ? (
                            <BookmarkCheck className="w-3.5 h-3.5" />
                          ) : (
                            <BookmarkPlus className="w-3.5 h-3.5" />
                          )}
                          {busyBookId === book.id
                            ? 'Memesan...'
                            : userHasActiveLoan
                              ? 'Sedang Anda Pinjam'
                              : userHasActiveReservation
                                ? 'Sudah Dipesan'
                                : 'Pesan Buku'}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onShowLabel(book)}
                        aria-label={`Lihat kode QR dan barcode ${book.title}`}
                        className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors shrink-0"
                      >
                        <Tag className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
