import React, { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { ChevronLeft, ChevronRight, Lock, ShieldCheck, X, ZoomIn, ZoomOut } from 'lucide-react';
import type { BookItem, UserProfile } from '../lib/types';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface ProtectedPdfReaderProps {
  book: BookItem | null;
  token: string | null;
  user: UserProfile | null;
  onClose: () => void;
  onRequireLogin: () => void;
}

export const ProtectedPdfReader: React.FC<ProtectedPdfReaderProps> = ({
  book,
  token,
  user,
  onClose,
  onRequireLogin,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(0.95);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Block Save (Ctrl+S / Cmd+S) and Print (Ctrl+P / Cmd+P) shortcuts while reading protected PDF
  useEffect(() => {
    if (!book) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && ['s', 'p', 'u'].includes(e.key.toLowerCase())) {
        e.preventDefault();
      }
      if (e.key === 'Escape') {
        onClose();
      }
      if (e.key === 'ArrowRight') {
        setPageNumber((p) => (numPages > 0 ? Math.min(numPages, p + 1) : p));
      }
      if (e.key === 'ArrowLeft') {
        setPageNumber((p) => Math.max(1, p - 1));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [book, numPages, onClose]);

  // Load authenticated PDF stream into memory (never exposed as downloadable URL)
  useEffect(() => {
    if (!book || !token) {
      setPdfDoc(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setPageNumber(1);

    (async () => {
      try {
        const res = await fetch(`/api/books/${encodeURIComponent(book.id)}/pdf-bytes`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          cache: 'no-store',
        });

        if (!res.ok) {
          const errData = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(errData.error || 'Gagal memuat konten PDF terproteksi.');
        }

        const arrayBuffer = await res.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
        const doc = await loadingTask.promise;

        if (cancelled) {
          await loadingTask.destroy();
          return;
        }
        setPdfDoc(doc);
        setNumPages(doc.numPages);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Gagal membuka dokumen.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [book, token]);

  // Render active page onto canvas + draw live member copyright watermark
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;

    let cancelled = false;
    let renderTask: pdfjsLib.RenderTask | null = null;

    (async () => {
      try {
        const page = await pdfDoc.getPage(pageNumber);
        if (cancelled || !canvasRef.current) return;

        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');
        if (!context) return;

        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        context.setTransform(dpr, 0, 0, dpr, 0, 0);
        renderTask = page.render({ canvas, canvasContext: context, viewport });
        await renderTask.promise;

        if (cancelled) return;

        // Watermark layer stamped directly onto the rendered canvas
        context.save();
        context.globalAlpha = 0.14;
        context.fillStyle = '#0f766e';
        context.font = '600 13px "JetBrains Mono", monospace';
        const stamp = `PustakaKita · Baca di Sistem · ${user?.name ?? 'Anggota'} (${user?.memberCode ?? 'DRM'})`;

        context.translate(viewport.width / 2, viewport.height / 2);
        context.rotate(-Math.PI / 6);
        for (let y = -320; y <= 320; y += 140) {
          context.fillText(stamp, -220, y);
        }
        context.restore();
      } catch {
        // Ignore render cancellation on fast page flip
      }
    })();

    return () => {
      cancelled = true;
      if (renderTask) {
        try {
          renderTask.cancel();
        } catch {
          // Ignore cancel error
        }
      }
    };
  }, [pdfDoc, pageNumber, scale, user]);

  if (!book) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-slate-950 text-slate-100 select-none no-print-reader"
      onContextMenu={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="pdf-reader-title"
    >
      {/* Top Protected Reader Header */}
      <header className="flex items-center justify-between gap-4 border-b border-slate-800 bg-slate-900 px-4 sm:px-6 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-teal-400 shrink-0" />
            <h2 id="pdf-reader-title" className="text-sm sm:text-base font-bold text-white truncate">
              {book.title}
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-0.5 truncate">
            Mode Baca Terproteksi · Unduhan dan cetak dinonaktifkan untuk perlindungan hak cipta
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setScale((s) => Math.max(0.75, Number((s - 0.2).toFixed(2))))}
            aria-label="Perkecil halaman"
            className="min-h-[38px] min-w-[38px] inline-flex items-center justify-center rounded-lg border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700 transition-colors"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="hidden sm:inline-block font-mono text-xs text-slate-300 tabular-nums w-12 text-center">
            {Math.round(scale * 100)}%
          </span>
          <button
            type="button"
            onClick={() => setScale((s) => Math.min(2.2, Number((s + 0.2).toFixed(2))))}
            aria-label="Perbesar halaman"
            className="min-h-[38px] min-w-[38px] inline-flex items-center justify-center rounded-lg border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700 transition-colors"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="ml-2 inline-flex items-center gap-1.5 rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-xs font-medium text-white hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0"
          >
            <X className="w-4 h-4" />
            Tutup Pembaca
          </button>
        </div>
      </header>

      {/* Main Protected Canvas Viewport */}
      <div className="flex-1 overflow-auto flex flex-col items-center py-6 px-4 bg-slate-950">
        {!token ? (
          <div className="my-auto max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center">
            <ShieldCheck className="w-10 h-10 text-teal-400 mx-auto" />
            <h3 className="mt-4 text-lg font-bold text-white">
              Masuk untuk Membaca Koleksi PDF
            </h3>
            <p className="mt-2 text-sm text-slate-400">
              Sesuai kebijakan hak cipta PustakaKita, koleksi PDF hanya dapat dibaca langsung di dalam sistem oleh anggota terdaftar dan tidak dapat diunduh.
            </p>
            <button
              type="button"
              onClick={onRequireLogin}
              className="mt-5 rounded-lg bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-500 transition-colors"
            >
              Masuk / Daftar Anggota
            </button>
          </div>
        ) : loading ? (
          <div className="my-auto text-center">
            <div className="w-10 h-10 border-2 border-teal-400 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="mt-3 text-sm text-slate-300">Memuat halaman PDF terenkripsi...</p>
          </div>
        ) : error ? (
          <div className="my-auto max-w-md rounded-xl border border-red-800 bg-red-950/60 p-6 text-center text-red-200">
            <p className="text-sm font-medium">{error}</p>
          </div>
        ) : (
          <div className="relative shadow-2xl rounded-lg overflow-hidden border border-slate-800 bg-white">
            <canvas
              ref={canvasRef}
              data-testid="protected-pdf-canvas"
              className="block max-w-full h-auto pointer-events-none"
            />
          </div>
        )}
      </div>

      {/* Bottom Page Pagination Bar */}
      {token && numPages > 0 && (
        <footer className="border-t border-slate-800 bg-slate-900 px-4 py-3 flex items-center justify-center gap-4">
          <button
            type="button"
            disabled={pageNumber <= 1}
            onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700 disabled:opacity-40 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            Sebelumnya
          </button>
          <span className="font-mono text-xs text-slate-300 tabular-nums">
            Halaman {pageNumber} / {numPages}
          </span>
          <button
            type="button"
            disabled={pageNumber >= numPages}
            onClick={() => setPageNumber((p) => Math.min(numPages, p + 1))}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700 disabled:opacity-40 transition-colors"
          >
            Berikutnya
            <ChevronRight className="w-4 h-4" />
          </button>
        </footer>
      )}
    </div>
  );
};
