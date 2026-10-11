import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { Crop } from '../models/crop.model';

@Injectable({
  providedIn: 'root'
})
export class CropService {

  private http = inject(HttpClient);
  private baseUrl = 'http://localhost:9642/agri-drone-management-system/v1/api';
  

  constructor() { }

  getCrops(): Observable<Crop[]> {
    return this.http.get<Crop[]>(`${this.baseUrl}/crops`);
  }

  addCrop(crop: Crop): Observable<Crop> {
    return this.http.post<Crop>(`${this.baseUrl}/crops`, crop);
  }

  updateCrop(id: number, crop: Crop): Observable<Crop> {
    return this.http.put<Crop>(`${this.baseUrl}/crops/${id}`, crop);
  }

  deleteCrop(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/crops/${id}`);
  }
  
}