import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { Drone, DroneStatus } from '../models/drone.model';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class DroneService {

  private http = inject(HttpClient);
  private baseUrl = `${environment.apiBaseUrl}`;

  constructor() { }

  getDrones(): Observable<Drone[]> {
      return this.http.get<Drone[]>(`${this.baseUrl}/drones`);
    }
  
  createDrone(drone: Drone): Observable<Drone> {
    return this.http.post<Drone>(`${this.baseUrl}/drones`, drone);
  }

  updateDrone(droneId: string, drone: Drone): Observable<Drone> {
    return this.http.put<Drone>(`${this.baseUrl}/drones/${droneId}`, drone);
  }

  toggleDroneStatus(droneId: string, status: DroneStatus): Observable<Drone> {
    return this.http.patch<Drone>(`${this.baseUrl}/drones/${droneId}/status`, { droneStatus: status });
  }

  deleteDrone(droneId: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/drones/${droneId}`);
  }
  
}
