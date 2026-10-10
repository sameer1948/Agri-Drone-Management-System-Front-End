export interface Drone {
  droneId: string;
  droneName: string;
  droneOwnerName: string;
  droneOwnerPhone: string;
}

export type PaymentStatus = 'PAID' | 'PENDING';

export interface LogEntry {
  logId?: number;
  bookingId: number;
  droneId: string;
  createDate: string;       // YYYY-MM-DD
  createTime: string;       // HH:mm:ss
  cropName: string;
  cropOwnerName: string;
  cropOwnerPhone: string;
  cropSize: number;
  cropVillage: string;
  tankUsage: number;
  amount: number;
  completeDate?: string;     // YYYY-MM-DD
  completeTime?: string;     // HH:mm:ss
  activityStatus: 'CONFIRMED' | 'COMPLETED' | 'CANCELLED';
  paymentStatus: PaymentStatus;
}

export interface Rate {
  id?: number;
  price: number;
}

export interface Booking {
  bookingId?: number;
  bookingDate: string;       // YYYY-MM-DD
  bookingDay?: string;       // Sunday, Monday...
  cropName: string;
  cropOwnerName: string;
  cropOwnerPhone: string;
  cropSize: number;          // e.g. 4.50
  cropVillage: string;
  price: number;             // Drone unit rate per tank / acre
  amount: number;            // Final calculated price
  bookingNotes: string;              // Optional notes
  bookingStatus?: 'PENDING' | 'CONFIRMED' | 'CANCELLED'; // Optional status
}

export interface PageResponse<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  size: number;
  number: number; // current page index (0-based)
  first: boolean;
  last: boolean;
}

export type BookingStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED';

export interface Payment {
  paymentId?: number;
  logId: number;
  paymentStatus: 'PENDING' | 'PAID';
  totalAmount: number;
  paidAmount: number;
  pendingAmount: number;
  paymentDate?: string;
  paymentTime?: string;
  lastPaymentDate?: string;
  lastPaymentTime?: string;
  paymentType?: string;
  paymentNotes?: string;
}

export interface PaymentRecordRequest {
  amountReceived: number;
  paymentType: 'CASH' | 'TRANSFER' | 'CHEQUE';
  paymentNotes?: string;
}

export interface Repair {
  repairId?: number;
  repairNote: string;
  amount: number;
  repairDate: string;    // YYYY-MM-DD
  repairTime: string;    // HH:mm:ss
  location: string;
  bookingId?: number;
}