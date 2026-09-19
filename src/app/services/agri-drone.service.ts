import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Drone, LogEntry, Rate } from '../models/drone.model';

@Injectable({
  providedIn: 'root'
})
export class AgriDroneService {
  private http = inject(HttpClient);
  private baseUrl = 'http://localhost:9642/agri-drone-management-system/v1/api';

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

  deleteLog(serialNo: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/logs/${serialNo}`);
  }

  // --- Rate APIs ---
  getCurrentRate(): Observable<Rate> {
    return this.http.get<Rate>(`${this.baseUrl}/rates`);
  }

  updateRate(price: number): Observable<Rate> {
    return this.http.put<Rate>(`${this.baseUrl}/rates`, { price });
  }
}