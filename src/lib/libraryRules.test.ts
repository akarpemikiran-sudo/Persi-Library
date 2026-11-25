import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canReserveBook,
  computeInventorySummary,
  evaluateLoan,
  FINE_RATE_PER_DAY,
  formatRupiah,
  isAdminRole,
  matchBookByScan,
  parseBooksCsv,
  parseScanPayload,
} from './libraryRules';
import type { BookItem, LoanRecord, ReservationRecord } from './types';

test('evaluateLoan computes nominal, due_soon, overdue fines, and returned states accurately', () => {
  const now = new Date('2026-11-25T10:00:00.000Z');

  const nominal = evaluateLoan(
    {
      dueAt: '2026-11-30T10:00:00.000Z',
      returnedAt: null,
      status: 'active',
      finePaid: 0,
    },
    now
  );
  assert.equal(nominal.health, 'nominal');
  assert.equal(nominal.fineAmount, 0);
  assert.equal(nominal.daysRemaining, 5);

  const dueSoon = evaluateLoan(
    {
      dueAt: '2026-11-26T10:00:00.000Z',
      returnedAt: null,
      status: 'active',
      finePaid: 0,
    },
    now
  );
  assert.equal(dueSoon.health, 'due_soon');
  assert.equal(dueSoon.daysRemaining, 1);

  const overdue = evaluateLoan(
    {
      dueAt: '2026-11-22T10:00:00.000Z',
      returnedAt: null,
      status: 'active',
      finePaid: 2000,
    },
    now
  );
  assert.equal(overdue.health, 'overdue');
  assert.equal(overdue.daysOverdue, 3);
  assert.equal(overdue.fineAmount, 3 * FINE_RATE_PER_DAY);
  assert.equal(overdue.unpaidFine, 4000);
});

test('parseScanPayload and matchBookByScan resolve QR codes, JSON payloads, barcodes, and ISBNs', () => {
  const sampleBooks: BookItem[] = [
    {
      id: 'bk-01',
      assetCode: 'AST-2026-001',
      isbn: '978-602-481-101-3',
      barcode: '9786024811013',
      qrPayload: 'PK-QR:bk-01:AST-2026-001',
      title: 'Arsitektur Nusantara',
      author: 'Y. Mangunwijaya',
      publisher: 'Pustaka',
      year: 2024,
      category: 'Arsitektur',
      format: 'hybrid',
      rackLocation: 'Rak A-01',
      condition: 'Baik',
      totalCopies: 4,
      availableCopies: 3,
      coverUrl: '/cover.jpg',
      hasPdf: true,
      pageCount: 12,
      description: 'Desc',
      createdAt: '2026-11-01T00:00:00.000Z',
    },
  ];

  assert.equal(parseScanPayload('PK-QR:bk-01:AST-2026-001').kind, 'qr_book');
  assert.equal(matchBookByScan(sampleBooks, 'PK-QR:bk-01:AST-2026-001')?.id, 'bk-01');
  assert.equal(matchBookByScan(sampleBooks, '978-602-481-101-3')?.id, 'bk-01');
  assert.equal(matchBookByScan(sampleBooks, '9786024811013')?.id, 'bk-01');
  assert.equal(matchBookByScan(sampleBooks, 'AST-2026-001')?.id, 'bk-01');
  assert.equal(matchBookByScan(sampleBooks, 'UNKNOWN-999'), null);
});

test('parseBooksCsv parses quoted CSV rows, Indonesian headers, and reports invalid rows', () => {
  const csv = [
    'judul,penulis,isbn,kategori,format,rak,jumlah,kondisi',
    '"Sistem Basis Data, Edisi 3",R. Kadir,978-602-111-001-2,Informatika,hybrid,Rak B-02,5,Baik',
    'Panduan Pustaka Digital,A. Pratama,978-602-111-002-9,Manajemen,digital_pdf,,1,Baik',
    ',Tanpa Judul,978-000,Umum,print,Rak C-01,2,Baik',
  ].join('\n');

  const res = parseBooksCsv(csv);
  assert.equal(res.validBooks.length, 2);
  assert.equal(res.errors.length, 1);
  assert.equal(res.validBooks[0].title, 'Sistem Basis Data, Edisi 3');
  assert.equal(res.validBooks[0].format, 'hybrid');
  assert.equal(res.validBooks[0].totalCopies, 5);
  assert.equal(res.validBooks[1].format, 'digital_pdf');
  assert.equal(res.validBooks[1].rackLocation, 'Repositori Digital');
});

