export interface Drone {
  droneId: string;
  droneName: string;
  droneOwnerName: string;
  droneOwnerPhone: string;
}

export type PaymentStatus = 'PAID' | 'PENDING';

export interface LogEntry {
  serialNo?: number;
  date: string;       // YYYY-MM-DD
  time: string;       // HH:mm:ss
  cropName: string;
  cropOwnerName: string;
  cropOwnerPhone: string;
  cropSize: number;
  cropVillage: string;
  tankUsage: number;
  amount: number;
  paymentStatus: PaymentStatus;
}

export interface Rate {
  id?: number;
  price: number;
}