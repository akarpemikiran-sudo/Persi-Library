import React, { useCallback, useEffect, useState } from 'react';
import { BookOpen, LogOut, QrCode, Shield, UserCheck } from 'lucide-react';
import { AdminDashboardView } from './components/AdminDashboardView';
import { AuthModal } from './components/AuthModal';
import { MemberDashboardView } from './components/MemberDashboardView';
import { OpacCatalogView } from './components/OpacCatalogView';
import { ProtectedPdfReader } from './components/ProtectedPdfReader';
import { OfflineIndicator, PWAInstallButton } from './components/PwaControls';
import { AssetLabelModal } from './components/QrAndBarcodeVisuals';
import { QrBarcodeScannerModal } from './components/QrBarcodeScannerModal';
import { usePushNotifications } from './hooks/usePushNotifications';
import { computeInventorySummary } from './lib/libraryRules';
import type {
  BookItem,
  InventorySummary,
  LibraryNotification,
  LoanRecord,
  UserProfile,
} from './lib/types';

type AppRoute = 'opac' | 'member' | 'admin';

interface MemberSummaryRow extends UserProfile {
  activeLoans: number;
  overdueLoans: number;
  unpaidFines: number;
}

const EMPTY_SUMMARY: InventorySummary = {
  totalTitles: 0,
  totalPhysicalCopies: 0,
  availablePhysicalCopies: 0,
  borrowedPhysicalCopies: 0,
  digitalTitles: 0,
  activeLoansCount: 0,
  overdueLoansCount: 0,
  totalOutstandingFines: 0,
  conditionCounts: { Baik: 0, 'Perlu Perawatan': 0, Rusak: 0 },
};

