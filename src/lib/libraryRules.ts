import type {
  AssetCondition,
  BookFormat,
  BookItem,
  InventorySummary,
  LoanEvaluation,
  LoanRecord,
} from './types';

export const FINE_RATE_PER_DAY = 2000; // Rp 2.000 per hari keterlambatan
export const DEFAULT_LOAN_DAYS = 7;
export const DUE_SOON_THRESHOLD_DAYS = 2;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function formatRupiah(amount: number): string {
  const safe = Math.max(0, Math.round(amount));
  return `Rp ${safe.toLocaleString('id-ID')}`;
}

export function evaluateLoan(
  loan: Pick<LoanRecord, 'dueAt' | 'returnedAt' | 'status' | 'finePaid'>,
  now: Date = new Date()
): LoanEvaluation {
  const dueMs = new Date(loan.dueAt).getTime();
  const refMs =
    loan.status === 'returned' && loan.returnedAt
      ? new Date(loan.returnedAt).getTime()
      : now.getTime();

  const diffMs = dueMs - refMs;

  if (loan.status === 'returned') {
    const overdueDaysAtReturn = diffMs < 0 ? Math.ceil(Math.abs(diffMs) / MS_PER_DAY) : 0;
    const fineAmount = overdueDaysAtReturn * FINE_RATE_PER_DAY;
    return {
      daysRemaining: 0,
      daysOverdue: overdueDaysAtReturn,
      fineAmount,
      unpaidFine: Math.max(0, fineAmount - (loan.finePaid || 0)),
      health: 'returned',
      label: 'Dikembalikan',
    };
  }

  if (diffMs < 0) {
    const daysOverdue = Math.max(1, Math.ceil(Math.abs(diffMs) / MS_PER_DAY));
    const fineAmount = daysOverdue * FINE_RATE_PER_DAY;
    return {
      daysRemaining: 0,
      daysOverdue,
      fineAmount,
      unpaidFine: Math.max(0, fineAmount - (loan.finePaid || 0)),
      health: 'overdue',
      label: 'Terlambat',
    };
  }

  const daysRemaining = Math.ceil(diffMs / MS_PER_DAY);
  if (daysRemaining <= DUE_SOON_THRESHOLD_DAYS) {
    return {
      daysRemaining,
      daysOverdue: 0,
      fineAmount: 0,
      unpaidFine: 0,
      health: 'due_soon',
      label: 'Jatuh Tempo Segera',
    };
  }

  return {
    daysRemaining,
    daysOverdue: 0,
    fineAmount: 0,
    unpaidFine: 0,
    health: 'nominal',
    label: 'Tepat Waktu',
  };
}

export interface ParsedScanTarget {
  kind: 'qr_book' | 'loan_token' | 'barcode_or_isbn' | 'unknown';
  bookId?: string;
  assetCode?: string;
  loanQrToken?: string;
  code?: string;
}

export function parseScanPayload(rawInput: string): ParsedScanTarget {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return { kind: 'unknown' };
  }

  if (trimmed.startsWith('PK-QR:')) {
    const parts = trimmed.split(':');
    if (parts.length >= 2 && parts[1]) {
      return {
        kind: 'qr_book',
        bookId: parts[1].trim(),
        assetCode: parts[2]?.trim(),
      };
    }
  }

  if (trimmed.startsWith('PK-LOAN:')) {
    return {
      kind: 'loan_token',
      loanQrToken: trimmed,
    };
  }

  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      if (typeof parsed.bookId === 'string' && parsed.bookId.trim()) {
        return {
          kind: 'qr_book',
          bookId: parsed.bookId.trim(),
          assetCode: typeof parsed.assetCode === 'string' ? parsed.assetCode.trim() : undefined,
        };
      }
      if (typeof parsed.loanQrToken === 'string' && parsed.loanQrToken.trim()) {
        return {
          kind: 'loan_token',
          loanQrToken: parsed.loanQrToken.trim(),
        };
      }
    } catch {
      // Fall through to barcode match
    }
  }

  return {
    kind: 'barcode_or_isbn',
    code: trimmed,
  };
}

