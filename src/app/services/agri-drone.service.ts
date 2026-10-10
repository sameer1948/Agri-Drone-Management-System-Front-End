import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Booking, Drone, LogEntry, PageResponse, Payment, Rate, Repair } from '../models/drone.model';

@Injectable({
  providedIn: 'root'
})
export class AgriDroneService {
  private http = inject(HttpClient);
  private baseUrl = 'http://localhost:9642/agri-drone-management-system/v1/api';

   // --- Rate APIs ---
  getCurrentRate(): Observable<Rate> {
    return this.http.get<Rate>(`${this.baseUrl}/rates`);
  }

  // --- Bookings APIs ---
  // getBookings(): Observable<Booking[]> {
  //   return this.http.get<Booking[]>(`${this.baseUrl}/bookings`);
  // }
  getBookings(
      page: number = 0,
      size: number = 5,
      sortBy: string = 'bookingDate', // need to update with date
      sortDir: string = 'desc'
    ): Observable<PageResponse<Booking>> {
    const params = new HttpParams()
      .set('page', page.toString())
      .set('size', size.toString())
      .set('sortBy', sortBy)
      .set('sortDir', sortDir);

    return this.http.get<PageResponse<Booking>>(`${this.baseUrl}/bookings`, { params });
  }

getFilteredBookings(
    params: {
      status?: string;
      crop?: string;
      search?: string;
      page: number;
      size: number;
      sortBy: string;
      sortDir: string;
    }
  ): Observable<PageResponse<Booking>> {
    let httpParams = new HttpParams()
      .set('page', params.page.toString())
      .set('size', params.size.toString())
      .set('sortBy', params.sortBy)
      .set('sortDir', params.sortDir);

    if (params.status && params.status !== 'ALL') httpParams = httpParams.set('status', params.status);
    if (params.crop && params.crop !== 'ALL') httpParams = httpParams.set('crop', params.crop);
    if (params.search && params.search.trim()) httpParams = httpParams.set('search', params.search.trim());

    return this.http.get<PageResponse<Booking>>(`${this.baseUrl}/bookings/operations`, { params: httpParams });
  }

  getPendingBookings(): Observable<Booking[]> {
    return this.http.get<Booking[]>(`${this.baseUrl}/bookings/pending-status`);
  }

  createBooking(booking: Booking): Observable<Booking> {
    return this.http.post<Booking>(`${this.baseUrl}/bookings`, booking);
  }

  updateBooking(bookingId: number, booking: Booking): Observable<Booking> {
    return this.http.put<Booking>(`${this.baseUrl}/bookings/${bookingId}`, booking);
  }

  deleteBooking(bookingId: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/bookings/${bookingId}`);
  }

  // --- Drone APIs ---
  getDrones(): Observable<Drone[]> {
    return this.http.get<Drone[]>(`${this.baseUrl}/drones`);
  }

  createDrone(drone: Drone): Observable<Drone> {
    return this.http.post<Drone>(`${this.baseUrl}/drones`, drone);
  }

  deleteDrone(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/drones/${id}`);
  }

  // --- Log APIs ---
  getLogs(): Observable<LogEntry[]> {
    return this.http.get<LogEntry[]>(`${this.baseUrl}/logs`);
  }

  createLog(log: LogEntry): Observable<LogEntry> {
    return this.http.post<LogEntry>(`${this.baseUrl}/logs`, log);
  }

  updateLog(log_id: number, log: LogEntry): Observable<LogEntry> {
    return this.http.put<LogEntry>(`${this.baseUrl}/logs/${log_id}`, log);
  }

  deleteLog(log_id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/logs/${log_id}`);
  }

 
  updateRate(price: number): Observable<Rate> {
    return this.http.put<Rate>(`${this.baseUrl}/rates`, { price });
  }

  // Add inside AgriDroneService class:
  checkSlotAvailability(date: string, time: string): Observable<{ available: boolean }> {
    return this.http.get<{ available: boolean }>(
      `${this.baseUrl}/logs/check-slot?date=${date}&time=${time}`
    );
  }

  // Inside AgriDroneService:
  updatePaymentStatus(log_id: number, status: 'PAID' | 'PENDING'): Observable<LogEntry> {
    return this.http.patch<LogEntry>(
      `${this.baseUrl}/logs/${log_id}/payment-status?status=${status}`,
      null
    );
  }

  //-- Payment APIs ---
  getPaymentRecords(): Observable<Payment[]> {
    return this.http.get<Payment[]>(`${this.baseUrl}/payments`);
  }

  getPaymentByLogId(logId: number): Observable<Payment> {
    return this.http.get<Payment>(`${this.baseUrl}/payments/log/${logId}`);
  }

  createPayment(payment: Payment): Observable<Payment> {
    return this.http.post<Payment>(`${this.baseUrl}/payments`, payment);
  }

  updatePayment(paymentId: number, payment: Payment): Observable<Payment> {
    return this.http.put<Payment>(`${this.baseUrl}/payments/${paymentId}`, payment);
  }

  // Inside AgriDroneService:
  getRepairs(): Observable<Repair[]> {
    return this.http.get<Repair[]>(`${this.baseUrl}/repairs`);
  }

  createRepair(repair: Repair): Observable<Repair> {
    return this.http.post<Repair>(`${this.baseUrl}/repairs`, repair);
  }

  updateRepair(repairId: number, repair: Repair): Observable<Repair> {
    return this.http.put<Repair>(`${this.baseUrl}/repairs/${repairId}`, repair);
  }

  deleteRepair(repairId: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/repairs/${repairId}`);
  }
}