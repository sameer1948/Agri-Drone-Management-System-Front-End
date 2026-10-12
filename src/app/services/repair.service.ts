import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { Repair } from '../models/repair.model';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class RepairService {

  private http = inject(HttpClient);
  private baseUrl = `${environment.apiBaseUrl}`;

  constructor() { }

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