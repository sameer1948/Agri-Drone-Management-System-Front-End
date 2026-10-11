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
  activityStatus: ActivityStatus; 
  paymentStatus: PaymentStatus;

}

export type ActivityStatus = 'CONFIRMED' | 'COMPLETED' | 'CANCELLED';

export type PaymentStatus = 'PAID' | 'PENDING';