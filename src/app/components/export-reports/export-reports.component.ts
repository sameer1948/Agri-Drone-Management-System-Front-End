import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
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
import { environment } from '../../../environments/environment';

export interface Repair {
  repairId?: number;
  repairNote: string;
  amount: number;
  repairDate: string;
  repairTime: string;
  location: string;
  bookingId?: number;
}

export interface MasterReportEntry {
  // Booking parameters
  logId: number;
  bookingId: number;
  bookingDate: string;
  bookingTime: string;
  bookingDay: string;
  cropName: string;
  cropOwnerName: string;
  cropOwnerPhone: string;
  cropSize: number;
  cropVillage: string;
  bookingNotes: string;
  bookingStatus: string;
  // Mission Log parameters
  droneId: string;
  tankUsage: number;
  price: number;
  amount: number;
  confirmedDate: string;
  confirmedTime: string;
  completeDate: string;
  completeTime: string;
  activityStatus: string;
  paymentStatus: string;
  // Payment settlement parameters
  paymentId: number | string;
  totalAmount: number;
  paidAmount: number;
  pendingAmount: number;
  paymentDate: string;
  paymentTime: string;
  lastPaymentDate: string;
  lastPaymentTime: string;
  paymentType: string;
  paymentNotes: string;
}

export type TableType = 
  | 'MASTER'
  | 'BOOKINGS' 
  | 'LOGS' 
  | 'PAYMENTS' 
  | 'REPAIRS' 
  | 'DRONES' 
  | 'RATES' 
  | 'VILLAGES' 
  | 'CROPS';

@Component({
  selector: 'app-export-reports',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './export-reports.component.html',
  styleUrls: ['./export-reports.component.scss']
})
export class ExportReportsComponent implements OnInit {

  private http = inject(HttpClient);
  private bookingApi = inject(BookingService);
  private logApi = inject(LogService);
  private droneApi = inject(DroneService);
  private paymentApi = inject(PaymentService);
  private villageApi = inject(VillageService);
  private cropApi = inject(CropService);
  private rateApi = inject(RateService);

  // Raw Database Datasets
  bookings: Booking[] = [];
  logs: LogEntry[] = [];
  payments: Payment[] = [];
  repairs: Repair[] = [];
  drones: Drone[] = [];
  rates: Rate[] = [];
  villages: Village[] = [];
  crops: Crop[] = [];

  // Master Consolidated Records
  masterData: MasterReportEntry[] = [];

  // Lookup Maps
  bookingMap: Map<number, Booking> = new Map();
  paymentMap: Map<number, Payment> = new Map();

  isLoading = false;
  isExporting = false;
  lastSyncedAt: Date | null = null;

  // Dialog & Table Viewer State
  isViewDialogOpen = false;
  activeTableType: TableType | null = null;
  activeTableTitle = '';
  activeTableIcon = '';
  dialogSearchTerm = '';
  dialogSortColumn = '';
  dialogSortDir: 'asc' | 'desc' = 'desc';
  dialogCurrentPage = 0;
  dialogPageSize = 10;
  dialogPageSizeOptions = [5, 10, 20, 50, 100, 150, 200, 250, 500, 1000];
  dialogTotalPages = 1;