export function matchBookByScan(books: BookItem[], rawInput: string): BookItem | null {
  const parsed = parseScanPayload(rawInput);
  if (parsed.kind === 'qr_book') {
    const byId = books.find((b) => b.id === parsed.bookId);
    if (byId) return byId;
    if (parsed.assetCode) {
      return (
        books.find((b) => b.assetCode.toLowerCase() === parsed.assetCode!.toLowerCase()) ?? null
      );
    }
    return null;
  }

  if (parsed.kind === 'barcode_or_isbn' && parsed.code) {
    const normalized = parsed.code.replace(/[-\s]/g, '').toLowerCase();
    return (
      books.find((b) => {
        const isbnClean = b.isbn.replace(/[-\s]/g, '').toLowerCase();
        const barcodeClean = b.barcode.replace(/[-\s]/g, '').toLowerCase();
        const assetClean = b.assetCode.replace(/[-\s]/g, '').toLowerCase();
        return (
          isbnClean === normalized ||
          barcodeClean === normalized ||
          assetClean === normalized ||
          b.qrPayload.toLowerCase() === parsed.code!.toLowerCase()
        );
      }) ?? null
    );
  }

  return null;
}

export interface CsvBookDraft {
  title: string;
  author: string;
  isbn: string;
  publisher: string;
  year: number;
  category: string;
  format: BookFormat;
  rackLocation: string;
  assetCode: string;
  totalCopies: number;
  condition: AssetCondition;
  description: string;
}

export interface CsvParseResult {
  validBooks: CsvBookDraft[];
  errors: string[];
}

function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function normalizeFormat(raw: string): BookFormat {
  const v = raw.trim().toLowerCase();
  if (v === 'digital_pdf' || v === 'digital' || v === 'pdf' || v === 'ebook') {
    return 'digital_pdf';
  }
  if (v === 'hybrid' || v === 'keduanya' || v === 'cetak+pdf') {
    return 'hybrid';
  }
  return 'print';
}

function normalizeCondition(raw: string): AssetCondition {
  const v = raw.trim().toLowerCase();
  if (v.includes('rusak')) return 'Rusak';
  if (v.includes('perawatan') || v.includes('sedang')) return 'Perlu Perawatan';
  return 'Baik';
}

