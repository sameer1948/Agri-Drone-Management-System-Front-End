export interface Payment {

  paymentId?: number;
  logId: number;
  paymentStatus: PaymentStatus;
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

export type PaymentStatus = 'PAID' | 'PENDING';