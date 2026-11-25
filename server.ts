import crypto from 'node:crypto';
import express, { type NextFunction, type Request, type Response } from 'express';
import fs from 'node:fs';
import multer from 'multer';
import path from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { createServer as createViteServer } from 'vite';
import {
  computeInventorySummary,
  isAdminRole,
  matchBookByScan,
  parseBooksCsv,
} from './src/lib/libraryRules';
import type { AssetCondition, BookFormat, UserProfile } from './src/lib/types';
import {
  libraryStore,
  PDF_DIR,
  resolveSafePdfPath,
  signSessionToken,
  verifySessionToken,
} from './server/store';

interface AuthenticatedRequest extends Request {
  user?: UserProfile;
}

const PORT = Number(process.env.PORT) || 3000;

const uploadPdfStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    fs.mkdirSync(PDF_DIR, { recursive: true });
    cb(null, PDF_DIR);
  },
  filename: (_req, _file, cb) => {
    cb(null, `upload-${crypto.randomUUID()}.pdf`);
  },
});

const uploadPdf = multer({
  storage: uploadPdfStorage,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (
      file.mimetype === 'application/pdf' ||
      file.originalname.toLowerCase().endsWith('.pdf')
    ) {
      cb(null, true);
    } else {
      cb(new Error('Hanya file berformat PDF yang diperbolehkan.'));
    }
  },
});

const uploadCsv = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Sesi otentikasi diperlukan. Silakan masuk terlebih dahulu.' });
    return;
  }
  const token = header.slice('Bearer '.length).trim();
  const payload = verifySessionToken(token);
  if (!payload) {
    res.status(401).json({ error: 'Sesi telah kedaluwarsa atau tidak valid.' });
    return;
  }
  const user = libraryStore.getUserById(payload.userId);
  if (!user) {
    res.status(401).json({ error: 'Akun pengguna tidak ditemukan.' });
    return;
  }
  req.user = user;
  next();
}

function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  requireAuth(req, res, () => {
    if (!isAdminRole(req.user?.role)) {
      res.status(403).json({ error: 'Akses khusus Administrator atau Super Admin perpustakaan.' });
      return;
    }
    next();
  });
}

function requireSuperAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  requireAuth(req, res, () => {
    if (req.user?.role !== 'super_admin') {
      res.status(403).json({ error: 'Akses khusus Super Admin perpustakaan.' });
      return;
    }
    next();
  });
}

