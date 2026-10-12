import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { Village } from '../models/village.model';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class VillageService {

  private http = inject(HttpClient);
  private baseUrl = `${environment.apiBaseUrl}`;

  constructor() { }

  getVillages(): Observable<Village[]> {
    return this.http.get<Village[]>(`${this.baseUrl}/villages`);
  }

  addVillage(village: Village): Observable<Village> {
    return this.http.post<Village>(`${this.baseUrl}/villages`, village);
  }

  updateVillage(id: number, village: Village): Observable<Village> {
    return this.http.put<Village>(`${this.baseUrl}/villages/${id}`, village);
  }

  deleteVillage(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/villages/${id}`);
  }

}
