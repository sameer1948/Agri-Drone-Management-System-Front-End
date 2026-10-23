import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { Rate } from '../models/rate.model';

@Injectable({
  providedIn: 'root'
})
export class RateService {

  private http = inject(HttpClient);
  private baseUrl = `${environment.apiBaseUrl}/rates`;

  getRates(): Observable<Rate[]> {
    return this.http.get<Rate[]>(this.baseUrl);
  }

  getCurrentRate(): Observable<Rate> {
    return this.http.get<Rate>(`${this.baseUrl}/current`);
  }

  addRate(rate: { price: number }): Observable<Rate> {
    return this.http.post<Rate>(this.baseUrl, rate);
  }

  updateRate(id: number, rate: { price: number }): Observable<Rate> {
    return this.http.put<Rate>(`${this.baseUrl}/${id}`, rate);
  }

  deleteRate(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }
  
}