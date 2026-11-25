export type UserRole = 'super_admin' | 'admin' | 'member';

export type BookFormat = 'print' | 'digital_pdf' | 'hybrid';

export type AssetCondition = 'Baik' | 'Perlu Perawatan' | 'Rusak';

export type ReservationStatus = 'waiting' | 'ready' | 'fulfilled' | 'cancelled';

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  memberCode: string;
  role: UserRole;
  createdAt: string;
}

export interface BookItem {
  id: string;
  assetCode: string;
  isbn: string;
  barcode: string;
  qrPayload: string;
  title: string;
  author: string;
  publisher: string;
  year: number;
  category: string;
  format: BookFormat;
  rackLocation: string;
  condition: AssetCondition;
  totalCopies: number;
  availableCopies: number;
  activeReservationsCount?: number;
  coverUrl: string;
  hasPdf: boolean;
  pageCount: number;
  description: string;
  createdAt: string;
}

export interface LoanRecord {
  id: string;
  bookId: string;
  bookTitle: string;
  bookAssetCode: string;
  bookBarcode: string;
  memberId: string;
  memberName: string;
  memberCode: string;
  borrowedAt: string;
  dueAt: string;
  returnedAt: string | null;
  status: 'active' | 'returned';
  finePaid: number;
  loanQrToken: string;
}

export interface ReservationRecord {
  id: string;
  bookId: string;
  bookTitle: string;
  bookAssetCode: string;
  rackLocation: string;
  memberId: string;
  memberName: string;
  memberCode: string;
  reservedAt: string;
  status: ReservationStatus;
  notifiedReadyAt: string | null;
}

export interface LibraryNotification {
  id: string;
  userId: string;
  targetRole?: UserRole;
  type:
    | 'due_soon'
    | 'overdue'
    | 'borrow'
    | 'return'
    | 'fine_paid'
    | 'inventory'
    | 'reservation';
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
  bookId?: string;
  loanId?: string;
}

export interface LoanEvaluation {
  daysRemaining: number;
  daysOverdue: number;
  fineAmount: number;
  unpaidFine: number;
  health: 'returned' | 'nominal' | 'due_soon' | 'overdue';
  label: 'Dikembalikan' | 'Tepat Waktu' | 'Jatuh Tempo Segera' | 'Terlambat';
}

export interface InventorySummary {
  totalTitles: number;
  totalPhysicalCopies: number;
  availablePhysicalCopies: number;
  borrowedPhysicalCopies: number;
  digitalTitles: number;
  activeLoansCount: number;
  overdueLoansCount: number;
  totalOutstandingFines: number;
  activeReservationsCount: number;
  reservedBooksCount: number;
  conditionCounts: Record<AssetCondition, number>;
}
