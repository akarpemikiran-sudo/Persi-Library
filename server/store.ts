import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import {
  DEFAULT_LOAN_DAYS,
  evaluateLoan,
  FINE_RATE_PER_DAY,
  formatRupiah,
} from '../src/lib/libraryRules';
import type {
  AssetCondition,
  BookFormat,
  BookItem,
  LibraryNotification,
  LoanRecord,
  UserProfile,
  UserRole,
} from '../src/lib/types';

export interface StoredUser extends UserProfile {
  passwordHash: string | null;
}

export interface StoredBook extends BookItem {
  pdfFileName: string | null;
}

export interface LibraryDatabase {
  users: StoredUser[];
  books: StoredBook[];
  loans: LoanRecord[];
  notifications: LibraryNotification[];
  adminClaimed: boolean;
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'pustakakita.json');
export const PDF_DIR = path.resolve(process.cwd(), 'storage', 'pdfs');

const SESSION_SECRET =
  process.env.SESSION_SECRET?.trim() || crypto.randomBytes(32).toString('hex');

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string | null): boolean {
  if (!storedHash || !storedHash.includes(':')) return false;
  const [salt, keyHex] = storedHash.split(':');
  if (!salt || !keyHex) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const keyBuf = Buffer.from(keyHex, 'hex');
  if (derived.length !== keyBuf.length) return false;
  return crypto.timingSafeEqual(derived, keyBuf);
}

export interface SessionPayload {
  userId: string;
  role: UserRole;
  exp: number;
}

