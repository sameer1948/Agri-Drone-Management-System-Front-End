import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import * as XLSX from 'xlsx';
import * as saveAs from 'file-saver';

import { BookingService } from '../../services/booking.service';
import { LogService } from '../../services/log.service';
import { DroneService } from '../../services/drone.service';
import { PaymentService } from '../../services/payment.service';
import { RateService } from '../../services/rate.service';
import { VillageService } from '../../services/village.service';
import { CropService } from '../../services/crop.service';

import { Booking } from '../../models/booking.model';
import { LogEntry } from '../../models/log.model';
import { Drone } from '../../models/drone.model';
import { Payment } from '../../models/payment.model';
import { Rate } from '../../models/rate.model';
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
  payments: Payment[] = [];
  logs: LogEntry[] = [];
  bookings: Booking[] = [];
  drones: Drone[] = [];
  crops: Crop[] = [];
  villages: Village[] = [];
  rates: Rate[] = [];

  // Quick lookup map: logId -> LogEntry
  logMap: Map<number, LogEntry> = new Map();

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
      bookings: this.bookingApi.getBookings(0, 1000, 'bookingId', 'desc').pipe(catchError(() => of([]))),
      logs: this.logApi.getLogs().pipe(catchError(() => of([]))),
      drones: this.droneApi.getDrones().pipe(catchError(() => of([]))),
      crops: this.cropApi.getCrops().pipe(catchError(() => of([]))),
      villages: this.villageApi.getVillages().pipe(catchError(() => of([]))),
      rates: this.rateApi.getAllRateHistory().pipe(catchError(() => of([])))
    }).subscribe({
      next: (results) => {
        this.bookings = (results.bookings as any)?.content || results.bookings || [];
        this.logs = results.logs || [];
        this.drones = results.drones || [];
        this.crops = results.crops || [];
        this.villages = results.villages || [];
        this.rates = results.rates || [];

        // Build log map for cross-referencing payments
        this.logMap.clear();
        this.logs.forEach(l => {
          if (l.logId) this.logMap.set(l.logId, l);
        });

        // Fetch associated payments for all logged missions
        this.fetchPaymentsData();
      },
      error: (err) => {
        console.error('Error fetching datasets:', err);
        this.isLoading = false;
        this.showToast('Failed to load some datasets from backend.', 'error');
      }
    });
  }

  private fetchPaymentsData(): void {
    const completedLogIds = this.logs
      .filter(l => l.logId != null)
      .map(l => l.logId as number);

    if (completedLogIds.length === 0) {
      this.payments = [];
      this.lastSyncedAt = new Date();
      this.isLoading = false;
      return;
    }

    const paymentCalls = completedLogIds.map(id =>
      this.paymentApi.getPaymentByLogId(id).pipe(catchError(() => of(null)))
    );

    forkJoin(paymentCalls).subscribe({
      next: (payResults) => {
        this.payments = payResults.filter((p): p is Payment => p !== null && p.paymentId != null);
        this.lastSyncedAt = new Date();
        this.isLoading = false;
        this.showToast('All operational and payment ledgers synced!', 'success');
      },
      error: () => {
        this.isLoading = false;
        this.showToast('Synced data with partial payment logs.', 'error');
      }
    });
  }

  // ================= FINANCIAL METRIC HELPERS =================
  get totalCollectedAmount(): number {
    return this.payments.reduce((sum, p) => sum + (Number(p.paidAmount) || 0), 0);
  }

  get totalPendingAmount(): number {
    return this.payments.reduce((sum, p) => sum + (Number(p.pendingAmount) || 0), 0);
  }

  get totalBilledAmount(): number {
    return this.payments.reduce((sum, p) => sum + (Number(p.totalAmount) || 0), 0);
  }

  get totalAcreageSprayed(): number {
    return this.logs.reduce((sum, l) => sum + (Number(l.cropSize) || 0), 0);
  }

  // ================= EXCEL EXPORT LOGIC =================

  /**
   * Generates a Master Excel Workbook with Payments as the primary tab.
   */
  exportCompleteMasterReport(): void {
    if (this.isLoading) return;
    this.isExporting = true;

    try {
      const wb: XLSX.WorkBook = XLSX.utils.book_new();

      // 1. PRIMARY TAB: Payments & Financial Ledger
      const paymentsData = this.buildPaymentsExportRows();
      const wsPayments = XLSX.utils.json_to_sheet(paymentsData);
      XLSX.utils.book_append_sheet(wb, wsPayments, 'Payments & Ledger');

      // 2. TAB: Spraying Mission Logs
      const logsData = this.logs.map(l => ({
        'Log ID': l.logId,
        'Booking ID': l.bookingId,
        'Drone ID': l.droneId,
        'Mission Date': l.createDate,
        'Time': l.createTime,
        'Farmer Name': l.cropOwnerName,
        'Phone': l.cropOwnerPhone,
        'Crop': l.cropName,
        'Village': l.cropVillage,
        'Acres': l.cropSize,
        'Tanks Used': l.tankUsage,
        'Bill Amount (₹)': l.amount,
        'Activity Status': l.activityStatus,
        'Payment Status': l.paymentStatus,
        'Completed Date': l.completeDate || '—',
        'Completed Time': l.completeTime || '—'
      }));
      const wsLogs = XLSX.utils.json_to_sheet(logsData);
      XLSX.utils.book_append_sheet(wb, wsLogs, 'Mission Logs');

      // 3. TAB: Customer Bookings
      const bookingsData = this.bookings.map(b => ({
        'Booking ID': b.bookingId,
        'Scheduled Date': b.bookingDate,
        'Day': b.bookingDay,
        'Farmer Name': b.cropOwnerName,
        'Phone': b.cropOwnerPhone,
        'Village Location': b.cropVillage,
        'Crop': b.cropName,
        'Land Size (Ac)': b.cropSize,
        'Tariff (₹/Tank)': b.price,
        'Estimated Amount (₹)': b.amount,
        'Status': b.bookingStatus,
        'Notes': b.bookingNotes || '—'
      }));
      const wsBookings = XLSX.utils.json_to_sheet(bookingsData);
      XLSX.utils.book_append_sheet(wb, wsBookings, 'Bookings');

      // 4. TAB: Drone Registry
      const dronesData = this.drones.map(d => ({
        'Hardware ID': d.droneId,
        'Drone Model': d.droneName,
        'Chief Pilot / Owner': d.droneOwnerName,
        'Contact Phone': d.droneOwnerPhone,
        'Operational Status': d.droneStatus
      }));
      const wsDrones = XLSX.utils.json_to_sheet(dronesData);
      XLSX.utils.book_append_sheet(wb, wsDrones, 'Drone Fleet');

      // 5. TAB: Tariff Rate History
      const ratesData = this.rates.map(r => ({
        'Rate ID': r.rateId,
        'Price / Tank (₹)': r.price,
        'Is Active': r.isActive ? 'YES' : 'NO',
        'Effective From': r.effectiveFrom,
        'Effective To': r.effectiveTo || 'CURRENT',
        'Revision Reason': r.changeReason || '—'
      }));
      const wsRates = XLSX.utils.json_to_sheet(ratesData);
      XLSX.utils.book_append_sheet(wb, wsRates, 'Tariff History');

      // 6. TAB: Master Metadata (Villages & Crops)
      const villageData = this.villages.map(v => ({ 'Village ID': v.villageId, 'Village Name': v.name }));
      const cropData = this.crops.map(c => ({ 'Crop ID': c.cropId, 'Crop Name': c.name }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(villageData), 'Villages Directory');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(cropData), 'Crops Registry');

      // Generate & Trigger Download
      const excelBuffer: any = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const filename = `Sri_Jagadeeswara_AgriDrone_Master_Financial_Report_${this.getDateStamp()}.xlsx`;
      this.saveAsExcelFile(excelBuffer, filename);

      this.isExporting = false;
      this.showToast('📊 Complete Master Financial Report downloaded!', 'success');
    } catch (error) {
      console.error('Export error:', error);
      this.isExporting = false;
      this.showToast('Failed to generate Excel file.', 'error');
    }
  }

  /**
   * Export single sheet
   */
  exportSingleSheet(type: 'PAYMENTS' | 'LOGS' | 'BOOKINGS' | 'DRONES' | 'METADATA'): void {
    const wb: XLSX.WorkBook = XLSX.utils.book_new();
    let filename = '';

    if (type === 'PAYMENTS') {
      const data = this.buildPaymentsExportRows();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), 'Payments Ledger');
      filename = `Payment_Settlements_Ledger_${this.getDateStamp()}.xlsx`;
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
        'Status': l.activityStatus,
        'Payment': l.paymentStatus
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), 'Logs');
      filename = `Mission_Logs_${this.getDateStamp()}.xlsx`;
    } else if (type === 'BOOKINGS') {
      const data = this.bookings.map(b => ({
        'ID': b.bookingId,
        'Date': b.bookingDate,
        'Farmer': b.cropOwnerName,
        'Phone': b.cropOwnerPhone,
        'Crop': b.cropName,
        'Acres': b.cropSize,
        'Village': b.cropVillage,
        'Amount (₹)': b.amount,
        'Status': b.bookingStatus
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), 'Bookings');
      filename = `Customer_Bookings_${this.getDateStamp()}.xlsx`;
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

  /**
   * Helper that joins payments with their parent mission logs
   */
  private buildPaymentsExportRows(): any[] {
    return this.payments.map(p => {
      const log = p.logId ? this.logMap.get(p.logId) : null;
      return {
        'Payment ID': p.paymentId,
        'Log Ref ID': p.logId,
        'Farmer Name': log?.cropOwnerName || '—',
        'Contact Phone': log?.cropOwnerPhone || '—',
        'Farm Village': log?.cropVillage || '—',
        'Crop Type': log?.cropName || '—',
        'Sprayed Acres': log?.cropSize ?? '—',
        'Total Invoice (₹)': p.totalAmount,
        'Paid Amount (₹)': p.paidAmount,
        'Pending Due (₹)': p.pendingAmount,
        'Settlement Status': p.paymentStatus,
        'Payment Mode': p.paymentType || 'CASH',
        'Initial Payment Date': p.paymentDate || '—',
        'Last Payment Date': p.lastPaymentDate || '—',
        'Payment Audit Notes': p.paymentNotes ? p.paymentNotes.replace(/[\n\r]+/g, ' ').trim() : '—'
      };
    });
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

  showToast(message: string, type: 'success' | 'error' = 'success'): void {
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toast = { show: true, message, type };
    this.toastTimer = setTimeout(() => (this.toast.show = false), 4000);
  }
}