export function parseBooksCsv(csvText: string): CsvParseResult {
  const lines = csvText
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) {
    return {
      validBooks: [],
      errors: ['File CSV harus memiliki baris header dan minimal satu baris data buku.'],
    };
  }

  const rawHeaders = splitCsvLine(lines[0]).map((h) => h.toLowerCase().replace(/\s+/g, '_'));
  const colIndex = (aliases: string[]): number => {
    for (const alias of aliases) {
      const idx = rawHeaders.indexOf(alias);
      if (idx !== -1) return idx;
    }
    return -1;
  };

  const titleIdx = colIndex(['title', 'judul', 'judul_buku']);
  const authorIdx = colIndex(['author', 'penulis', 'pengarang']);
  const isbnIdx = colIndex(['isbn']);
  const publisherIdx = colIndex(['publisher', 'penerbit']);
  const yearIdx = colIndex(['year', 'tahun']);
  const categoryIdx = colIndex(['category', 'kategori']);
  const formatIdx = colIndex(['format', 'tipe']);
  const rackIdx = colIndex(['racklocation', 'rack', 'rak', 'lokasi_rak']);
  const assetIdx = colIndex(['assetcode', 'asset_code', 'kode_aset']);
  const copiesIdx = colIndex(['totalcopies', 'total_copies', 'copies', 'stok', 'jumlah']);
  const condIdx = colIndex(['condition', 'kondisi']);
  const descIdx = colIndex(['description', 'deskripsi']);

  if (titleIdx === -1 || authorIdx === -1) {
    return {
      validBooks: [],
      errors: ['Kolom wajib "title" (atau "judul") dan "author" (atau "penulis") tidak ditemukan pada header CSV.'],
    };
  }

  const validBooks: CsvBookDraft[] = [];
  const errors: string[] = [];

  for (let rowNum = 1; rowNum < lines.length; rowNum++) {
    const cols = splitCsvLine(lines[rowNum]);
    const title = (cols[titleIdx] ?? '').trim();
    const author = (cols[authorIdx] ?? '').trim();

    if (!title || !author) {
      errors.push(`Baris ${rowNum + 1}: Judul dan penulis wajib diisi.`);
      continue;
    }

    const format = formatIdx >= 0 ? normalizeFormat(cols[formatIdx] ?? '') : 'print';
    const rawYear = yearIdx >= 0 ? Number.parseInt(cols[yearIdx] ?? '', 10) : NaN;
    const year = Number.isFinite(rawYear) && rawYear >= 1900 && rawYear <= 2100 ? rawYear : 2025;

    const rawCopies = copiesIdx >= 0 ? Number.parseInt(cols[copiesIdx] ?? '', 10) : NaN;
    const totalCopies =
      format === 'digital_pdf'
        ? 999
        : Number.isFinite(rawCopies) && rawCopies > 0
          ? rawCopies
          : 3;

    const generatedSuffix = String(100 + rowNum).padStart(3, '0');
    const isbn = (isbnIdx >= 0 ? cols[isbnIdx] : '')?.trim() || `978-602-880-${generatedSuffix}-1`;
    const assetCode =
      (assetIdx >= 0 ? cols[assetIdx] : '')?.trim() || `AST-CSV-${generatedSuffix}`;
    const rackLocation =
      (rackIdx >= 0 ? cols[rackIdx] : '')?.trim() ||
      (format === 'digital_pdf' ? 'Repositori Digital' : 'Rak U-01');

    validBooks.push({
      title,
      author,
      isbn,
      publisher: (publisherIdx >= 0 ? cols[publisherIdx] : '')?.trim() || 'Pustaka Nusantara',
      year,
      category: (categoryIdx >= 0 ? cols[categoryIdx] : '')?.trim() || 'Umum',
      format,
      rackLocation,
      assetCode,
      totalCopies,
      condition: condIdx >= 0 ? normalizeCondition(cols[condIdx] ?? '') : 'Baik',
      description:
        (descIdx >= 0 ? cols[descIdx] : '')?.trim() ||
        `Koleksi ${title} karya ${author} terdata di inventaris PustakaKita.`,
    });
  }

  return { validBooks, errors };
}

export function computeInventorySummary(
  books: BookItem[],
  loans: LoanRecord[],
  now: Date = new Date()
): InventorySummary {
  let totalPhysicalCopies = 0;
  let availablePhysicalCopies = 0;
  let digitalTitles = 0;
  const conditionCounts: Record<AssetCondition, number> = {
    Baik: 0,
    'Perlu Perawatan': 0,
    Rusak: 0,
  };

  for (const book of books) {
    conditionCounts[book.condition] = (conditionCounts[book.condition] ?? 0) + 1;
    if (book.format === 'print' || book.format === 'hybrid') {
      totalPhysicalCopies += book.totalCopies;
      availablePhysicalCopies += Math.min(book.availableCopies, book.totalCopies);
    }
    if (book.format === 'digital_pdf' || book.format === 'hybrid' || book.hasPdf) {
      digitalTitles += 1;
    }
  }

  let activeLoansCount = 0;
  let overdueLoansCount = 0;
  let totalOutstandingFines = 0;

  for (const loan of loans) {
    const evalResult = evaluateLoan(loan, now);
    if (loan.status === 'active') {
      activeLoansCount += 1;
      if (evalResult.health === 'overdue') {
        overdueLoansCount += 1;
      }
    }
    totalOutstandingFines += evalResult.unpaidFine;
  }

  return {
    totalTitles: books.length,
    totalPhysicalCopies,
    availablePhysicalCopies,
    borrowedPhysicalCopies: Math.max(0, totalPhysicalCopies - availablePhysicalCopies),
    digitalTitles,
    activeLoansCount,
    overdueLoansCount,
    totalOutstandingFines,
    conditionCounts,
  };
}
