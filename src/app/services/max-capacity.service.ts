import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { MaxCapacity } from '../models/max-capacity.model';

@Injectable({
  providedIn: 'root'
})
export class MaxCapacityService {

  private http = inject(HttpClient);
  private baseUrl = `${environment.apiBaseUrl}/capacity`;

  getMaxCapacity(): Observable<MaxCapacity> {
    return this.http.get<MaxCapacity>(this.baseUrl);
  }

  updateMaxCapacity(maxAcres: number): Observable<MaxCapacity> {
    return this.http.put<MaxCapacity>(this.baseUrl, { maxAcres });
  }
  
}