  // Filtered & Paged Data for Active Dialog
  dialogDisplayedRows: any[] = [];
  dialogFilteredRows: any[] = [];

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
      rates: this.rateApi.getRates().pipe(catchError(() => of([]))),
      repairs: this.http.get<Repair[]>(`${environment.apiBaseUrl}/repairs`).pipe(catchError(() => of([])))
    }).subscribe({
      next: (results) => {
        this.bookings = (results.bookings as any)?.content || results.bookings || [];
        this.logs = results.logs || [];
        this.drones = results.drones || [];
        this.crops = results.crops || [];
        this.villages = results.villages || [];
        this.rates = results.rates || [];
        this.repairs = results.repairs || [];

        // Build Booking Map
        this.bookingMap.clear();
        this.bookings.forEach(b => {
          if (b.bookingId) this.bookingMap.set(b.bookingId, b);
        });

        // Pull Associated Payments
        this.fetchPaymentsAndBuildMaster();
      },
      error: (err) => {
        console.error('Error fetching datasets:', err);
        this.isLoading = false;
        this.showToast('Failed to load some datasets from backend.', 'error');
      }
    });
  }

  private fetchPaymentsAndBuildMaster(): void {
    const logIds = this.logs
      .filter(l => l.logId != null)
      .map(l => l.logId as number);

    if (logIds.length === 0) {
      this.payments = [];
      this.buildMasterConsolidatedData();
      this.lastSyncedAt = new Date();
      this.isLoading = false;
      return;
    }

    const paymentCalls = logIds.map(id =>
      this.paymentApi.getPaymentByLogId(id).pipe(catchError(() => of(null)))
    );

    forkJoin(paymentCalls).subscribe({
      next: (payResults) => {
        this.payments = payResults.filter((p): p is Payment => p !== null && p.paymentId != null);

        this.paymentMap.clear();
        this.payments.forEach(p => {
          if (p.logId) this.paymentMap.set(p.logId, p);
        });

        this.buildMasterConsolidatedData();
        this.lastSyncedAt = new Date();
        this.isLoading = false;
        this.showToast('All 8 entities & Master records synchronized!', 'success');
      },
      error: () => {
        this.buildMasterConsolidatedData();
        this.isLoading = false;
        this.showToast('Synced data with partial payments.', 'error');
      }
    });
  }

  /**
   * Combines data starting from Logs, linking Bookings and Payments
   */
  private buildMasterConsolidatedData(): void {
    this.masterData = this.logs.map(log => {
      const booking = log.bookingId ? this.bookingMap.get(log.bookingId) : undefined;
      const payment = log.logId ? this.paymentMap.get(log.logId) : undefined;

      return {
        // Booking parameters
        logId: log.logId || 0,
        bookingId: log.bookingId || 0,
        bookingDate: booking?.bookingDate || log.createDate || '—',
        bookingTime: booking?.bookingTime || log.createTime || '—',
        bookingDay: booking?.bookingDay || '—',
        cropName: log.cropName || booking?.cropName || '—',
        cropOwnerName: log.cropOwnerName || booking?.cropOwnerName || '—',
        cropOwnerPhone: log.cropOwnerPhone || booking?.cropOwnerPhone || '—',
        cropSize: log.cropSize ?? booking?.cropSize ?? 0,
        cropVillage: log.cropVillage || booking?.cropVillage || '—',
        bookingNotes: booking?.bookingNotes || '—',
        bookingStatus: booking?.bookingStatus || 'CONFIRMED',

        // Log parameters
        droneId: log.droneId || '—',
        tankUsage: log.tankUsage ?? log.cropSize ?? 0,
        price: Number(log.price) || 250,
        amount: Number(log.amount) || 0,
        confirmedDate: log.confirmedDate || '—',
        confirmedTime: log.confirmedTime || '—',
        completeDate: log.completeDate || '—',
        completeTime: log.completeTime || '—',
        activityStatus: log.activityStatus || 'CONFIRMED',
        paymentStatus: log.paymentStatus || (payment ? payment.paymentStatus : 'PENDING'),

        // Payment parameters
        paymentId: payment?.paymentId || '—',
        totalAmount: payment ? Number(payment.totalAmount) : Number(log.amount),
        paidAmount: payment ? Number(payment.paidAmount) : 0,
        pendingAmount: payment ? Number(payment.pendingAmount) : Number(log.amount),
        paymentDate: payment?.paymentDate || '—',
        paymentTime: payment?.paymentTime || '—',
        lastPaymentDate: payment?.lastPaymentDate || '—',
        lastPaymentTime: payment?.lastPaymentTime || '—',
        paymentType: payment?.paymentType || (log.paymentStatus === 'PAID' ? 'CASH' : 'PENDING'),
        paymentNotes: payment?.paymentNotes ? payment.paymentNotes.replace(/[\n\r]+/g, ' ').trim() : '—'
      };
    });
  }

  // ================= MODAL DATA VIEWER LOGIC =================
  openViewDialog(type: TableType): void {
    this.activeTableType = type;
    this.dialogSearchTerm = '';
    this.dialogCurrentPage = 0;
    this.dialogSortDir = 'desc';

    switch (type) {
      case 'MASTER':
        this.activeTableTitle = 'Master Consolidated Operations Hub (Logs + Bookings + Payments)';
        this.activeTableIcon = 'hub';
        this.dialogSortColumn = 'logId';
        break;
      case 'BOOKINGS':
        this.activeTableTitle = 'Customer Bookings Registry';
        this.activeTableIcon = 'calendar_month';
        this.dialogSortColumn = 'bookingId';
        break;
      case 'LOGS':
        this.activeTableTitle = 'Spraying Flight Mission Logs';
        this.activeTableIcon = 'receipt_long';
        this.dialogSortColumn = 'logId';
        break;
      case 'PAYMENTS':
        this.activeTableTitle = 'Payments & Settlements Ledger';
        this.activeTableIcon = 'account_balance_wallet';
        this.dialogSortColumn = 'paymentId';
        break;
      case 'REPAIRS':
        this.activeTableTitle = 'Hardware Maintenance & Repairs';
        this.activeTableIcon = 'build';
        this.dialogSortColumn = 'repairId';
        break;
      case 'DRONES':
        this.activeTableTitle = 'Drone Fleet Hardware Specifications';
        this.activeTableIcon = 'flight';
        this.dialogSortColumn = 'droneId';
        break;
      case 'RATES':
        this.activeTableTitle = 'Tariff & Rates Master';
        this.activeTableIcon = 'payments';
        this.dialogSortColumn = 'rateId';
        break;
      case 'VILLAGES':
        this.activeTableTitle = 'Villages & Locations Directory';
        this.activeTableIcon = 'location_on';
        this.dialogSortColumn = 'villageId';
        break;
      case 'CROPS':
        this.activeTableTitle = 'Agricultural Crops Registry';
        this.activeTableIcon = 'eco';
        this.dialogSortColumn = 'cropId';
        break;
    }

    this.applyDialogFiltersAndPagination();
    this.isViewDialogOpen = true;
  }

  closeViewDialog(): void {
    this.isViewDialogOpen = false;
    this.activeTableType = null;
  }

  getRawDataForType(type: TableType | null): any[] {
    switch (type) {
      case 'MASTER': return this.masterData;
      case 'BOOKINGS': return this.bookings;
      case 'LOGS': return this.logs;
      case 'PAYMENTS': return this.payments;
      case 'REPAIRS': return this.repairs;
      case 'DRONES': return this.drones;
      case 'RATES': return this.rates;
      case 'VILLAGES': return this.villages;
      case 'CROPS': return this.crops;
      default: return [];
    }
  }

  applyDialogFiltersAndPagination(): void {
    const raw = this.getRawDataForType(this.activeTableType);
    let filtered = [...raw];

    // Filter by search query across all object values
    if (this.dialogSearchTerm.trim()) {
      const q = this.dialogSearchTerm.toLowerCase().trim();
      filtered = filtered.filter(item =>
        Object.values(item).some(val => val != null && String(val).toLowerCase().includes(q))
      );
    }

    // Sort column
    if (this.dialogSortColumn) {
      filtered.sort((a, b) => {
        let valA = a[this.dialogSortColumn];
        let valB = b[this.dialogSortColumn];

        if (valA === valB) return 0;
        if (valA == null) return 1;
        if (valB == null) return -1;

        if (!isNaN(Number(valA)) && !isNaN(Number(valB))) {
          valA = Number(valA);
          valB = Number(valB);
        } else {
          valA = String(valA).toLowerCase();
          valB = String(valB).toLowerCase();
        }

        const comp = valA > valB ? 1 : -1;
        return this.dialogSortDir === 'asc' ? comp : -comp;
      });
    }

    this.dialogFilteredRows = filtered;
    this.dialogTotalPages = Math.ceil(this.dialogFilteredRows.length / this.dialogPageSize) || 1;

    if (this.dialogCurrentPage >= this.dialogTotalPages) {
      this.dialogCurrentPage = 0;
    }

    const start = this.dialogCurrentPage * this.dialogPageSize;
    this.dialogDisplayedRows = this.dialogFilteredRows.slice(start, start + this.dialogPageSize);
  }

  setDialogSort(column: string): void {
    if (this.dialogSortColumn === column) {
      this.dialogSortDir = this.dialogSortDir === 'asc' ? 'desc' : 'asc';
    } else {
      this.dialogSortColumn = column;
      this.dialogSortDir = 'desc';
    }
    this.applyDialogFiltersAndPagination();
  }

  goToDialogPage(page: number): void {
    if (page >= 0 && page < this.dialogTotalPages) {
      this.dialogCurrentPage = page;
      this.applyDialogFiltersAndPagination();
    }
  }

  onDialogPageSizeChange(newSize: number): void {
    this.dialogPageSize = Number(newSize);
    this.dialogCurrentPage = 0;
    this.applyDialogFiltersAndPagination();
  }

  getDialogPageNumbers(): number[] {
    return Array.from({ length: this.dialogTotalPages }, (_, i) => i);
  }

  // ================= EXCEL EXPORT METHODS =================

  /**
   * Export Single Table to Excel with All Columns
   */
  exportTableToExcel(type: TableType): void {
    if (this.isLoading) return;
    this.isExporting = true;

    try {
      const wb: XLSX.WorkBook = XLSX.utils.book_new();
      let sheetName = '';
      let filename = '';
      let exportRows: any[] = [];

      switch (type) {
        case 'MASTER':
          exportRows = this.masterData.map(m => ({
            'Log ID': m.logId,
            'Booking ID': m.bookingId,
            'Booking Date': m.bookingDate,
            'Booking Time': m.bookingTime,
            'Booking Day': m.bookingDay,
            'Crop Name': m.cropName,
            'Farmer Name': m.cropOwnerName,
            'Phone Number': m.cropOwnerPhone,
            'Field Size (Acres)': m.cropSize,
            'Village Location': m.cropVillage,
            'Booking Notes': m.bookingNotes,
            'Booking Status': m.bookingStatus,
            'Drone ID': m.droneId,
            'Tank Usage': m.tankUsage,
            'Tariff Price (₹)': m.price,
            'Total Amount (₹)': m.amount,
            'Confirmed Date': m.confirmedDate,
            'Confirmed Time': m.confirmedTime,
            'Complete Date': m.completeDate,
            'Complete Time': m.completeTime,
            'Activity Status': m.activityStatus,
            'Payment Status': m.paymentStatus,
            'Payment ID': m.paymentId,
            'Total Invoice (₹)': m.totalAmount,
            'Paid Amount (₹)': m.paidAmount,
            'Pending Balance (₹)': m.pendingAmount,
            'Payment Date': m.paymentDate,
            'Payment Time': m.paymentTime,
            'Last Payment Date': m.lastPaymentDate,
            'Last Payment Time': m.lastPaymentTime,
            'Payment Mode': m.paymentType,
            'Payment Audit Notes': m.paymentNotes
          }));
          sheetName = 'Master Operational Data';
          filename = `AgriDrone_Master_Combined_Report_${this.getDateStamp()}.xlsx`;
          break;

        case 'BOOKINGS':
          exportRows = this.bookings.map(b => ({
            'Booking ID': b.bookingId,
            'Booking Date': b.bookingDate,
            'Booking Time': b.bookingTime || '—',
            'Booking Day': b.bookingDay,
            'Crop Name': b.cropName,
            'Farmer Name': b.cropOwnerName,
            'Farmer Phone': b.cropOwnerPhone,
            'Land Size (Acres)': b.cropSize,
            'Village Location': b.cropVillage,
            'Booking Notes': b.bookingNotes || '—',
            'Booking Status': b.bookingStatus
          }));
          sheetName = 'Bookings';
          filename = `AgriDrone_Bookings_${this.getDateStamp()}.xlsx`;
          break;

        case 'LOGS':
          exportRows = this.logs.map(l => ({
            'Log ID': l.logId,
            'Booking ID': l.bookingId,
            'Drone ID': l.droneId,
            'Scheduled Date': l.createDate,
            'Scheduled Time': l.createTime,
            'Crop Name': l.cropName,
            'Farmer Name': l.cropOwnerName,
            'Farmer Phone': l.cropOwnerPhone,
            'Acreage': l.cropSize,
            'Village': l.cropVillage,
            'Tank Usage': l.tankUsage,
            'Rate (₹/Tank)': l.price,
            'Total Amount (₹)': l.amount,
            'Confirmed Date': l.confirmedDate || '—',
            'Confirmed Time': l.confirmedTime || '—',
            'Complete Date': l.completeDate || '—',
            'Complete Time': l.completeTime || '—',
            'Activity Status': l.activityStatus,
            'Payment Status': l.paymentStatus
          }));
          sheetName = 'Mission Logs';
          filename = `AgriDrone_Mission_Logs_${this.getDateStamp()}.xlsx`;
          break;

        case 'PAYMENTS':
          exportRows = this.payments.map(p => ({
            'Payment ID': p.paymentId,
            'Log ID': p.logId,
            'Payment Status': p.paymentStatus,
            'Total Amount (₹)': p.totalAmount,
            'Paid Amount (₹)': p.paidAmount,
            'Pending Amount (₹)': p.pendingAmount,
            'Initial Payment Date': p.paymentDate || '—',
            'Initial Payment Time': p.paymentTime || '—',
            'Last Payment Date': p.lastPaymentDate || '—',
            'Last Payment Time': p.lastPaymentTime || '—',
            'Payment Mode': p.paymentType || 'CASH',
            'Audit Notes': p.paymentNotes ? p.paymentNotes.replace(/[\n\r]+/g, ' ').trim() : '—'
          }));
          sheetName = 'Payments';
          filename = `AgriDrone_Payments_Ledger_${this.getDateStamp()}.xlsx`;
          break;

        case 'REPAIRS':
          exportRows = this.repairs.map(r => ({
            'Repair ID': r.repairId,
            'Repair Note': r.repairNote,
            'Cost Amount (₹)': r.amount,
            'Repair Date': r.repairDate,
            'Repair Time': r.repairTime,
            'Workshop Location': r.location,
            'Linked Booking ID': r.bookingId || '—'
          }));
          sheetName = 'Maintenance & Repairs';
          filename = `AgriDrone_Repairs_${this.getDateStamp()}.xlsx`;
          break;

        case 'DRONES':
          exportRows = this.drones.map(d => ({
            'Drone Hardware ID': d.droneId,
            'Drone Model': d.droneName,
            'Chief Pilot / Owner': d.droneOwnerName,
            'Contact Phone': d.droneOwnerPhone,
            'Operational Status': d.droneStatus
          }));
          sheetName = 'Drone Fleet';
          filename = `AgriDrone_Drones_${this.getDateStamp()}.xlsx`;
          break;

        case 'RATES':
          exportRows = this.rates.map(r => ({
            'Rate ID': r.rateId,
            'Tariff Price (₹ / Tank)': r.price,
            'Created Date': r.createdAt || '—'
          }));
          sheetName = 'Tariff Rates';
          filename = `AgriDrone_Rates_${this.getDateStamp()}.xlsx`;
          break;

        case 'VILLAGES':
          exportRows = this.villages.map(v => ({
            'Village ID': v.villageId,
            'Village / Sector Name': v.name
          }));
          sheetName = 'Villages Directory';
          filename = `AgriDrone_Villages_${this.getDateStamp()}.xlsx`;
          break;

        case 'CROPS':
          exportRows = this.crops.map(c => ({
            'Crop ID': c.cropId,
            'Crop Registry Name': c.name
          }));
          sheetName = 'Crops Registry';
          filename = `AgriDrone_Crops_${this.getDateStamp()}.xlsx`;
          break;
      }

      const ws = XLSX.utils.json_to_sheet(exportRows);
      XLSX.utils.book_append_sheet(wb, ws, sheetName);

      const excelBuffer: any = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      this.saveAsExcelFile(excelBuffer, filename);

      this.isExporting = false;
      this.showToast(`📊 Successfully exported ${sheetName} to Excel!`, 'success');
    } catch (err) {
      console.error('Export Error:', err);
      this.isExporting = false;
      this.showToast('Failed to export Excel file.', 'error');
    }
  }

  /**
   * Generates Full Multi-Tab Workbook containing all tables
   */
  exportCompleteMasterReport(): void {
    if (this.isLoading) return;
    this.isExporting = true;

    try {
      const wb: XLSX.WorkBook = XLSX.utils.book_new();

      // Tab 1: Master Combined Data
      const wsMaster = XLSX.utils.json_to_sheet(this.masterData);
      XLSX.utils.book_append_sheet(wb, wsMaster, 'Master Consolidated');

      // Tab 2: Logs
      const wsLogs = XLSX.utils.json_to_sheet(this.logs);
      XLSX.utils.book_append_sheet(wb, wsLogs, 'Mission Logs');

      // Tab 3: Bookings
      const wsBookings = XLSX.utils.json_to_sheet(this.bookings);
      XLSX.utils.book_append_sheet(wb, wsBookings, 'Bookings');

      // Tab 4: Payments
      const wsPayments = XLSX.utils.json_to_sheet(this.payments);
      XLSX.utils.book_append_sheet(wb, wsPayments, 'Payments');

      // Tab 5: Repairs
      const wsRepairs = XLSX.utils.json_to_sheet(this.repairs);
      XLSX.utils.book_append_sheet(wb, wsRepairs, 'Repairs');

      // Tab 6: Drones
      const wsDrones = XLSX.utils.json_to_sheet(this.drones);
      XLSX.utils.book_append_sheet(wb, wsDrones, 'Drone Fleet');

      // Tab 7: Rates
      const wsRates = XLSX.utils.json_to_sheet(this.rates);
      XLSX.utils.book_append_sheet(wb, wsRates, 'Tariff Rates');

      // Tab 8: Villages
      const wsVillages = XLSX.utils.json_to_sheet(this.villages);
      XLSX.utils.book_append_sheet(wb, wsVillages, 'Villages');

      // Tab 9: Crops
      const wsCrops = XLSX.utils.json_to_sheet(this.crops);
      XLSX.utils.book_append_sheet(wb, wsCrops, 'Crops');

      const buffer: any = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const filename = `AgriDrone_Complete_Database_Backup_${this.getDateStamp()}.xlsx`;
      this.saveAsExcelFile(buffer, filename);

      this.isExporting = false;
      this.showToast('🚀 Complete Multi-Sheet Database Report Downloaded!', 'success');
    } catch (err) {
      console.error(err);
      this.isExporting = false;
      this.showToast('Failed to generate master workbook.', 'error');
    }
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