import React, { useEffect, useId, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Barcode, Camera, CheckCircle2, QrCode, ScanLine, Upload, X } from 'lucide-react';
import { matchBookByScan } from '../lib/libraryRules';
import type { BookItem, UserProfile } from '../lib/types';

interface QrBarcodeScannerModalProps {
  isOpen: boolean;
  books: BookItem[];
  user: UserProfile | null;
  onClose: () => void;
  onBorrowBook: (book: BookItem, scanCode: string) => Promise<void>;
  onOpenAuth: () => void;
  onReadPdf: (book: BookItem) => void;
}

export const QrBarcodeScannerModal: React.FC<QrBarcodeScannerModalProps> = ({
  isOpen,
  books,
  user,
  onClose,
  onBorrowBook,
  onOpenAuth,
  onReadPdf,
}) => {
  const readerId = useId().replace(/:/g, '');
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [scanInput, setScanInput] = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [matchedBook, setMatchedBook] = useState<BookItem | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const stopCamera = async () => {
    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) {
          await scannerRef.current.stop();
        }
        scannerRef.current.clear();
      } catch {
        // Ignore cleanup errors
      }
      scannerRef.current = null;
    }
    setCameraActive(false);
  };

  useEffect(() => {
    if (!isOpen) {
      void stopCamera();
      setMatchedBook(null);
      setStatusMessage(null);
      setErrorMessage(null);
      setCameraError(null);
      setScanInput('');
    }
  }, [isOpen]);

  const handleResolveCode = (raw: string) => {
    setScanInput(raw);
    setErrorMessage(null);
    setStatusMessage(null);
    const found = matchBookByScan(books, raw);
    if (!found) {
      setMatchedBook(null);
      setErrorMessage(`Kode "${raw}" tidak cocok dengan buku mana pun di katalog.`);
      return;
    }
    setMatchedBook(found);
  };

  const startCamera = async () => {
    setCameraError(null);
    setErrorMessage(null);
    try {
      await stopCamera();
      const instance = new Html5Qrcode(`qr-reader-${readerId}`);
      scannerRef.current = instance;
      await instance.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        (decodedText) => {
          handleResolveCode(decodedText);
          void stopCamera();
        },
        () => {
          // Frame decode miss - normal while scanning
        }
      );
      setCameraActive(true);
    } catch {
      setCameraError(
        'Kamera tidak tersedia atau izin kamera ditolak. Gunakan pemindai gambar atau input kode barcode/QR manual di bawah.'
      );
      setCameraActive(false);
    }
  };

  const handleFileScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMessage(null);
    try {
      const tempScanner = new Html5Qrcode(`qr-file-${readerId}`);
      const decoded = await tempScanner.scanFile(file, true);
      tempScanner.clear();
      handleResolveCode(decoded);
    } catch {
      setErrorMessage('QR Code atau barcode tidak terbaca pada gambar tersebut.');
    } finally {
      e.target.value = '';
    }
  };

  const handleBorrowSubmit = async () => {
    if (!matchedBook) return;
    if (!user) {
      onOpenAuth();
      return;
    }
    setSubmitting(true);
    setErrorMessage(null);
    try {
      await onBorrowBook(matchedBook, scanInput || matchedBook.qrPayload);
      setStatusMessage(
        `Berhasil meminjam "${matchedBook.title}" (${matchedBook.assetCode}). Batas pengembalian 7 hari.`
      );
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Gagal memproses peminjaman buku.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const borrowableSamples = books.filter((b) => b.format !== 'digital_pdf').slice(0, 3);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="scanner-modal-title"
    >
      <div className="w-full max-w-xl rounded-2xl bg-white border border-slate-200 shadow-2xl p-6 my-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="scanner-modal-title" className="text-xl font-bold text-slate-900">
              Pemindai QR &amp; Barcode Buku
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Pindai QR Code aset atau barcode ISBN di sampul belakang buku untuk peminjaman instan.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup pemindai"
            className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mt-5 space-y-4">
          {/* Camera or File Upload Controls */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                {!cameraActive ? (
                  <button
                    type="button"
                    onClick={startCamera}
                    className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 transition-colors whitespace-nowrap shrink-0"
                  >
                    <Camera className="w-4 h-4" />
                    Aktifkan Kamera
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void stopCamera()}
                    className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900 transition-colors whitespace-nowrap shrink-0"
                  >
                    Hentikan Kamera
                  </button>
                )}

                <label className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer whitespace-nowrap shrink-0">
                  <Upload className="w-4 h-4" />
                  Pindai Gambar
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileScan}
                    className="sr-only"
                  />
                </label>
              </div>
              <span className="text-xs text-slate-500 font-mono">QR · EAN-13 · Code-128</span>
            </div>

            <div
              id={`qr-reader-${readerId}`}
              className={`mt-3 overflow-hidden rounded-lg bg-slate-900 ${
                cameraActive ? 'min-h-[220px]' : 'hidden'
              }`}
            />
            <div id={`qr-file-${readerId}`} className="hidden" />

            {cameraError && (
              <p className="mt-3 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                {cameraError}
              </p>
            )}
          </div>

          {/* Direct Barcode / QR Code Input */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleResolveCode(scanInput);
            }}
            className="space-y-2"
          >
            <label
              htmlFor="manual-scan-input"
              className="block text-sm font-medium text-slate-800"
            >
              Input Kode QR / Barcode ISBN / Kode Aset
            </label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <ScanLine className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="manual-scan-input"
                  type="text"
                  value={scanInput}
                  onChange={(e) => setScanInput(e.target.value)}
                  placeholder="Contoh: 9786024811013 atau PK-QR:bk-arsitektur-01:AST-2026-001"
                  className="w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 py-2.5 text-sm font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-600 focus:border-teal-600"
                />
              </div>
              <button
                type="submit"
                className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
              >
                Cek Kode
              </button>
            </div>
          </form>

          {/* Quick-Pick Sample Barcodes for Instant Testing */}
          {borrowableSamples.length > 0 && (
            <div>
              <p className="text-xs font-medium text-slate-500 mb-2">
                Simulasi Pindai Cepat dari Katalog:
              </p>
              <div className="flex flex-wrap gap-2">
                {borrowableSamples.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => handleResolveCode(b.barcode)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-teal-50 hover:border-teal-300 hover:text-teal-900 transition-colors"
                  >
                    <Barcode className="w-3.5 h-3.5 text-teal-700" />
                    <span className="truncate max-w-[160px]">{b.title}</span>
                    <span className="font-mono text-slate-400">({b.assetCode})</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {errorMessage && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {errorMessage}
            </div>
          )}

          {statusMessage && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 flex items-start gap-2.5">
              <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
              <span>{statusMessage}</span>
            </div>
          )}

          {/* Matched Book Result Card */}
          {matchedBook && (
            <div className="rounded-xl border border-slate-200 bg-white p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3 min-w-0">
                <img
                  src={matchedBook.coverUrl}
                  alt={matchedBook.title}
                  referrerPolicy="no-referrer"
                  className="w-14 h-20 object-cover rounded-md border border-slate-200 shrink-0"
                />
                <div className="min-w-0">
                  <p className="text-xs font-mono text-slate-500">
                    {matchedBook.assetCode} · {matchedBook.rackLocation}
                  </p>
                  <h4 className="text-sm font-bold text-slate-900 truncate">
                    {matchedBook.title}
                  </h4>
                  <p className="text-xs text-slate-600">{matchedBook.author}</p>
                  <p className="mt-1 text-xs font-medium text-teal-800 tabular-nums">
                    {matchedBook.format === 'digital_pdf'
                      ? 'Format Digital PDF (Baca di Sistem)'
                      : `Stok Tersedia: ${matchedBook.availableCopies} dari ${matchedBook.totalCopies} eksemplar`}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {matchedBook.hasPdf && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onReadPdf(matchedBook);
                    }}
                    className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
                  >
                    Baca di Sistem
                  </button>
                )}
                {matchedBook.format !== 'digital_pdf' && (
                  <button
                    type="button"
                    disabled={submitting || matchedBook.availableCopies <= 0}
                    onClick={handleBorrowSubmit}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
                  >
                    <QrCode className="w-3.5 h-3.5" />
                    {submitting
                      ? 'Memproses...'
                      : user
                        ? 'Konfirmasi Pinjam'
                        : 'Masuk untuk Pinjam'}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
