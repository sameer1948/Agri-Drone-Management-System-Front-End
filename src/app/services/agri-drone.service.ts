import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';

@Injectable({
  providedIn: 'root'
})
export class AgriDroneService {
  private http = inject(HttpClient);
  private baseUrl = 'http://localhost:9642/agri-drone-management-system/v1/api';

  // --- Bookings APIs ---
  // getBookings(): Observable<Booking[]> {
  //   return this.http.get<Booking[]>(`${this.baseUrl}/bookings`);
  // }



  

  // Inside AgriDroneService:
  // updatePaymentStatus(log_id: number, status: 'PAID' | 'PENDING'): Observable<LogEntry> {
  //   return this.http.patch<LogEntry>(
  //     `${this.baseUrl}/logs/${log_id}/payment-status?status=${status}`,
  //     null
  //   );
  // }
  

  

 

}