test('computeInventorySummary aggregates physical copies, digital titles, and outstanding fines', () => {
  const now = new Date('2026-11-25T10:00:00.000Z');
  const books: BookItem[] = [
    {
      id: 'bk-1',
      assetCode: 'AST-1',
      isbn: '978-1',
      barcode: '9781',
      qrPayload: 'PK-QR:bk-1:AST-1',
      title: 'Buku Cetak',
      author: 'Penulis A',
      publisher: 'Penerbit',
      year: 2024,
      category: 'Sains',
      format: 'print',
      rackLocation: 'Rak A-01',
      condition: 'Baik',
      totalCopies: 5,
      availableCopies: 3,
      coverUrl: '',
      hasPdf: false,
      pageCount: 0,
      description: '',
      createdAt: '2026-11-01T00:00:00.000Z',
    },
    {
      id: 'bk-2',
      assetCode: 'AST-2',
      isbn: '978-2',
      barcode: '9782',
      qrPayload: 'PK-QR:bk-2:AST-2',
      title: 'E-Book PDF',
      author: 'Penulis B',
      publisher: 'Penerbit',
      year: 2025,
      category: 'Teknologi',
      format: 'digital_pdf',
      rackLocation: 'Repositori Digital',
      condition: 'Baik',
      totalCopies: 999,
      availableCopies: 999,
      coverUrl: '',
      hasPdf: true,
      pageCount: 8,
      description: '',
      createdAt: '2026-11-01T00:00:00.000Z',
    },
  ];
  const loans: LoanRecord[] = [
    {
      id: 'ln-1',
      bookId: 'bk-1',
      bookTitle: 'Buku Cetak',
      bookAssetCode: 'AST-1',
      bookBarcode: '9781',
      memberId: 'm-1',
      memberName: 'Budi',
      memberCode: 'PK-M-001',
      borrowedAt: '2026-11-10T10:00:00.000Z',
      dueAt: '2026-11-23T10:00:00.000Z',
      returnedAt: null,
      status: 'active',
      finePaid: 0,
      loanQrToken: 'PK-LOAN:ln-1',
    },
  ];

  const reservations: ReservationRecord[] = [
    {
      id: 'res-1',
      bookId: 'bk-1',
      bookTitle: 'Buku Cetak',
      bookAssetCode: 'AST-1',
      rackLocation: 'Rak A-01',
      memberId: 'm-2',
      memberName: 'Siti',
      memberCode: 'PK-M-002',
      reservedAt: '2026-11-24T10:00:00.000Z',
      status: 'waiting',
      notifiedReadyAt: null,
    },
  ];

  const summary = computeInventorySummary(books, loans, now, reservations);
  assert.equal(summary.totalTitles, 2);
  assert.equal(summary.totalPhysicalCopies, 5);
  assert.equal(summary.availablePhysicalCopies, 3);
  assert.equal(summary.borrowedPhysicalCopies, 2);
  assert.equal(summary.digitalTitles, 1);
  assert.equal(summary.activeLoansCount, 1);
  assert.equal(summary.overdueLoansCount, 1);
  assert.equal(summary.totalOutstandingFines, 4000);
  assert.equal(summary.activeReservationsCount, 1);
  assert.equal(summary.reservedBooksCount, 1);
  assert.equal(formatRupiah(summary.totalOutstandingFines), 'Rp 4.000');
});

test('canReserveBook and isAdminRole enforce reservation rules and super_admin permissions', () => {
  assert.equal(isAdminRole('super_admin'), true);
  assert.equal(isAdminRole('admin'), true);
  assert.equal(isAdminRole('member'), false);

  const outOfStockBook = { id: 'bk-9', format: 'print' as const, availableCopies: 0 };
  const inStockBook = { id: 'bk-10', format: 'print' as const, availableCopies: 2 };
  const digitalBook = { id: 'bk-11', format: 'digital_pdf' as const, availableCopies: 999 };

  assert.equal(canReserveBook(inStockBook, [], [], 'm-1').allowed, false);
  assert.equal(canReserveBook(digitalBook, [], [], 'm-1').allowed, false);
  assert.equal(canReserveBook(outOfStockBook, [], [], 'm-1').allowed, true);

  // Member already borrowing cannot reserve
  assert.equal(
    canReserveBook(
      outOfStockBook,
      [{ bookId: 'bk-9', memberId: 'm-1', status: 'active' }],
      [],
      'm-1'
    ).allowed,
    false
  );

  // Member who already has active reservation cannot double-reserve
  assert.equal(
    canReserveBook(
      outOfStockBook,
      [],
      [{ bookId: 'bk-9', memberId: 'm-1', status: 'waiting' }],
      'm-1'
    ).allowed,
    false
  );
});