export function signSessionToken(userId: string, role: UserRole): string {
  const payload: SessionPayload = {
    userId,
    role,
    exp: Date.now() + 1000 * 60 * 60 * 24 * 7,
  };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifySessionToken(token: string): SessionPayload | null {
  if (!token || !token.includes('.')) return null;
  const [encoded, sig] = token.split('.');
  if (!encoded || !sig) return null;
  const expectedSig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(encoded)
    .digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }
  try {
    const payload = JSON.parse(
      Buffer.from(encoded, 'base64url').toString('utf8')
    ) as SessionPayload;
    if (!payload.userId || !payload.role || Date.now() > payload.exp) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export function resolveSafePdfPath(fileName: string): string | null {
  const base = path.basename(fileName);
  if (!base || base !== fileName || !base.toLowerCase().endsWith('.pdf')) {
    return null;
  }
  const resolved = path.resolve(PDF_DIR, base);
  if (!resolved.startsWith(PDF_DIR + path.sep)) {
    return null;
  }
  return resolved;
}

async function createSamplePdfFile(
  fileName: string,
  title: string,
  author: string,
  chapters: string[]
): Promise<number> {
  fs.mkdirSync(PDF_DIR, { recursive: true });
  const target = resolveSafePdfPath(fileName);
  if (!target) return 0;

  if (fs.existsSync(target)) {
    const bytes = fs.readFileSync(target);
    const existing = await PDFDocument.load(bytes);
    return existing.getPageCount();
  }

  const doc = await PDFDocument.create();
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);
  const bodyFont = await doc.embedFont(StandardFonts.Helvetica);

  // Page 1: Title page
  const cover = doc.addPage([595, 842]);
  cover.drawRectangle({
    x: 48,
    y: 48,
    width: 499,
    height: 746,
    borderColor: rgb(0.06, 0.46, 0.43),
    borderWidth: 2,
  });
  cover.drawText('PUSTAKAKITA DIGITAL EDITION', {
    x: 78,
    y: 720,
    size: 11,
    font: boldFont,
    color: rgb(0.06, 0.46, 0.43),
  });
  cover.drawText(title, {
    x: 78,
    y: 650,
    size: 24,
    font: boldFont,
    color: rgb(0.06, 0.09, 0.16),
    maxWidth: 430,
    lineHeight: 30,
  });
  cover.drawText(`Penulis: ${author}`, {
    x: 78,
    y: 575,
    size: 14,
    font: bodyFont,
    color: rgb(0.28, 0.33, 0.41),
  });
  cover.drawText(
    'Dokumen ini dilindungi oleh sistem hak cipta PustakaKita.\nHanya dapat dibaca melalui pembaca terproteksi di dalam aplikasi.',
    {
      x: 78,
      y: 120,
      size: 10,
      font: bodyFont,
      color: rgb(0.39, 0.45, 0.55),
      lineHeight: 15,
    }
  );

  // Content pages
  chapters.forEach((chapterBody, idx) => {
    const page = doc.addPage([595, 842]);
    page.drawText(`${title} — Bab ${idx + 1}`, {
      x: 64,
      y: 780,
      size: 11,
      font: boldFont,
      color: rgb(0.06, 0.46, 0.43),
    });
    page.drawLine({
      start: { x: 64, y: 768 },
      end: { x: 531, y: 768 },
      thickness: 1,
      color: rgb(0.88, 0.91, 0.94),
    });
    page.drawText(chapterBody, {
      x: 64,
      y: 725,
      size: 12,
      font: bodyFont,
      color: rgb(0.12, 0.16, 0.23),
      maxWidth: 465,
      lineHeight: 20,
    });
    page.drawText(`Halaman ${idx + 2} dari ${chapters.length + 1}`, {
      x: 64,
      y: 48,
      size: 10,
      font: bodyFont,
      color: rgb(0.45, 0.5, 0.58),
    });
  });

  const pdfBytes = await doc.save();
  fs.writeFileSync(target, pdfBytes);
  return doc.getPageCount();
}

function buildSeedDatabase(now: Date): LibraryDatabase {
  const dayMs = 24 * 60 * 60 * 1000;
  const books: StoredBook[] = [
    {
      id: 'bk-arsitektur-01',
      assetCode: 'AST-2026-001',
      isbn: '978-602-481-101-3',
      barcode: '9786024811013',
      qrPayload: 'PK-QR:bk-arsitektur-01:AST-2026-001',
      title: 'Arsitektur Nusantara & Ruang Tropis',
      author: 'Ir. Hendra Wijaya, M.Ars.',
      publisher: 'Balai Pustaka Modern',
      year: 2025,
      category: 'Arsitektur',
      format: 'hybrid',
      rackLocation: 'Rak A-02',
      condition: 'Baik',
      totalCopies: 5,
      availableCopies: 4,
      coverUrl: '/src/assets/images/cover_arsitektur_nusantara_1795609545740.jpg',
      hasPdf: true,
      pdfFileName: 'seed-arsitektur-nusantara.pdf',
      pageCount: 4,
      description:
        'Kajian mendalam mengenai adaptasi struktur kayu, pencahayaan alami, dan ventilasi silang pada arsitektur publik tropis Indonesia.',
      createdAt: new Date(now.getTime() - 25 * dayMs).toISOString(),
    },
    {
      id: 'bk-algoritma-02',
      assetCode: 'AST-2026-002',
      isbn: '978-602-481-204-1',
      barcode: '9786024812041',
      qrPayload: 'PK-QR:bk-algoritma-02:AST-2026-002',
      title: 'Algoritma & Struktur Data Terapan',
      author: 'Dr. Nadia Kusuma',
      publisher: 'Penerbit Informatika',
      year: 2026,
      category: 'Teknologi',
      format: 'hybrid',
      rackLocation: 'Rak B-05',
      condition: 'Baik',
      totalCopies: 6,
      availableCopies: 4,
      coverUrl: '/src/assets/images/cover_algoritma_data_1795609545998.jpg',
      hasPdf: true,
      pdfFileName: 'seed-algoritma-data.pdf',
      pageCount: 4,
      description:
        'Referensi komprehensif tentang graf, pohon pencarian seimbang, dan analisis kompleksitas untuk sistem berskala besar.',
      createdAt: new Date(now.getTime() - 20 * dayMs).toISOString(),
    },
    {
      id: 'bk-tata-kelola-03',
      assetCode: 'AST-2026-003',
      isbn: '978-602-481-309-3',
      barcode: '9786024813093',
      qrPayload: 'PK-QR:bk-tata-kelola-03:AST-2026-003',
      title: 'Tata Kelola Aset & Perpustakaan Digital',
      author: 'Prof. Bagus Santoso',
      publisher: 'Literasi Cendekia',
      year: 2025,
      category: 'Manajemen',
      format: 'digital_pdf',
      rackLocation: 'Repositori Digital',
      condition: 'Baik',
      totalCopies: 999,
      availableCopies: 999,
      coverUrl: '/src/assets/images/cover_manajemen_aset_1795609547000.jpg',
      hasPdf: true,
      pdfFileName: 'seed-tata-kelola-aset.pdf',
      pageCount: 4,
      description:
        'Panduan modernisasi OPAC, pelabelan QR aset perpustakaan, pelestarian hak cipta PDF, dan kebijakan sirkulasi otomatis.',
      createdAt: new Date(now.getTime() - 18 * dayMs).toISOString(),
    },
    {
      id: 'bk-sejarah-04',
      assetCode: 'AST-2026-004',
      isbn: '978-602-481-412-0',
      barcode: '9786024814120',
      qrPayload: 'PK-QR:bk-sejarah-04:AST-2026-004',
      title: 'Jejak Pelayaran Rempah Kepulauan',
      author: 'Ratna Dewi Puspita',
      publisher: 'Cakrawala Sejarah',
      year: 2024,
      category: 'Sejarah',
      format: 'print',
      rackLocation: 'Rak C-01',
      condition: 'Baik',
      totalCopies: 4,
      availableCopies: 3,
      coverUrl: '/src/assets/images/cover_manajemen_aset_1795609547000.jpg',
      hasPdf: false,
      pdfFileName: null,
      pageCount: 0,
      description:
        'Edisi cetak koleksi khusus yang mendokumentasikan jalur perdagangan maritim Nusantara abad ke-15 hingga ke-18.',
      createdAt: new Date(now.getTime() - 14 * dayMs).toISOString(),
    },
    {
      id: 'bk-ekonomi-05',
      assetCode: 'AST-2026-005',
      isbn: '978-602-481-518-9',
      barcode: '9786024815189',
      qrPayload: 'PK-QR:bk-ekonomi-05:AST-2026-005',
      title: 'Ekonomi Sirkular & Inovasi Daerah',
      author: 'Dr. Dimas Prasetyo',
      publisher: 'Mandiri Pustaka',
      year: 2025,
      category: 'Ekonomi',
      format: 'print',
      rackLocation: 'Rak D-03',
      condition: 'Perlu Perawatan',
      totalCopies: 3,
      availableCopies: 2,
      coverUrl: '/src/assets/images/cover_arsitektur_nusantara_1795609545740.jpg',
      hasPdf: false,
      pdfFileName: null,
      pageCount: 0,
      description:
        'Studi kasus implementasi ekonomi sirkular pada rantai pasok agroindustri dan pengelolaan limbah kota.',
      createdAt: new Date(now.getTime() - 10 * dayMs).toISOString(),
    },
    {
      id: 'bk-desain-06',
      assetCode: 'AST-2026-006',
      isbn: '978-602-481-622-3',
      barcode: '9786024816223',
      qrPayload: 'PK-QR:bk-desain-06:AST-2026-006',
      title: 'Tipografi Editorial & Sistem Grid',
      author: 'Sinta Larasati',
      publisher: 'Studio Aksara',
      year: 2026,
      category: 'Desain',
      format: 'digital_pdf',
      rackLocation: 'Repositori Digital',
      condition: 'Baik',
      totalCopies: 999,
      availableCopies: 999,
      coverUrl: '/src/assets/images/cover_algoritma_data_1795609545998.jpg',
      hasPdf: true,
      pdfFileName: 'seed-tipografi-grid.pdf',
      pageCount: 3,
      description:
        'E-book eksklusif yang membahas proporsi huruf, ritme baca editorial, dan desain sistem antarmuka modern.',
      createdAt: new Date(now.getTime() - 6 * dayMs).toISOString(),
    },
  ];

  // Historical member records in circulation ledger (loginDisabled / passwordHash: null)
  const users: StoredUser[] = [
    {
      id: 'usr-hist-1',
      name: 'Raka Pratama',
      email: 'raka.pratama@anggota.pustakakita.id',
      memberCode: 'PK-M-1001',
      role: 'member',
      passwordHash: null,
      createdAt: new Date(now.getTime() - 30 * dayMs).toISOString(),
    },
    {
      id: 'usr-hist-2',
      name: 'Siti Nurhaliza',
      email: 'siti.nurhaliza@anggota.pustakakita.id',
      memberCode: 'PK-M-1002',
      role: 'member',
      passwordHash: null,
      createdAt: new Date(now.getTime() - 28 * dayMs).toISOString(),
    },
  ];

  const loans: LoanRecord[] = [
    {
      id: 'ln-seed-01',
      bookId: 'bk-arsitektur-01',
      bookTitle: 'Arsitektur Nusantara & Ruang Tropis',
      bookAssetCode: 'AST-2026-001',
      bookBarcode: '9786024811013',
      memberId: 'usr-hist-1',
      memberName: 'Raka Pratama',
      memberCode: 'PK-M-1001',
      borrowedAt: new Date(now.getTime() - 10 * dayMs).toISOString(),
      dueAt: new Date(now.getTime() - 3 * dayMs).toISOString(), // 3 days overdue -> Rp 6.000
      returnedAt: null,
      status: 'active',
      finePaid: 0,
      loanQrToken: 'PK-LOAN:ln-seed-01',
    },
    {
      id: 'ln-seed-02',
      bookId: 'bk-algoritma-02',
      bookTitle: 'Algoritma & Struktur Data Terapan',
      bookAssetCode: 'AST-2026-002',
      bookBarcode: '9786024812041',
      memberId: 'usr-hist-2',
      memberName: 'Siti Nurhaliza',
      memberCode: 'PK-M-1002',
      borrowedAt: new Date(now.getTime() - 6 * dayMs).toISOString(),
      dueAt: new Date(now.getTime() + 1 * dayMs).toISOString(), // Due tomorrow -> due_soon
      returnedAt: null,
      status: 'active',
      finePaid: 0,
      loanQrToken: 'PK-LOAN:ln-seed-02',
    },
    {
      id: 'ln-seed-03',
      bookId: 'bk-sejarah-04',
      bookTitle: 'Jejak Pelayaran Rempah Kepulauan',
      bookAssetCode: 'AST-2026-004',
      bookBarcode: '9786024814120',
      memberId: 'usr-hist-1',
      memberName: 'Raka Pratama',
      memberCode: 'PK-M-1001',
      borrowedAt: new Date(now.getTime() - 5 * dayMs).toISOString(),
      dueAt: new Date(now.getTime() + 2 * dayMs).toISOString(),
      returnedAt: null,
      status: 'active',
      finePaid: 0,
      loanQrToken: 'PK-LOAN:ln-seed-03',
    },
  ];

  const notifications: LibraryNotification[] = [
    {
      id: 'notif-seed-1',
      userId: 'usr-hist-1',
      targetRole: 'admin',
      type: 'overdue',
      title: 'Keterlambatan Pengembalian Terdeteksi',
      message:
        'Raka Pratama (PK-M-1001) terlambat 3 hari mengembalikan "Arsitektur Nusantara & Ruang Tropis". Denda berjalan: Rp 6.000.',
      read: false,
      createdAt: new Date(now.getTime() - 1 * 3600 * 1000).toISOString(),
      bookId: 'bk-arsitektur-01',
      loanId: 'ln-seed-01',
    },
    {
      id: 'notif-seed-2',
      userId: 'usr-hist-2',
      targetRole: 'admin',
      type: 'due_soon',
      title: 'Pengingat Jatuh Tempo Besok',
      message:
        'Siti Nurhaliza (PK-M-1002) memiliki batas pengembalian besok untuk "Algoritma & Struktur Data Terapan".',
      read: false,
      createdAt: new Date(now.getTime() - 2 * 3600 * 1000).toISOString(),
      bookId: 'bk-algoritma-02',
      loanId: 'ln-seed-02',
    },
  ];

  return {
    users,
    books,
    loans,
    notifications,
    adminClaimed: false,
  };
}

class LibraryStore {
  private db: LibraryDatabase;
  private listeners = new Set<(event: string, payload: unknown) => void>();

  constructor() {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.mkdirSync(PDF_DIR, { recursive: true });

    if (fs.existsSync(DB_FILE)) {
      try {
        const raw = fs.readFileSync(DB_FILE, 'utf8');
        this.db = JSON.parse(raw) as LibraryDatabase;
      } catch {
        this.db = buildSeedDatabase(new Date());
        this.save();
      }
    } else {
      this.db = buildSeedDatabase(new Date());
      this.save();
    }
  }

  async ensureSeedPdfs(): Promise<void> {
    const seeds: Array<{
      bookId: string;
      fileName: string;
      title: string;
      author: string;
      chapters: string[];
    }> = [
      {
        bookId: 'bk-arsitektur-01',
        fileName: 'seed-arsitektur-nusantara.pdf',
        title: 'Arsitektur Nusantara & Ruang Tropis',
        author: 'Ir. Hendra Wijaya, M.Ars.',
        chapters: [
          'Bab 1: Prinsip Ventilasi Silang dan Pencahayaan Alami.\n\nBangunan publik di wilayah tropis lembap menuntut bukaan terarah yang meminimalkan radiasi matahari langsung namun mengoptimalkan sirkulasi udara alami. Penggunaan kisi kayu dan teritisan lebar menjaga kenyamanan termal ruang baca sepanjang hari.',
          'Bab 2: Struktur Kayu Laminasi dan Konstruksi Berkelanjutan.\n\nKayu lokal dengan pengawetan ramah lingkungan menawarkan kekuatan tarik tinggi sekaligus menyerap karbon. Sambungan pasak modern mempermudah perakitan modular pada fasilitas perpustakaan komunitas.',
          'Bab 3: Studi Kasus Atrium Perpustakaan Hijau.\n\nPenataan rak bertingkat yang dipadukan dengan taman vertikal menurunkan suhu ambient hingga 3 derajat Celcius dan menciptakan ruang belajar yang tenang.',
        ],
      },
      {
        bookId: 'bk-algoritma-02',
        fileName: 'seed-algoritma-data.pdf',
        title: 'Algoritma & Struktur Data Terapan',
        author: 'Dr. Nadia Kusuma',
        chapters: [
          'Bab 1: Kompleksitas Waktu & Ruang pada Pengindeksan Katalog.\n\nDalam sistem OPAC modern dengan ratusan ribu judul buku, pencarian berbasis B-Tree dan Inverted Index memastikan waktu respons tetap berada di bawah 10 milidetik.',
          'Bab 2: Struktur Graf untuk Rekomendasi Koleksi.\n\nRelasi antar subyek, penulis, dan riwayat peminjaman dapat dimodelkan sebagai graf berbobot untuk membantu pemustaka menemukan literatur relevan.',
          'Bab 3: Hash Table & Validasi Kode QR Sirkulasi.\n\nSetiap transaksi peminjaman menghasilkan token unik yang divalidasi secara konstan O(1) melalui indeks hash aman.',
        ],
      },
      {
        bookId: 'bk-tata-kelola-03',
        fileName: 'seed-tata-kelola-aset.pdf',
        title: 'Tata Kelola Aset & Perpustakaan Digital',
        author: 'Prof. Bagus Santoso',
        chapters: [
          'Bab 1: Standarisasi Inventarisasi Aset Berbasis QR & Barcode.\n\nSetiap eksemplar buku cetak dan perangkat perpustakaan wajib memiliki kode aset unik yang tertaut pada basis data real-time untuk mempercepat stock opname.',
          'Bab 2: Perlindungan Hak Cipta Dokumen PDF.\n\nKoleksi digital berlisensi tidak boleh didistribusikan sebagai berkas unduhan bebas. Penyajian melalui canvas terenkripsi dengan watermark identitas anggota menjaga kepatuhan hak cipta.',
          'Bab 3: Otomatisasi Denda & Pengingat Jatuh Tempo.\n\nSistem notifikasi H-2 sebelum jatuh tempo terbukti meningkatkan disiplin pengembalian tepat waktu hingga 82 persen.',
        ],
      },
      {
        bookId: 'bk-desain-06',
        fileName: 'seed-tipografi-grid.pdf',
        title: 'Tipografi Editorial & Sistem Grid',
        author: 'Sinta Larasati',
        chapters: [
          'Bab 1: Hierarki Tipografi dan Keterbacaan Panjang.\n\nPanjang baris ideal antara 60 hingga 75 karakter dengan jarak antarbaris 1.55 kali ukuran huruf menjaga kenyamanan mata saat membaca dokumen panjang di layar.',
          'Bab 2: Disiplin Grid Modular pada Antarmuka Informasi.\n\nSistem grid 12 kolom membantu memisahkan navigasi utama, daftar katalog, dan panel detail tanpa menimbulkan kepadatan visual.',
        ],
      },
    ];

    let changed = false;
    for (const seed of seeds) {
      const count = await createSamplePdfFile(
        seed.fileName,
        seed.title,
        seed.author,
        seed.chapters
      );
      const book = this.db.books.find((b) => b.id === seed.bookId);
      if (book && count > 0 && book.pageCount !== count) {
        book.pageCount = count;
        changed = true;
      }
    }
    if (changed) this.save();
  }

  private save(): void {
    const tmpFile = `${DB_FILE}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(this.db, null, 2), 'utf8');
    fs.renameSync(tmpFile, DB_FILE);
  }

  subscribe(listener: (event: string, payload: unknown) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  broadcast(event: string, payload: unknown): void {
    for (const listener of this.listeners) {
      try {
        listener(event, payload);
      } catch {
        // Ignore closed stream
      }
    }
  }

  isAdminEnvConfigured(): boolean {
    return Boolean(process.env.ADMIN_PASSCODE && process.env.ADMIN_PASSCODE.trim().length > 0);
  }

  isAdminClaimed(): boolean {
    if (this.isAdminEnvConfigured()) return true;
    return this.db.adminClaimed && this.db.users.some((u) => u.role === 'admin');
  }

  claimFirstAdmin(name: string, email: string, password: string): UserProfile {
    if (this.isAdminClaimed()) {
      throw new Error('ADMIN_ALREADY_CLAIMED');
    }
    const cleanEmail = email.trim().toLowerCase();
    const adminUser: StoredUser = {
      id: `usr-admin-${crypto.randomUUID().slice(0, 8)}`,
      name: name.trim(),
      email: cleanEmail,
      memberCode: 'PK-ADM-001',
      role: 'admin',
      passwordHash: hashPassword(password),
      createdAt: new Date().toISOString(),
    };
    this.db.users.push(adminUser);
    this.db.adminClaimed = true;
    this.save();
    return this.sanitizeUser(adminUser);
  }

  registerMember(name: string, email: string, password: string): UserProfile {
    const cleanEmail = email.trim().toLowerCase();
    const existing = this.db.users.find((u) => u.email.toLowerCase() === cleanEmail);
    if (existing) {
      throw new Error('EMAIL_EXISTS');
    }
    const count = this.db.users.filter((u) => u.role === 'member').length + 1;
    const memberUser: StoredUser = {
      id: `usr-mem-${crypto.randomUUID().slice(0, 8)}`,
      name: name.trim(),
      email: cleanEmail,
      memberCode: `PK-M-${String(1000 + count)}`,
      role: 'member',
      passwordHash: hashPassword(password),
      createdAt: new Date().toISOString(),
    };
    this.db.users.push(memberUser);
    this.save();
    this.broadcast('library_update', { kind: 'member_registered' });
    return this.sanitizeUser(memberUser);
  }

  authenticateUser(email: string, password: string, role: UserRole): UserProfile | null {
    const cleanEmail = email.trim().toLowerCase();

    if (role === 'admin' && this.isAdminEnvConfigured()) {
      const envPass = process.env.ADMIN_PASSCODE!.trim();
      const passBuf = Buffer.from(password);
      const envBuf = Buffer.from(envPass);
      if (passBuf.length === envBuf.length && crypto.timingSafeEqual(passBuf, envBuf)) {
        let admin = this.db.users.find((u) => u.role === 'admin');
        if (!admin) {
          admin = {
            id: 'usr-admin-env',
            name: 'Pustakawan Utama',
            email: cleanEmail || 'admin@pustakakita.id',
            memberCode: 'PK-ADM-001',
            role: 'admin',
            passwordHash: null,
            createdAt: new Date().toISOString(),
          };
          this.db.users.push(admin);
          this.save();
        }
        return this.sanitizeUser(admin);
      }
      return null;
    }

    const user = this.db.users.find(
      (u) => u.email.toLowerCase() === cleanEmail && u.role === role
    );
    if (!user) return null;
    if (!verifyPassword(password, user.passwordHash)) return null;
    return this.sanitizeUser(user);
  }

  getUserById(userId: string): UserProfile | null {
    const found = this.db.users.find((u) => u.id === userId);
    return found ? this.sanitizeUser(found) : null;
  }

  sanitizeUser(user: StoredUser): UserProfile {
    const { passwordHash: _, ...profile } = user;
    return profile;
  }

  getBooks(): BookItem[] {
    return this.db.books.map(({ pdfFileName: _, ...book }) => book);
  }

  getStoredBook(bookId: string): StoredBook | null {
    return this.db.books.find((b) => b.id === bookId) ?? null;
  }

  addBook(input: {
    title: string;
    author: string;
    isbn: string;
    publisher: string;
    year: number;
    category: string;
    format: BookFormat;
    rackLocation: string;
    assetCode?: string;
    totalCopies: number;
    condition: AssetCondition;
    description: string;
    pdfFileName?: string | null;
    pageCount?: number;
    coverUrl?: string;
  }): BookItem {
    const id = `bk-${crypto.randomUUID().slice(0, 8)}`;
    const seq = String(this.db.books.length + 1).padStart(3, '0');
    const assetCode = input.assetCode?.trim() || `AST-2026-${seq}`;
    const cleanIsbn = input.isbn.trim() || `978-602-481-${seq}-0`;
    const barcode = cleanIsbn.replace(/[-\s]/g, '');
    const totalCopies = input.format === 'digital_pdf' ? 999 : Math.max(1, input.totalCopies);

    const coverChoices = [
      '/src/assets/images/cover_arsitektur_nusantara_1795609545740.jpg',
      '/src/assets/images/cover_algoritma_data_1795609545998.jpg',
      '/src/assets/images/cover_manajemen_aset_1795609547000.jpg',
    ];
    const defaultCover = coverChoices[this.db.books.length % coverChoices.length];

    const newBook: StoredBook = {
      id,
      assetCode,
      isbn: cleanIsbn,
      barcode,
      qrPayload: `PK-QR:${id}:${assetCode}`,
      title: input.title.trim(),
      author: input.author.trim(),
      publisher: input.publisher.trim() || 'PustakaKita Press',
      year: input.year || 2026,
      category: input.category.trim() || 'Umum',
      format: input.format,
      rackLocation:
        input.format === 'digital_pdf'
          ? 'Repositori Digital'
          : input.rackLocation.trim() || 'Rak U-01',
      condition: input.condition || 'Baik',
      totalCopies,
      availableCopies: totalCopies,
      coverUrl: input.coverUrl || defaultCover,
      hasPdf: Boolean(input.pdfFileName),
      pdfFileName: input.pdfFileName ?? null,
      pageCount: input.pageCount ?? 0,
      description: input.description.trim() || 'Koleksi perpustakaan PustakaKita.',
      createdAt: new Date().toISOString(),
    };

    this.db.books.unshift(newBook);
    this.save();
    this.broadcast('library_update', { kind: 'book_added', bookId: newBook.id });

    const { pdfFileName: _, ...publicBook } = newBook;
    return publicBook;
  }

  updateBookAsset(
    bookId: string,
    patch: Partial<Pick<BookItem, 'condition' | 'rackLocation' | 'totalCopies' | 'availableCopies'>>
  ): BookItem | null {
    const book = this.db.books.find((b) => b.id === bookId);
    if (!book) return null;

    if (patch.condition) book.condition = patch.condition;
    if (typeof patch.rackLocation === 'string' && patch.rackLocation.trim()) {
      book.rackLocation = patch.rackLocation.trim();
    }
    if (typeof patch.totalCopies === 'number' && book.format !== 'digital_pdf') {
      const nextTotal = Math.max(1, patch.totalCopies);
      const borrowed = Math.max(0, book.totalCopies - book.availableCopies);
      book.totalCopies = nextTotal;
      book.availableCopies = Math.max(0, nextTotal - borrowed);
    }
    if (typeof patch.availableCopies === 'number' && book.format !== 'digital_pdf') {
      book.availableCopies = Math.max(0, Math.min(book.totalCopies, patch.availableCopies));
    }

    this.save();
    this.broadcast('library_update', { kind: 'book_updated', bookId });
    const { pdfFileName: _, ...publicBook } = book;
    return publicBook;
  }

  deleteBook(bookId: string): boolean {
    const idx = this.db.books.findIndex((b) => b.id === bookId);
    if (idx === -1) return false;
    const [removed] = this.db.books.splice(idx, 1);
    if (removed.pdfFileName && !removed.pdfFileName.startsWith('seed-')) {
      const safePath = resolveSafePdfPath(removed.pdfFileName);
      if (safePath && fs.existsSync(safePath)) {
        try {
          fs.unlinkSync(safePath);
        } catch {
          // Ignore file removal error
        }
      }
    }
    this.save();
    this.broadcast('library_update', { kind: 'book_deleted', bookId });
    return true;
  }

  getLoansForUser(user: UserProfile): LoanRecord[] {
    if (user.role === 'admin') {
      return [...this.db.loans].sort(
        (a, b) => new Date(b.borrowedAt).getTime() - new Date(a.borrowedAt).getTime()
      );
    }
    return this.db.loans
      .filter((l) => l.memberId === user.id)
      .sort((a, b) => new Date(b.borrowedAt).getTime() - new Date(a.borrowedAt).getTime());
  }

  borrowBook(bookId: string, borrower: UserProfile, loanDays: number = DEFAULT_LOAN_DAYS): LoanRecord {
    const book = this.db.books.find((b) => b.id === bookId);
    if (!book) {
      throw new Error('BOOK_NOT_FOUND');
    }
    if (book.format === 'digital_pdf') {
      throw new Error('DIGITAL_ONLY_READ_IN_SYSTEM');
    }
    if (book.availableCopies <= 0) {
      throw new Error('OUT_OF_STOCK');
    }

    const alreadyActive = this.db.loans.find(
      (l) => l.bookId === book.id && l.memberId === borrower.id && l.status === 'active'
    );
    if (alreadyActive) {
      throw new Error('ALREADY_BORROWED');
    }

    const now = new Date();
    const due = new Date(now.getTime() + loanDays * 24 * 60 * 60 * 1000);
    const id = `ln-${crypto.randomUUID().slice(0, 8)}`;

    const loan: LoanRecord = {
      id,
      bookId: book.id,
      bookTitle: book.title,
      bookAssetCode: book.assetCode,
      bookBarcode: book.barcode,
      memberId: borrower.id,
      memberName: borrower.name,
      memberCode: borrower.memberCode,
      borrowedAt: now.toISOString(),
      dueAt: due.toISOString(),
      returnedAt: null,
      status: 'active',
      finePaid: 0,
      loanQrToken: `PK-LOAN:${id}`,
    };

    book.availableCopies = Math.max(0, book.availableCopies - 1);
    this.db.loans.unshift(loan);

    this.pushNotification({
      userId: borrower.id,
      type: 'borrow',
      title: 'Peminjaman Berhasil via QR/Barcode',
      message: `Anda meminjam "${book.title}" (${book.assetCode}). Batas pengembalian: ${due.toLocaleDateString('id-ID')}.`,
      bookId: book.id,
      loanId: loan.id,
    });

    this.save();
    this.broadcast('library_update', { kind: 'loan_created', loanId: loan.id, bookId: book.id });
    return loan;
  }

  returnLoan(loanId: string, actor: UserProfile): { loan: LoanRecord; fineDue: number } {
    const loan = this.db.loans.find((l) => l.id === loanId);
    if (!loan) throw new Error('LOAN_NOT_FOUND');
    if (actor.role !== 'admin' && loan.memberId !== actor.id) {
      throw new Error('FORBIDDEN');
    }
    if (loan.status === 'returned') {
      throw new Error('ALREADY_RETURNED');
    }

    const now = new Date();
    const evalBefore = evaluateLoan(loan, now);
    loan.status = 'returned';
    loan.returnedAt = now.toISOString();

    const book = this.db.books.find((b) => b.id === loan.bookId);
    if (book && book.format !== 'digital_pdf') {
      book.availableCopies = Math.min(book.totalCopies, book.availableCopies + 1);
    }

    this.pushNotification({
      userId: loan.memberId,
      type: 'return',
      title: 'Buku Dikembalikan',
      message:
        evalBefore.unpaidFine > 0
          ? `"${loan.bookTitle}" telah dikembalikan dengan denda keterlambatan ${formatRupiah(evalBefore.unpaidFine)}.`
          : `"${loan.bookTitle}" telah dikembalikan tepat waktu. Terima kasih!`,
      bookId: loan.bookId,
      loanId: loan.id,
    });

    this.save();
    this.broadcast('library_update', { kind: 'loan_returned', loanId: loan.id, bookId: loan.bookId });
    return { loan, fineDue: evalBefore.unpaidFine };
  }

  payLoanFine(loanId: string, actor: UserProfile): LoanRecord {
    const loan = this.db.loans.find((l) => l.id === loanId);
    if (!loan) throw new Error('LOAN_NOT_FOUND');
    if (actor.role !== 'admin' && loan.memberId !== actor.id) {
      throw new Error('FORBIDDEN');
    }

    const evalNow = evaluateLoan(loan, new Date());
    if (evalNow.unpaidFine <= 0) {
      return loan;
    }

    loan.finePaid = evalNow.fineAmount;

    this.pushNotification({
      userId: loan.memberId,
      type: 'fine_paid',
      title: 'Pembayaran Denda Lunas',
      message: `Denda sebesar ${formatRupiah(evalNow.unpaidFine)} untuk "${loan.bookTitle}" telah dilunasi.`,
      bookId: loan.bookId,
      loanId: loan.id,
    });

    this.save();
    this.broadcast('library_update', { kind: 'fine_paid', loanId: loan.id });
    return loan;
  }

  simulateLoanOverdueDays(loanId: string, daysOverdue: number): LoanRecord {
    const loan = this.db.loans.find((l) => l.id === loanId);
    if (!loan) throw new Error('LOAN_NOT_FOUND');
    const now = new Date();
    loan.status = 'active';
    loan.returnedAt = null;
    loan.dueAt = new Date(now.getTime() - daysOverdue * 24 * 60 * 60 * 1000).toISOString();
    loan.finePaid = 0;

    this.save();
    this.runOverdueNotificationSweep();
    this.broadcast('library_update', { kind: 'overdue_updated', loanId: loan.id });
    return loan;
  }

  runOverdueNotificationSweep(): LibraryNotification[] {
    const now = new Date();
    const created: LibraryNotification[] = [];

    for (const loan of this.db.loans) {
      if (loan.status !== 'active') continue;
      const evalResult = evaluateLoan(loan, now);

      if (evalResult.health === 'overdue') {
        const recentExists = this.db.notifications.some(
          (n) =>
            n.loanId === loan.id &&
            n.type === 'overdue' &&
            now.getTime() - new Date(n.createdAt).getTime() < 12 * 3600 * 1000 &&
            n.message.includes(formatRupiah(evalResult.fineAmount))
        );
        if (!recentExists) {
          const notif = this.pushNotification({
            userId: loan.memberId,
            targetRole: 'admin',
            type: 'overdue',
            title: 'Peringatan Keterlambatan & Denda Otomatis',
            message: `${loan.memberName} (${loan.memberCode}) terlambat ${evalResult.daysOverdue} hari untuk "${loan.bookTitle}". Denda otomatis: ${formatRupiah(evalResult.fineAmount)} (${formatRupiah(FINE_RATE_PER_DAY)}/hari).`,
            bookId: loan.bookId,
            loanId: loan.id,
          });
          created.push(notif);
        }
      } else if (evalResult.health === 'due_soon') {
        const recentExists = this.db.notifications.some(
          (n) =>
            n.loanId === loan.id &&
            n.type === 'due_soon' &&
            now.getTime() - new Date(n.createdAt).getTime() < 24 * 3600 * 1000
        );
        if (!recentExists) {
          const notif = this.pushNotification({
            userId: loan.memberId,
            targetRole: 'admin',
            type: 'due_soon',
            title: 'Pengingat Jatuh Tempo Peminjaman',
            message: `Batas pengembalian "${loan.bookTitle}" tersisa ${evalResult.daysRemaining} hari lagi. Segera kembalikan agar terhindar dari denda.`,
            bookId: loan.bookId,
            loanId: loan.id,
          });
          created.push(notif);
        }
      }
    }

    if (created.length > 0) {
      this.save();
      this.broadcast('notification_push', { count: created.length, notifications: created });
    }
    return created;
  }

  private pushNotification(input: {
    userId: string;
    targetRole?: UserRole;
    type: LibraryNotification['type'];
    title: string;
    message: string;
    bookId?: string;
    loanId?: string;
  }): LibraryNotification {
    const notif: LibraryNotification = {
      id: `notif-${crypto.randomUUID().slice(0, 8)}`,
      userId: input.userId,
      targetRole: input.targetRole,
      type: input.type,
      title: input.title,
      message: input.message,
      read: false,
      createdAt: new Date().toISOString(),
      bookId: input.bookId,
      loanId: input.loanId,
    };
    this.db.notifications.unshift(notif);
    if (this.db.notifications.length > 200) {
      this.db.notifications = this.db.notifications.slice(0, 200);
    }
    return notif;
  }

  getNotificationsForUser(user: UserProfile): LibraryNotification[] {
    if (user.role === 'admin') {
      return this.db.notifications.slice(0, 50);
    }
    return this.db.notifications.filter((n) => n.userId === user.id).slice(0, 50);
  }

  markNotificationRead(notifId: string, user: UserProfile): boolean {
    const notif = this.db.notifications.find((n) => n.id === notifId);
    if (!notif) return false;
    if (user.role !== 'admin' && notif.userId !== user.id) return false;
    notif.read = true;
    this.save();
    return true;
  }

  markAllNotificationsRead(user: UserProfile): void {
    for (const notif of this.db.notifications) {
      if (user.role === 'admin' || notif.userId === user.id) {
        notif.read = true;
      }
    }
    this.save();
  }

  getMembersSummary(): Array<
    UserProfile & { activeLoans: number; overdueLoans: number; unpaidFines: number }
  > {
    const now = new Date();
    return this.db.users
      .filter((u) => u.role === 'member')
      .map((u) => {
        const userLoans = this.db.loans.filter((l) => l.memberId === u.id);
        let activeLoans = 0;
        let overdueLoans = 0;
        let unpaidFines = 0;
        for (const loan of userLoans) {
          const ev = evaluateLoan(loan, now);
          if (loan.status === 'active') activeLoans++;
          if (ev.health === 'overdue') overdueLoans++;
          unpaidFines += ev.unpaidFine;
        }
        return {
          ...this.sanitizeUser(u),
          activeLoans,
          overdueLoans,
          unpaidFines,
        };
      });
  }
}

export const libraryStore = new LibraryStore();
