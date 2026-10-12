import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import * as XLSX from 'xlsx';
import * as saveAs from 'file-saver';

import { BookingService } from '../../services/booking.service';
import { LogService } from '../../services/log.service';
import { DroneService } from '../../services/drone.service';
import { PaymentService } from '../../services/payment.service';
import { RateService } from '../../services/rate.service';

import { Booking } from '../../models/booking.model';
import { LogEntry } from '../../models/log.model';
import { Drone } from '../../models/drone.model';
import { Payment } from '../../models/payment.model';
import { Rate } from '../../models/rate.model';
import { VillageService } from '../../services/village.service';
import { CropService } from '../../services/crop.service';
import { Crop } from '../../models/crop.model';
import { Village } from '../../models/village.model';

@Component({
  selector: 'app-export-reports',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './export-reports.component.html',
  styleUrls: ['./export-reports.component.scss']
})
export class ExportReportsComponent implements OnInit {
  private bookingApi = inject(BookingService);
  private logApi = inject(LogService);
  private droneApi = inject(DroneService);
  private paymentApi = inject(PaymentService);
  private villageApi = inject(VillageService);
  private cropApi = inject(CropService);
  private rateApi = inject(RateService);

  // Data Stores
  bookings: Booking[] = [];
  logs: LogEntry[] = [];
  drones: Drone[] = [];
  payments: Payment[] = [];
  crops: Crop[] = [];
  villages: Village[] = [];
  rates: Rate[] = [];

  isLoading = false;
  isExporting = false;
  lastSyncedAt: Date | null = null;

  // Toast
  toast = { show: false, message: '', type: 'success' };
  private toastTimer: any;

  ngOnInit(): void {
    this.fetchAllData();
  }

  fetchAllData(): void {
    this.isLoading = true;

    forkJoin({
      bookings: this.bookingApi.getBookings(0, 1000, 'bookingId', 'desc'),
      logs: this.logApi.getLogs(),
      drones: this.droneApi.getDrones(),
      crops: this.cropApi.getCrops(),
      villages: this.villageApi.getVillages(),
      rates: this.rateApi.getAllRateHistory()
    }).subscribe({
      next: (results) => {
        this.bookings = (results.bookings as any)?.content || results.bookings || [];
        this.logs = results.logs || [];
        this.drones = results.drones || [];
        this.crops = results.crops || [];
        this.villages = results.villages || [];
        this.rates = results.rates || [];
        this.lastSyncedAt = new Date();
        this.isLoading = false;
        this.showToast('All operational records synced successfully!', 'success');
      },
      error: (err) => {
        console.error('Error fetching datasets:', err);
        this.isLoading = false;
        this.showToast('Failed to load some datasets from backend.', 'error');
      }
    });
  }

  // ================= EXCEL EXPORT LOGIC =================

  /**
   * Generates a Master Excel Workbook with separate tabs for each entity.
   */
  exportCompleteMasterReport(): void {
    if (this.isLoading) return;
    this.isExporting = true;

    try {
      const wb: XLSX.WorkBook = XLSX.utils.book_new();

      // 1. Mission Logs Tab
      const logsData = this.logs.map(l => ({
        'Log ID': l.logId,
        'Booking ID': l.bookingId,
        'Drone ID': l.droneId,
        'Date': l.createDate,
        'Time': l.createTime,
        'Farmer Name': l.cropOwnerName,
        'Phone': l.cropOwnerPhone,
        'Crop': l.cropName,
        'Village': l.cropVillage,
        'Acres (Area)': l.cropSize,
        'Tanks Used': l.tankUsage,
        'Bill Amount (₹)': l.amount,
        'Mission Status': l.activityStatus,
        'Completed Date': l.completeDate || '—',
        'Completed Time': l.completeTime || '—'
      }));
      const wsLogs = XLSX.utils.json_to_sheet(logsData);
      XLSX.utils.book_append_sheet(wb, wsLogs, 'Mission Logs');

      // 2. Bookings Tab
      const bookingsData = this.bookings.map(b => ({
        'Booking ID': b.bookingId,
        'Scheduled Date': b.bookingDate,
        'Day': b.bookingDay,
        'Farmer Name': b.cropOwnerName,
        'Phone': b.cropOwnerPhone,
        'Village Location': b.cropVillage,
        'Crop': b.cropName,
        'Land Size (Ac)': b.cropSize,
        'Unit Rate (₹/Tank)': b.price,
        'Total Amount (₹)': b.amount,
        'Status': b.bookingStatus,
        'Notes': b.bookingNotes || '—'
      }));
      const wsBookings = XLSX.utils.json_to_sheet(bookingsData);
      XLSX.utils.book_append_sheet(wb, wsBookings, 'Bookings');

      // 3. Drone Fleet Registry Tab
      const dronesData = this.drones.map(d => ({
        'Hardware ID': d.droneId,
        'Model / Name': d.droneName,
        'Owner / Pilot': d.droneOwnerName,
        'Contact Phone': d.droneOwnerPhone,
        'Operational Status': d.droneStatus
      }));
      const wsDrones = XLSX.utils.json_to_sheet(dronesData);
      XLSX.utils.book_append_sheet(wb, wsDrones, 'Drone Fleet');

      // 4. Tariff & Rate History Tab
      const ratesData = this.rates.map(r => ({
        'Rate ID': r.rateId,
        'Price / Tank (₹)': r.price,
        'Active': r.isActive ? 'YES' : 'NO',
        'Effective From': r.effectiveFrom,
        'Effective To': r.effectiveTo || 'CURRENT',
        'Change Reason': r.changeReason || '—'
      }));
      const wsRates = XLSX.utils.json_to_sheet(ratesData);
      XLSX.utils.book_append_sheet(wb, wsRates, 'Tariff History');

      // 5. Master Metadata (Villages & Crops)
      const villageData = this.villages.map(v => ({ 'Village ID': v.villageId, 'Name': v.name }));
      const cropData = this.crops.map(c => ({ 'Crop ID': c.cropId, 'Name': c.name }));
      const wsVillages = XLSX.utils.json_to_sheet(villageData);
      const wsCrops = XLSX.utils.json_to_sheet(cropData);
      XLSX.utils.book_append_sheet(wb, wsVillages, 'Villages Directory');
      XLSX.utils.book_append_sheet(wb, wsCrops, 'Crops Registry');

      // Generate buffer and trigger download
      const excelBuffer: any = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const filename = `Sri_Jagadeeswara_AgriDrone_Master_Report_${this.getDateStamp()}.xlsx`;
      this.saveAsExcelFile(excelBuffer, filename);

      this.isExporting = false;
      this.showToast('📊 Complete Master Excel Report downloaded!', 'success');
    } catch (error) {
      console.error('Export error:', error);
      this.isExporting = false;
      this.showToast('Failed to generate Excel file.', 'error');
    }
  }