async function startServer(): Promise<void> {
  await libraryStore.ensureSeedPdfs();
  libraryStore.runOverdueNotificationSweep();

  // Periodic background overdue and due-soon check every 60 seconds
  setInterval(() => {
    libraryStore.runOverdueNotificationSweep();
  }, 60_000);

  const app = express();
  app.use(express.json({ limit: '4mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'PustakaKita', timestamp: new Date().toISOString() });
  });

  // Real-time Server-Sent Events stream
  app.get('/api/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    res.write(`event: connected\ndata: ${JSON.stringify({ ok: true })}\n\n`);

    const unsubscribe = libraryStore.subscribe((eventName, payload) => {
      res.write(`event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`);
    });

    const keepAlive = setInterval(() => {
      res.write(': ping\n\n');
    }, 25_000);

    req.on('close', () => {
      clearInterval(keepAlive);
      unsubscribe();
    });
  });

  // Public OPAC Catalog & live inventory metrics
  app.get('/api/catalog', (_req, res) => {
    const books = libraryStore.getBooks();
    const sysUser: UserProfile = {
      id: 'sys',
      name: 'System',
      email: '',
      memberCode: '',
      role: 'super_admin',
      createdAt: '',
    };
    const summary = computeInventorySummary(
      books,
      libraryStore.getLoansForUser(sysUser),
      new Date(),
      libraryStore.getReservationsForUser(sysUser)
    );
    res.json({ books, summary });
  });

  // Auth status & endpoints
  app.get('/api/auth/admin-status', (_req, res) => {
    res.json({
      claimed: libraryStore.isAdminClaimed(),
      superAdminClaimed: libraryStore.isSuperAdminClaimed(),
      envConfigured: libraryStore.isAdminEnvConfigured(),
    });
  });

  app.post('/api/auth/super-admin-register', (req, res) => {
    const { name, email, password } = req.body as {
      name?: string;
      email?: string;
      password?: string;
    };
    if (!name?.trim() || !email?.trim() || !password || password.length < 6) {
      res.status(400).json({
        error: 'Nama lengkap, email, dan kata sandi (minimal 6 karakter) wajib diisi.',
      });
      return;
    }
    try {
      const superAdmin = libraryStore.registerFirstSuperAdmin(name, email, password);
      const token = signSessionToken(superAdmin.id, superAdmin.role);
      res.status(201).json({ user: superAdmin, token });
    } catch (err) {
      if (err instanceof Error && err.message === 'SUPER_ADMIN_ALREADY_CLAIMED') {
        res.status(409).json({
          error: 'Akun Super Admin sudah terdaftar. Silakan masuk menggunakan akun Super Admin atau Admin.',
        });
        return;
      }
      if (err instanceof Error && err.message === 'EMAIL_EXISTS') {
        res.status(409).json({ error: 'Alamat email sudah digunakan oleh akun lain.' });
        return;
      }
      res.status(500).json({ error: 'Gagal mendaftarkan akun Super Admin.' });
    }
  });

  app.post('/api/auth/register', (req, res) => {
    const { name, email, password } = req.body as {
      name?: string;
      email?: string;
      password?: string;
    };
    if (!name?.trim() || !email?.trim() || !password || password.length < 6) {
      res.status(400).json({
        error: 'Nama lengkap, email, dan kata sandi (minimal 6 karakter) wajib diisi.',
      });
      return;
    }
    try {
      const user = libraryStore.registerMember(name, email, password);
      const token = signSessionToken(user.id, user.role);
      res.status(201).json({ user, token });
    } catch (err) {
      if (err instanceof Error && err.message === 'EMAIL_EXISTS') {
        res.status(409).json({ error: 'Email sudah terdaftar sebagai anggota.' });
        return;
      }
      res.status(500).json({ error: 'Gagal mendaftarkan anggota.' });
    }
  });

  app.post('/api/auth/login', (req, res) => {
    const { email, password, role } = req.body as {
      email?: string;
      password?: string;
      role?: 'admin' | 'member';
    };
    const targetRole: 'admin' | 'member' = role === 'admin' ? 'admin' : 'member';
    if (!password || (!libraryStore.isAdminEnvConfigured() && !email?.trim())) {
      res.status(400).json({ error: 'Email dan kata sandi wajib diisi.' });
      return;
    }
    if (targetRole === 'admin' && !libraryStore.isSuperAdminClaimed()) {
      res.status(403).json({
        error: 'Akun Super Admin belum dibuat. Silakan daftarkan akun Super Admin terlebih dahulu.',
      });
      return;
    }
    const user = libraryStore.authenticateUser(email ?? '', password, targetRole);
    if (!user) {
      res.status(401).json({
        error:
          targetRole === 'admin'
            ? 'Email atau kata sandi admin / super admin tidak sesuai.'
            : 'Email atau kata sandi anggota tidak sesuai.',
      });
      return;
    }
    const token = signSessionToken(user.id, user.role);
    res.json({ user, token });
  });

  app.get('/api/auth/me', requireAuth, (req: AuthenticatedRequest, res) => {
    res.json({ user: req.user });
  });

  // Protected in-system PDF stream (NO Content-Disposition: attachment, authenticated only)
  app.get('/api/books/:id/pdf-bytes', requireAuth, (req: AuthenticatedRequest, res) => {
    const book = libraryStore.getStoredBook(String(req.params.id));
    if (!book || !book.hasPdf || !book.pdfFileName) {
      res.status(404).json({ error: 'Konten PDF untuk buku ini tidak tersedia.' });
      return;
    }
    const safePath = resolveSafePdfPath(book.pdfFileName);
    if (!safePath || !fs.existsSync(safePath)) {
      res.status(404).json({ error: 'Berkas PDF tidak ditemukan di repositori aman.' });
      return;
    }

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.sendFile(safePath);
  });

  // Admin: Add single book with optional PDF upload
  app.post(
    '/api/books',
    requireAdmin,
    uploadPdf.single('pdfFile'),
    async (req: AuthenticatedRequest, res) => {
      try {
        const body = req.body as Record<string, string | undefined>;
        const title = body.title?.trim() ?? '';
        const author = body.author?.trim() ?? '';
        if (!title || !author) {
          if (req.file) fs.unlinkSync(req.file.path);
          res.status(400).json({ error: 'Judul buku dan nama penulis wajib diisi.' });
          return;
        }

        const formatRaw = (body.format ?? 'print') as BookFormat;
        const format: BookFormat =
          formatRaw === 'digital_pdf' || formatRaw === 'hybrid' ? formatRaw : 'print';

        let pageCount = 0;
        let pdfFileName: string | null = null;
        if (req.file) {
          pdfFileName = req.file.filename;
          try {
            const pdfBytes = fs.readFileSync(req.file.path);
            const loaded = await PDFDocument.load(pdfBytes);
            pageCount = loaded.getPageCount();
          } catch {
            fs.unlinkSync(req.file.path);
            res.status(400).json({ error: 'Berkas PDF tidak valid atau rusak.' });
            return;
          }
        } else if (format === 'digital_pdf') {
          res.status(400).json({
            error: 'Buku berformat Digital PDF wajib menyertakan unggahan berkas PDF.',
          });
          return;
        }

        const parsedYear = Number.parseInt(body.year ?? '2026', 10);
        const parsedCopies = Number.parseInt(body.totalCopies ?? '3', 10);
        const conditionRaw = (body.condition ?? 'Baik') as AssetCondition;
        const condition: AssetCondition =
          conditionRaw === 'Perlu Perawatan' || conditionRaw === 'Rusak' ? conditionRaw : 'Baik';

        const created = libraryStore.addBook({
          title,
          author,
          isbn: body.isbn ?? '',
          publisher: body.publisher ?? 'PustakaKita Press',
          year: Number.isFinite(parsedYear) ? parsedYear : 2026,
          category: body.category ?? 'Umum',
          format: pdfFileName && format === 'print' ? 'hybrid' : format,
          rackLocation: body.rackLocation ?? 'Rak U-01',
          assetCode: body.assetCode,
          totalCopies: Number.isFinite(parsedCopies) ? parsedCopies : 3,
          condition,
          description: body.description ?? '',
          pdfFileName,
          pageCount,
        });

        res.status(201).json({ book: created });
      } catch (err) {
        if (req.file && fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
        res.status(400).json({
          error: err instanceof Error ? err.message : 'Gagal menyimpan data buku.',
        });
      }
    }
  );

  // Admin: Bulk CSV upload (file or raw CSV text)
  app.post(
    '/api/books/bulk-csv',
    requireAdmin,
    uploadCsv.single('csvFile'),
    (req: AuthenticatedRequest, res) => {
      const csvContent = req.file
        ? req.file.buffer.toString('utf8')
        : typeof req.body?.csvText === 'string'
          ? req.body.csvText
          : '';

      if (!csvContent.trim()) {
        res.status(400).json({ error: 'File CSV atau teks CSV tidak boleh kosong.' });
        return;
      }

      const { validBooks, errors } = parseBooksCsv(csvContent);
      if (validBooks.length === 0) {
        res.status(400).json({
          error: errors[0] || 'Tidak ada baris buku valid yang dapat diimpor.',
          errors,
        });
        return;
      }

      const added = validBooks.map((draft) =>
        libraryStore.addBook({
          ...draft,
          pdfFileName: null,
          pageCount: 0,
        })
      );

      res.status(201).json({
        importedCount: added.length,
        books: added,
        errors,
      });
    }
  );

  app.patch('/api/books/:id', requireAdmin, (req, res) => {
    const updated = libraryStore.updateBookAsset(String(req.params.id), req.body);
    if (!updated) {
      res.status(404).json({ error: 'Buku tidak ditemukan.' });
      return;
    }
    res.json({ book: updated });
  });

  app.delete('/api/books/:id', requireAdmin, (req, res) => {
    const ok = libraryStore.deleteBook(String(req.params.id));
    if (!ok) {
      res.status(404).json({ error: 'Buku tidak ditemukan.' });
      return;
    }
    res.json({ ok: true });
  });

  // Loans & QR/Barcode circulation
  app.get('/api/loans', requireAuth, (req: AuthenticatedRequest, res) => {
    const loans = libraryStore.getLoansForUser(req.user!);
    res.json({ loans });
  });

  app.post('/api/loans/borrow', requireAuth, (req: AuthenticatedRequest, res) => {
    const { bookId, scanCode, loanDays } = req.body as {
      bookId?: string;
      scanCode?: string;
      loanDays?: number;
    };

    const books = libraryStore.getBooks();
    let targetBook = bookId ? books.find((b) => b.id === bookId) ?? null : null;
    if (!targetBook && scanCode) {
      targetBook = matchBookByScan(books, scanCode);
    }

    if (!targetBook) {
      res.status(404).json({
        error: 'Kode QR atau barcode buku tidak ditemukan di katalog PustakaKita.',
      });
      return;
    }

    try {
      const days =
        typeof loanDays === 'number' && loanDays >= 1 && loanDays <= 30 ? loanDays : 7;
      const loan = libraryStore.borrowBook(targetBook.id, req.user!, days);
      res.status(201).json({ loan, book: targetBook });
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      if (code === 'DIGITAL_ONLY_READ_IN_SYSTEM') {
        res.status(400).json({
          error:
            'Koleksi Digital PDF dapat langsung dibaca di dalam sistem tanpa peminjaman fisik.',
        });
        return;
      }
      if (code === 'OUT_OF_STOCK') {
        res.status(409).json({ error: 'Seluruh eksemplar cetak buku ini sedang dipinjam.' });
        return;
      }
      if (code === 'ALREADY_BORROWED') {
        res.status(409).json({ error: 'Anda masih memiliki peminjaman aktif untuk buku ini.' });
        return;
      }
      res.status(400).json({ error: 'Gagal memproses peminjaman buku.' });
    }
  });

  app.post('/api/loans/:id/return', requireAuth, (req: AuthenticatedRequest, res) => {
    try {
      const result = libraryStore.returnLoan(String(req.params.id), req.user!);
      res.json(result);
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      if (code === 'LOAN_NOT_FOUND') {
        res.status(404).json({ error: 'Data peminjaman tidak ditemukan.' });
        return;
      }
      if (code === 'FORBIDDEN') {
        res.status(403).json({ error: 'Anda tidak berwenang mengembalikan peminjaman ini.' });
        return;
      }
      res.status(400).json({ error: 'Peminjaman sudah dikembalikan sebelumnya.' });
    }
  });

  app.post('/api/loans/:id/pay-fine', requireAuth, (req: AuthenticatedRequest, res) => {
    try {
      const loan = libraryStore.payLoanFine(String(req.params.id), req.user!);
      res.json({ loan });
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      if (code === 'LOAN_NOT_FOUND') {
        res.status(404).json({ error: 'Data peminjaman tidak ditemukan.' });
        return;
      }
      res.status(403).json({ error: 'Tidak memiliki izin untuk melunasi denda ini.' });
    }
  });

  // Admin: Run overdue check & optional overdue simulation for audit
  app.post('/api/admin/run-overdue-audit', requireAdmin, (_req, res) => {
    const notifications = libraryStore.runOverdueNotificationSweep();
    res.json({ generatedCount: notifications.length, notifications });
  });

  app.post('/api/admin/loans/:id/simulate-overdue', requireAdmin, (req, res) => {
    const days = Number(req.body?.daysOverdue ?? 3);
    if (!Number.isFinite(days) || days < 1 || days > 90) {
      res.status(400).json({ error: 'Jumlah hari keterlambatan harus antara 1 hingga 90.' });
      return;
    }
    try {
      const loan = libraryStore.simulateLoanOverdueDays(String(req.params.id), days);
      res.json({ loan });
    } catch {
      res.status(404).json({ error: 'Peminjaman tidak ditemukan.' });
    }
  });

  app.get('/api/admin/members', requireAdmin, (_req, res) => {
    res.json({ members: libraryStore.getMembersSummary() });
  });

  app.get('/api/admin/staff', requireAdmin, (_req, res) => {
    res.json({ staff: libraryStore.getStaffAdmins() });
  });

  app.post('/api/admin/staff', requireSuperAdmin, (req, res) => {
    const { name, email, password } = req.body as {
      name?: string;
      email?: string;
      password?: string;
    };
    if (!name?.trim() || !email?.trim() || !password || password.length < 6) {
      res.status(400).json({
        error: 'Nama staf, email, dan kata sandi (minimal 6 karakter) wajib diisi.',
      });
      return;
    }
    try {
      const admin = libraryStore.createStaffAdmin(name, email, password);
      res.status(201).json({ admin });
    } catch (err) {
      if (err instanceof Error && err.message === 'EMAIL_EXISTS') {
        res.status(409).json({ error: 'Email sudah digunakan oleh akun lain.' });
        return;
      }
      res.status(500).json({ error: 'Gagal membuat akun admin staf.' });
    }
  });

  // Book Reservations
  app.get('/api/reservations', requireAuth, (req: AuthenticatedRequest, res) => {
    res.json({ reservations: libraryStore.getReservationsForUser(req.user!) });
  });

  app.post('/api/reservations', requireAuth, (req: AuthenticatedRequest, res) => {
    const { bookId } = req.body as { bookId?: string };
    if (!bookId?.trim()) {
      res.status(400).json({ error: 'ID buku wajib disertakan untuk reservasi.' });
      return;
    }
    try {
      const reservation = libraryStore.reserveBook(bookId.trim(), req.user!);
      res.status(201).json({ reservation });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal membuat reservasi buku.';
      if (msg === 'BOOK_NOT_FOUND') {
        res.status(404).json({ error: 'Buku tidak ditemukan di katalog.' });
        return;
      }
      res.status(409).json({ error: msg });
    }
  });

  app.post('/api/reservations/:id/cancel', requireAuth, (req: AuthenticatedRequest, res) => {
    try {
      const reservation = libraryStore.cancelReservation(String(req.params.id), req.user!);
      res.json({ reservation });
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      if (code === 'RESERVATION_NOT_FOUND') {
        res.status(404).json({ error: 'Data reservasi tidak ditemukan.' });
        return;
      }
      if (code === 'FORBIDDEN') {
        res.status(403).json({ error: 'Anda tidak berwenang membatalkan reservasi ini.' });
        return;
      }
      res.status(400).json({ error: 'Reservasi sudah tidak aktif.' });
    }
  });

  // Notifications
  app.get('/api/notifications', requireAuth, (req: AuthenticatedRequest, res) => {
    res.json({ notifications: libraryStore.getNotificationsForUser(req.user!) });
  });

  app.post('/api/notifications/:id/read', requireAuth, (req: AuthenticatedRequest, res) => {
    const ok = libraryStore.markNotificationRead(String(req.params.id), req.user!);
    res.json({ ok });
  });

  app.post('/api/notifications/read-all', requireAuth, (req: AuthenticatedRequest, res) => {
    libraryStore.markAllNotificationsRead(req.user!);
    res.json({ ok: true });
  });

  // Multer & API error handler
  app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/api/')) {
      const message = err instanceof Error ? err.message : 'Terjadi kesalahan pada server.';
      res.status(400).json({ error: message });
      return;
    }
    next(err);
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`PustakaKita server listening on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start PustakaKita server:', err);
  process.exit(1);
});
