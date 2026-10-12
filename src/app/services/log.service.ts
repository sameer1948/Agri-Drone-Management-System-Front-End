import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { LogEntry } from '../models/log.model';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class LogService {

   private http = inject(HttpClient);
   private baseUrl = `${environment.apiBaseUrl}`;

  constructor() { }

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

}