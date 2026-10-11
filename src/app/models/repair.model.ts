export interface Repair {

  repairId?: number;
  repairNote: string;
  amount: number;
  repairDate: string;    // YYYY-MM-DD
  repairTime: string;    // HH:mm:ss
  location: string;
  bookingId?: number;
  
}