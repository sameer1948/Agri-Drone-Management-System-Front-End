import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { Rate } from '../models/rate.model';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class RateService {

  private http = inject(HttpClient);
  private baseUrl = `${environment.apiBaseUrl}`;

  constructor() { }

  // --- Rate Configuration Endpoints ---

  getCurrentRate(): Observable<Rate> {
    return this.http.get<Rate>(`${this.baseUrl}/rates/current`);
  }

  getAllRateHistory(): Observable<Rate[]> {
    return this.http.get<Rate[]>(`${this.baseUrl}/rates`);
  }

  createNewRate(rate: Rate): Observable<Rate> {
    return this.http.post<Rate>(`${this.baseUrl}/rates`, rate);
  } 
  
}