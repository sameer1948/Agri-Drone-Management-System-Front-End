import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AgriDroneService } from '../../services/agri-drone.service';
import { Drone, LogEntry, Rate, PaymentStatus } from '../../models/drone.model';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent implements OnInit {
  private api = inject(AgriDroneService);

  drones: Drone[] = [];
  logs: LogEntry[] = [];
  rate: Rate | null = null;
  newRatePrice: number = 0;

  newDrone: Drone = {
    droneId: '',
    droneName: '',
    droneOwnerName: '',
    droneOwnerPhone: ''
  };

  newLog: LogEntry = {
    date: new Date().toISOString().split('T')[0],
    time: '08:00:00',
    cropName: '',
    cropOwnerName: '',
    cropOwnerPhone: '',
    cropSize: 1,
    cropVillage: '',
    tankUsage: 1,
    amount: 0,
    paymentStatus: 'PENDING'
  };

  ngOnInit(): void {
    this.loadAll();
  }

  loadAll(): void {
    this.api.getDrones().subscribe(res => this.drones = res);
    this.api.getLogs().subscribe(res => this.logs = res);
    this.api.getCurrentRate().subscribe(res => {
      this.rate = res;
      this.newRatePrice = res?.price || 0;
      this.calculateAmount();
    });
  }

  calculateAmount(): void {
    const currentPrice = this.rate ? this.rate.price : 0;
    this.newLog.amount = this.newLog.tankUsage * currentPrice;
  }

  saveDrone(): void {
    if (!this.newDrone.droneId || !this.newDrone.droneName) return;
    this.api.createDrone(this.newDrone).subscribe(() => {
      this.newDrone = { droneId: '', droneName: '', droneOwnerName: '', droneOwnerPhone: '' };
      this.api.getDrones().subscribe(res => this.drones = res);
    });
  }

  removeDrone(id: string): void {
    this.api.deleteDrone(id).subscribe(() => {
      this.drones = this.drones.filter(d => d.droneId !== id);
    });
  }

  saveLog(): void {
    this.calculateAmount();
    this.api.createLog(this.newLog).subscribe(() => {
      this.api.getLogs().subscribe(res => this.logs = res);
    });
  }

  removeLog(serialNo?: number): void {
    if (!serialNo) return;
    this.api.deleteLog(serialNo).subscribe(() => {
      this.logs = this.logs.filter(l => l.serialNo !== serialNo);
    });
  }

  updateActiveRate(): void {
    this.api.updateRate(this.newRatePrice).subscribe(res => {
      this.rate = res;
      this.calculateAmount();
    });
  }
}