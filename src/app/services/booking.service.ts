import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { Booking } from '../models/booking.model';
import { PageResponse } from '../models/drone.model';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class BookingService {

  private http = inject(HttpClient);
  private baseUrl = `${environment.apiBaseUrl}`;

  constructor() { }

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

}