  /**
   * Export individual sheet
   */
  exportSingleSheet(type: 'BOOKINGS' | 'LOGS' | 'DRONES' | 'METADATA'): void {
    const wb: XLSX.WorkBook = XLSX.utils.book_new();
    let filename = '';

    if (type === 'BOOKINGS') {
      const data = this.bookings.map(b => ({
        'ID': b.bookingId,
        'Date': b.bookingDate,
        'Farmer': b.cropOwnerName,
        'Phone': b.cropOwnerPhone,
        'Crop': b.cropName,
        'Acres': b.cropSize,
        'Village': b.cropVillage,
        'Amount': b.amount,
        'Status': b.bookingStatus
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), 'Bookings');
      filename = `Bookings_${this.getDateStamp()}.xlsx`;
    } else if (type === 'LOGS') {
      const data = this.logs.map(l => ({
        'Log ID': l.logId,
        'Date': l.createDate,
        'Farmer': l.cropOwnerName,
        'Drone': l.droneId,
        'Crop': l.cropName,
        'Acres': l.cropSize,
        'Tanks': l.tankUsage,
        'Total (₹)': l.amount,
        'Status': l.activityStatus
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), 'Logs');
      filename = `Mission_Logs_${this.getDateStamp()}.xlsx`;
    } else if (type === 'DRONES') {
      const data = this.drones.map(d => ({
        'ID': d.droneId,
        'Name': d.droneName,
        'Owner': d.droneOwnerName,
        'Phone': d.droneOwnerPhone,
        'Status': d.droneStatus
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), 'Drones');
      filename = `Fleet_Registry_${this.getDateStamp()}.xlsx`;
    } else if (type === 'METADATA') {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(this.villages), 'Villages');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(this.crops), 'Crops');
      filename = `Master_Villages_Crops_${this.getDateStamp()}.xlsx`;
    }

    const buffer: any = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    this.saveAsExcelFile(buffer, filename);
    this.showToast(`Downloaded ${filename}`, 'success');
  }

  private saveAsExcelFile(buffer: any, fileName: string): void {
    const EXCEL_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=UTF-8';
    const data: Blob = new Blob([buffer], { type: EXCEL_TYPE });
    (saveAs as any).saveAs(data, fileName);
  }

  private getDateStamp(): string {
    const d = new Date();
    return `${d.getFullYear()}_${('0' + (d.getMonth() + 1)).slice(-2)}_${('0' + d.getDate()).slice(-2)}`;
  }

  // Calculation helpers for UI
  get totalAcreageSprayed(): number {
    return this.logs.reduce((sum, l) => sum + (Number(l.cropSize) || 0), 0);
  }

  get totalRevenueBilled(): number {
    return this.logs.reduce((sum, l) => sum + (Number(l.amount) || 0), 0);
  }

  showToast(message: string, type: 'success' | 'error' = 'success'): void {
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toast = { show: true, message, type };
    this.toastTimer = setTimeout(() => (this.toast.show = false), 4000);
  }
}