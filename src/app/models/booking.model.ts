export interface Booking {

  bookingId?: number;
  bookingDate: string;               // YYYY-MM-DD
  bookingTime?: string;
  bookingDay?: string;               // Sunday, Monday...
  cropName: string;
  cropOwnerName: string;
  cropOwnerPhone: string;
  cropSize: number;                 // e.g. 4.00 , 5.00... etc
  cropVillage: string;
  bookingNotes: string;             // Optional notes
  bookingStatus?: BookingStatus;    // Optional status

}

export type BookingStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED';