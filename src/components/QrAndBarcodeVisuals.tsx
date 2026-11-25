import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Printer, X } from 'lucide-react';
import type { BookItem } from '../lib/types';

interface QrCodeImageProps {
  value: string;
  size?: number;
  alt: string;
  className?: string;
}

export const QrCodeImage: React.FC<QrCodeImageProps> = ({
  value,
  size = 140,
  alt,
  className = '',
}) => {
  const [dataUrl, setDataUrl] = useState<string>('');

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(value, {
      width: size * 2,
      margin: 1,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
    })
      .then((url) => {
        if (active) setDataUrl(url);
      })
      .catch(() => {
        if (active) setDataUrl('');
      });
    return () => {
      active = false;
    };
  }, [value, size]);

  if (!dataUrl) {
    return (
      <div
        style={{ width: size, height: size }}
        className={`bg-slate-100 border border-slate-200 rounded-lg animate-pulse ${className}`}
        aria-label={alt}
      />
    );
  }

  return (
    <img
      src={dataUrl}
      alt={alt}
      width={size}
      height={size}
      referrerPolicy="no-referrer"
      className={`rounded-lg border border-slate-200 bg-white ${className}`}
    />
  );
};

interface BarcodeSvgProps {
  code: string;
  height?: number;
}

export const BarcodeSvg: React.FC<BarcodeSvgProps> = ({ code, height = 42 }) => {
  // Deterministic Code-128-inspired bar pattern from code characters
  const bars: Array<{ x: number; w: number }> = [];
  let cursor = 4;

  // Start guard
  bars.push({ x: cursor, w: 2 });
  cursor += 4;
  bars.push({ x: cursor, w: 1 });
  cursor += 3;

  for (let i = 0; i < code.length; i++) {
    const ch = code.charCodeAt(i);
    const w1 = (ch % 3) + 1;
    const g1 = ((ch >> 2) % 2) + 1;
    const w2 = ((ch >> 3) % 2) + 1;
    const g2 = ((ch >> 4) % 2) + 1;
    bars.push({ x: cursor, w: w1 });
    cursor += w1 + g1;
    bars.push({ x: cursor, w: w2 });
    cursor += w2 + g2;
  }

  // Stop guard
  bars.push({ x: cursor, w: 1 });
  cursor += 3;
  bars.push({ x: cursor, w: 2 });
  cursor += 6;

  return (
    <div className="inline-flex flex-col items-center bg-white border border-slate-200 rounded-lg px-3 py-2">
      <svg
        viewBox={`0 0 ${cursor} ${height}`}
        className="w-full max-w-[200px] h-9"
        role="img"
        aria-label={`Barcode ${code}`}
      >
        {bars.map((b, idx) => (
          <rect key={idx} x={b.x} y={0} width={b.w} height={height} fill="#0f172a" />
        ))}
      </svg>
      <span className="mt-1 font-mono text-[11px] tracking-widest text-slate-700 tabular-nums">
        {code}
      </span>
    </div>
  );
};

interface AssetLabelModalProps {
  book: BookItem | null;
  onClose: () => void;
}

export const AssetLabelModal: React.FC<AssetLabelModalProps> = ({ book, onClose }) => {
  if (!book) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="asset-label-title"
    >
      <div className="w-full max-w-md rounded-2xl bg-white border border-slate-200 shadow-xl p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 id="asset-label-title" className="text-lg font-bold text-slate-900">
              Label QR &amp; Barcode Aset
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              Tempelkan label ini pada sampul dalam atau rak fisik perpustakaan.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup label aset"
            className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-5 flex flex-col items-center text-center">
          <p className="text-xs font-mono text-teal-800 font-semibold">
            {book.assetCode} · {book.rackLocation}
          </p>
          <p className="mt-1 text-sm font-bold text-slate-900 line-clamp-2">{book.title}</p>
          <p className="text-xs text-slate-500 mt-0.5">{book.author}</p>

          <div className="mt-4">
            <QrCodeImage
              value={book.qrPayload}
              size={156}
              alt={`QR Code untuk ${book.title}`}
            />
          </div>
          <p className="mt-2 font-mono text-[11px] text-slate-500">{book.qrPayload}</p>

          <div className="mt-4">
            <BarcodeSvg code={book.barcode} />
          </div>
        </div>

        <div className="mt-5 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
          >
            <Printer className="w-4 h-4" />
            Cetak Label
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 transition-colors whitespace-nowrap shrink-0"
          >
            Selesai
          </button>
        </div>
      </div>
    </div>
  );
};