export default function App() {
  const [route, setRoute] = useState<AppRoute>('opac');
  const [user, setUser] = useState<UserProfile | null>(null);
  // Bearer token strictly in React memory (never localStorage/sessionStorage)
  const [token, setToken] = useState<string | null>(null);

  const [books, setBooks] = useState<BookItem[]>([]);
  const [summary, setSummary] = useState<InventorySummary>(EMPTY_SUMMARY);
  const [loans, setLoans] = useState<LoanRecord[]>([]);
  const [notifications, setNotifications] = useState<LibraryNotification[]>([]);
  const [members, setMembers] = useState<MemberSummaryRow[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(true);

  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authInitialRole, setAuthInitialRole] = useState<'member' | 'admin'>('member');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [readingBook, setReadingBook] = useState<BookItem | null>(null);
  const [labelBook, setLabelBook] = useState<BookItem | null>(null);

  const { permission: pushPermission, requestPermission, sendPushNotification } =
    usePushNotifications();

  const fetchCatalog = useCallback(async () => {
    try {
      const res = await fetch('/api/catalog');
      if (!res.ok) return;
      const data = (await res.json()) as {
        books: BookItem[];
        summary: InventorySummary;
      };
      setBooks(data.books);
      setSummary(data.summary);
    } finally {
      setLoadingCatalog(false);
    }
  }, []);

  const fetchUserWorkspace = useCallback(async () => {
    if (!token || !user) return;
    const headers = { Authorization: `Bearer ${token}` };

    const [loansRes, notifsRes] = await Promise.all([
      fetch('/api/loans', { headers }),
      fetch('/api/notifications', { headers }),
    ]);

    if (loansRes.ok) {
      const lData = (await loansRes.json()) as { loans: LoanRecord[] };
      setLoans(lData.loans);
    }
    if (notifsRes.ok) {
      const nData = (await notifsRes.json()) as { notifications: LibraryNotification[] };
      setNotifications(nData.notifications);
    }

    if (user.role === 'admin') {
      const mRes = await fetch('/api/admin/members', { headers });
      if (mRes.ok) {
        const mData = (await mRes.json()) as { members: MemberSummaryRow[] };
        setMembers(mData.members);
      }
    }
  }, [token, user]);

  const refreshAll = useCallback(async () => {
    await fetchCatalog();
    await fetchUserWorkspace();
  }, [fetchCatalog, fetchUserWorkspace]);

  useEffect(() => {
    void fetchCatalog();
  }, [fetchCatalog]);

  useEffect(() => {
    void fetchUserWorkspace();
  }, [fetchUserWorkspace]);

  // Real-time Server-Sent Events subscription
  useEffect(() => {
    const source = new EventSource('/api/events');

    source.addEventListener('library_update', () => {
      void refreshAll();
    });

    source.addEventListener('notification_push', (ev) => {
      try {
        const parsed = JSON.parse((ev as MessageEvent).data) as {
          notifications?: LibraryNotification[];
        };
        if (parsed.notifications && parsed.notifications.length > 0 && user) {
          const relevant = parsed.notifications.find(
            (n) => user.role === 'admin' || n.userId === user.id
          );
          if (relevant) {
            void sendPushNotification(relevant.title, relevant.message, relevant.id);
          }
        }
      } catch {
        // Ignore parse error
      }
      void refreshAll();
    });

    return () => {
      source.close();
    };
  }, [refreshAll, sendPushNotification, user]);

  const handleAuthSuccess = (loggedUser: UserProfile, sessionToken: string) => {
    setUser(loggedUser);
    setToken(sessionToken);
    if (loggedUser.role === 'admin') {
      setRoute('admin');
    } else {
      setRoute('member');
    }
  };

  const handleLogout = () => {
    setUser(null);
    setToken(null);
    setLoans([]);
    setNotifications([]);
    setMembers([]);
    setRoute('opac');
  };

  const openAuth = (preferredRole: 'member' | 'admin' = 'member') => {
    setAuthInitialRole(preferredRole);
    setAuthModalOpen(true);
  };

  const handleBorrowBook = async (book: BookItem, scanCode?: string) => {
    if (!token) {
      openAuth('member');
      throw new Error('Silakan masuk terlebih dahulu.');
    }
    const res = await fetch('/api/loans/borrow', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ bookId: book.id, scanCode }),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      throw new Error(data.error || 'Gagal meminjam buku.');
    }
    await refreshAll();
  };

  const handleReturnLoan = async (loanId: string) => {
    if (!token) return;
    await fetch(`/api/loans/${encodeURIComponent(loanId)}/return`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    await refreshAll();
  };

  const handlePayFine = async (loanId: string) => {
    if (!token) return;
    await fetch(`/api/loans/${encodeURIComponent(loanId)}/pay-fine`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    await refreshAll();
  };

  const handleMarkAllRead = async () => {
    if (!token) return;
    await fetch('/api/notifications/read-all', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    await fetchUserWorkspace();
  };

  const handleTestPush = async () => {
    await sendPushNotification(
      'PustakaKita: Pengingat Jatuh Tempo',
      'Sistem notifikasi pengingat aktif. Kembalikan buku tepat waktu untuk menghindari denda Rp 2.000/hari.',
      'pustakakita-test'
    );
  };

  const activeSummary = books.length > 0 ? summary : computeInventorySummary(books, loans);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 pb-16 md:pb-0">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Brand Title (Single text element) */}
          <button
            type="button"
            onClick={() => setRoute('opac')}
            className="text-xl font-extrabold tracking-tight text-slate-900 whitespace-nowrap shrink-0 text-left"
          >
            PustakaKita
          </button>

          {/* Zone 2: 4 Single-line Navigation Links */}
          <nav
            aria-label="Navigasi utama"
            className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600"
          >
            <button
              type="button"
              onClick={() => setRoute('opac')}
              className={`whitespace-nowrap shrink-0 py-1 transition-colors ${
                route === 'opac'
                  ? 'text-teal-800 font-semibold underline underline-offset-8 decoration-2'
                  : 'hover:text-slate-900'
              }`}
            >
              Katalog OPAC
            </button>
            <button
              type="button"
              onClick={() => setScannerOpen(true)}
              className="whitespace-nowrap shrink-0 py-1 hover:text-slate-900 transition-colors"
            >
              Pinjam QR
            </button>
            <button
              type="button"
              onClick={() => {
                if (!user) {
                  openAuth('member');
                } else {
                  setRoute('member');
                }
              }}
              className={`whitespace-nowrap shrink-0 py-1 transition-colors ${
                route === 'member'
                  ? 'text-teal-800 font-semibold underline underline-offset-8 decoration-2'
                  : 'hover:text-slate-900'
              }`}
            >
              Dasbor Anggota
            </button>
            <button
              type="button"
              onClick={() => {
                if (!user || user.role !== 'admin') {
                  openAuth('admin');
                } else {
                  setRoute('admin');
                }
              }}
              className={`whitespace-nowrap shrink-0 py-1 transition-colors ${
                route === 'admin'
                  ? 'text-teal-800 font-semibold underline underline-offset-8 decoration-2'
                  : 'hover:text-slate-900'
              }`}
            >
              Dasbor Admin
            </button>
          </nav>

          {/* Zone 3: 1 Primary Action */}
          <div className="shrink-0">
            {user ? (
              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
              >
                <LogOut className="w-3.5 h-3.5" />
                Keluar ({user.name.split(' ')[0]})
              </button>
            ) : (
              <button
                type="button"
                onClick={() => openAuth('member')}
                className="rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800 transition-colors whitespace-nowrap shrink-0"
              >
                Masuk / Daftar
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-8">
        {loadingCatalog && books.length === 0 ? (
          <div className="space-y-6 animate-pulse">
            <div className="h-72 rounded-2xl bg-slate-200" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="h-56 rounded-2xl bg-slate-200" />
              <div className="h-56 rounded-2xl bg-slate-200" />
              <div className="h-56 rounded-2xl bg-slate-200" />
            </div>
          </div>
        ) : route === 'admin' && user?.role === 'admin' && token ? (
          <AdminDashboardView
            books={books}
            loans={loans}
            summary={activeSummary}
            notifications={notifications}
            members={members}
            token={token}
            onRefreshAll={refreshAll}
            onShowLabel={setLabelBook}
            onReadPdf={setReadingBook}
          />
        ) : route === 'member' && user ? (
          <MemberDashboardView
            user={user}
            loans={loans}
            notifications={notifications}
            pushPermission={pushPermission}
            onEnablePush={requestPermission}
            onTestPush={handleTestPush}
            onOpenScanner={() => setScannerOpen(true)}
            onReturnLoan={handleReturnLoan}
            onPayFine={handlePayFine}
            onMarkAllRead={handleMarkAllRead}
          />
        ) : (
          <OpacCatalogView
            books={books}
            summary={activeSummary}
            user={user}
            onOpenScanner={() => setScannerOpen(true)}
            onBorrowDirect={(b) => handleBorrowBook(b)}
            onReadPdf={setReadingBook}
            onShowLabel={setLabelBook}
            onOpenAuth={() => openAuth('member')}
          />
        )}
      </main>

      {/* Quiet Editorial Footer with PWA Install Action */}
      <footer className="border-t border-slate-200 bg-white py-6 px-4 sm:px-6 mt-12">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <p>
            PustakaKita — Sistem Perpustakaan Digital, OPAC Cetak, Sirkulasi QR &amp; Proteksi PDF.
          </p>
          <div className="flex items-center gap-4">
            <PWAInstallButton />
            <span>Denda otomatis: Rp 2.000 / hari</span>
          </div>
        </div>
      </footer>

      {/* Mobile Bottom Thumb-Zone Navigation (height 56px <= 15% of 844px viewport) */}
      <nav
        aria-label="Navigasi seluler"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 h-14 bg-white/95 backdrop-blur-md border-t border-slate-200 grid grid-cols-4 items-center"
      >
        <button
          type="button"
          onClick={() => setRoute('opac')}
          className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium ${
            route === 'opac' ? 'text-teal-700 font-semibold' : 'text-slate-600'
          }`}
        >
          <BookOpen className="w-5 h-5" />
          <span>Katalog</span>
        </button>
        <button
          type="button"
          onClick={() => setScannerOpen(true)}
          className="min-h-[44px] flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium text-slate-600"
        >
          <QrCode className="w-5 h-5" />
          <span>Pindai QR</span>
        </button>
        <button
          type="button"
          onClick={() => (user ? setRoute('member') : openAuth('member'))}
          className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium ${
            route === 'member' ? 'text-teal-700 font-semibold' : 'text-slate-600'
          }`}
        >
          <UserCheck className="w-5 h-5" />
          <span>Anggota</span>
        </button>
        <button
          type="button"
          onClick={() =>
            user?.role === 'admin' ? setRoute('admin') : openAuth('admin')
          }
          className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium ${
            route === 'admin' ? 'text-teal-700 font-semibold' : 'text-slate-600'
          }`}
        >
          <Shield className="w-5 h-5" />
          <span>Admin</span>
        </button>
      </nav>

      {/* Modals & Protected Reader */}
      <AuthModal
        isOpen={authModalOpen}
        initialRole={authInitialRole}
        onClose={() => setAuthModalOpen(false)}
        onSuccess={handleAuthSuccess}
      />

      <QrBarcodeScannerModal
        isOpen={scannerOpen}
        books={books}
        user={user}
        onClose={() => setScannerOpen(false)}
        onBorrowBook={(book, scanCode) => handleBorrowBook(book, scanCode)}
        onOpenAuth={() => {
          setScannerOpen(false);
          openAuth('member');
        }}
        onReadPdf={setReadingBook}
      />

      <ProtectedPdfReader
        book={readingBook}
        token={token}
        user={user}
        onClose={() => setReadingBook(null)}
        onRequireLogin={() => {
          setReadingBook(null);
          openAuth('member');
        }}
      />

      <AssetLabelModal book={labelBook} onClose={() => setLabelBook(null)} />
      <OfflineIndicator />
    </div>
  );
}
