import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AgriDroneService } from '../../services/agri-drone.service';
import { LogEntry, Payment, PaymentStatus } from '../../models/drone.model';

type DialogMode = 'CONFIRM_MISSION' | 'RECEIVE_PAYMENT' | null;

@Component({
  selector: 'app-logs',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './logs.component.html',
  styleUrls: ['./logs.component.scss']
})
export class LogsComponent implements OnInit {
  private api = inject(AgriDroneService);

  allLogs: LogEntry[] = [];
  filteredLogs: LogEntry[] = [];
  pagedLogs: LogEntry[] = [];
  isLoading = false;

  // Filter criteria
  searchTerm = '';
  selectedStatusFilter: 'ALL' | 'PAID' | 'PENDING' = 'ALL';

  // KPI Metrics
  totalLogs = 0;
  pendingAmount = 0;
  collectedAmount = 0;

  // Sorting
  sortBy: keyof LogEntry = 'logId';
  sortDir: 'asc' | 'desc' = 'desc';

  // Pagination
  currentPage = 0;
  pageSize = 10;
  pageSizeOptions = [5, 10, 20, 50];
  totalPages = 0;

  // Dialog State
  isDialogOpen = false;
  activeDialogMode: DialogMode = null;
  selectedLog: LogEntry | null = null;
  paymentMode: 'CASH' | 'TRANSFER' | 'CHEQUE' = 'CASH';
  paymentReferenceNote: string = '';

  // Toast / Snackbar
  toast = { show: false, message: '', type: 'success' };
  private toastTimer: any;

  ngOnInit(): void {
    this.fetchLogs();
  }

  fetchLogs(): void {
    this.isLoading = true;
    this.api.getLogs().subscribe({
      next: (data) => {
        this.allLogs = data;
        this.computeKpis();
        this.applyFiltersAndSort();
        this.isLoading = false;
      },
      error: (err) => {
        console.error('Error fetching logs:', err);
        this.isLoading = false;
        this.showToast('Failed to load spraying mission logs.', 'error');
      }
    });
  }

  private computeKpis(): void {
    this.totalLogs = this.allLogs.length;
    this.pendingAmount = this.allLogs
      .filter((l) => l.paymentStatus === 'PENDING')
      .reduce((acc, curr) => acc + (curr.amount || 0), 0);
    this.collectedAmount = this.allLogs
      .filter((l) => l.paymentStatus === 'PAID')
      .reduce((acc, curr) => acc + (curr.amount || 0), 0);
  }

  // --- Filtering & Sorting ---
  applyFiltersAndSort(): void {
    let result = [...this.allLogs];

    if (this.selectedStatusFilter !== 'ALL') {
      result = result.filter((l) => l.paymentStatus === this.selectedStatusFilter);
    }

    if (this.searchTerm.trim()) {
      const q = this.searchTerm.toLowerCase().trim();
      result = result.filter(
        (l) =>
          l.cropOwnerName.toLowerCase().includes(q) ||
          l.cropOwnerPhone.includes(q) ||
          l.cropVillage.toLowerCase().includes(q) ||
          l.cropName.toLowerCase().includes(q)
      );
    }

    result.sort((a: any, b: any) => {
      const valA = a[this.sortBy];
      const valB = b[this.sortBy];

      if (valA === valB) return 0;
      if (valA == null) return 1;
      if (valB == null) return -1;

      const comp = valA > valB ? 1 : -1;
      return this.sortDir === 'asc' ? comp : -comp;
    });

    this.filteredLogs = result;
    this.totalPages = Math.ceil(this.filteredLogs.length / this.pageSize) || 1;

    if (this.currentPage >= this.totalPages) {
      this.currentPage = 0;
    }

    this.updatePagedLogs();
  }

  updatePagedLogs(): void {
    const start = this.currentPage * this.pageSize;
    const end = start + this.pageSize;
    this.pagedLogs = this.filteredLogs.slice(start, end);
  }

  setSort(column: keyof LogEntry): void {
    if (this.sortBy === column) {
      this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortBy = column;
      this.sortDir = 'desc';
    }
    this.applyFiltersAndSort();
  }

  goToPage(page: number): void {
    if (page >= 0 && page < this.totalPages) {
      this.currentPage = page;
      this.updatePagedLogs();
    }
  }

  onPageSizeChange(newSize: number): void {
    this.pageSize = newSize;
    this.currentPage = 0;
    this.applyFiltersAndSort();
  }

  getPageNumbers(): number[] {
    return Array.from({ length: this.totalPages }, (_, i) => i);
  }

  // --- Modal Openers ---
  openConfirmDialog(log: LogEntry): void {
    this.selectedLog = log;
    this.activeDialogMode = 'CONFIRM_MISSION';
    this.isDialogOpen = true;
  }

  openPaymentDialog(log: LogEntry): void {
    this.selectedLog = log;
    this.activeDialogMode = 'RECEIVE_PAYMENT';
    this.paymentMode = 'CASH';
    this.paymentReferenceNote = '';
    this.isDialogOpen = true;
  }

  closeDialog(): void {
    this.isDialogOpen = false;
    this.activeDialogMode = null;
    this.selectedLog = null;
  }

  // --- Execute Confirm  ---
  executeConfirmAction(): void {
    if (!this.selectedLog) return;

    const logRef = this.selectedLog.logId;
    
    const updatedLogEntry: LogEntry = {
        bookingId: this.selectedLog.bookingId!,
        droneId: this.selectedLog.droneId!,
        createDate: this.selectedLog.createDate,
        createTime: this.selectedLog.createTime,
        cropName: this.selectedLog.cropName,
        cropOwnerName: this.selectedLog.cropOwnerName,
        cropOwnerPhone: this.selectedLog.cropOwnerPhone,
        cropSize: this.selectedLog.cropSize,
        cropVillage: this.selectedLog.cropVillage,
        tankUsage: Math.round(this.selectedLog.cropSize * 2.0), // TODO Example calculation
        amount: this.selectedLog.amount,
        completeDate: new Date().toISOString().split('T')[0],
        completeTime: new Date().toLocaleTimeString('en-US', { hour12: false }),
        activityStatus: 'COMPLETED' as 'CONFIRMED' | 'COMPLETED' | 'CANCELLED',
        paymentStatus: 'PENDING' as PaymentStatus       
      };

      const paymentEntry: Payment = {
      logId: this.selectedLog.logId ?? 0, // this should not be Zero or undefined, but fallback to 0 for safety
      paymentStatus: 'PENDING',
      totalAmount: Number(this.selectedLog.amount),
      paidAmount: 0.00,
      pendingAmount: Number(this.selectedLog.amount), 
    };


    this.api.updateLog(logRef!, updatedLogEntry).subscribe({
      next: (u) => {
        this.showToast(`✅ Log Id #${logRef} confirmed and Spraying Completed!`, 'success');
        this.fetchLogs();
        console.log('Updated Log Entry:', u);
        this.api.createPayment(paymentEntry).subscribe({
          next: (p) => {
            console.log('Payment record created:', p);
            this.showToast(`💰 Payment record created for Log #${logRef}.`, 'success');
          },
          error: (err) => {
            console.error('Failed to create payment record:', err);
            this.showToast(`Failed to create payment record for Log #${logRef}.`, 'error');
          }
        });
      },
      error: () => {
          this.showToast('Failed to update Confirmation.', 'error');
      }
    });

    this.closeDialog();
    this.showToast(`✅ Mission Log #${logRef} has been verified and confirmed and Payment record created!`, 'success');
  }

  // --- Execute Payment Received ---
  executePaymentReceived(): void {
    
    if (!this.selectedLog?.logId) {
      this.showToast('Invalid log selection.', 'error');
      return;
    }

    const logRef = this.selectedLog.logId;
    const modeLabel = this.paymentMode === 'TRANSFER' ? 'UPI/Bank Transfer' : this.paymentMode;

    const updatedPaymentEntry: Payment = {
      logId: this.selectedLog.logId ?? 0, // this should not be Zero or undefined, but fallback to 0 for safety
      paymentDate: new Date().toISOString().split('T')[0],
      paymentTime: new Date().toLocaleTimeString('en-US', { hour12: false }),
      paymentStatus: 'PAID',
      totalAmount: Number(this.selectedLog.amount),
      paidAmount: Number(this.selectedLog.amount),
      pendingAmount: 0.00, 
      lastPaymentDate: new Date().toISOString().split('T')[0],
      lastPaymentTime: new Date().toLocaleTimeString('en-US', { hour12: false }),
      paymentType: this.paymentMode,
      paymentNotes: this.paymentReferenceNote 
    };

    this.api.getPaymentByLogId(this.selectedLog.logId).subscribe({
      next: (paymentRecord) => {
        console.log('Fetched payment record:', paymentRecord);
        if (paymentRecord.paymentId) {
          console.log('Found existing payment record:', paymentRecord);
              this.api.updatePayment(paymentRecord.paymentId, updatedPaymentEntry).subscribe({
                next: () => {
                  if (this.selectedLog) {
                    this.selectedLog.paymentStatus = 'PAID';
                  }
                  this.computeKpis();
                  this.closeDialog();
                  this.showToast(`💳 Payment of ₹${this.selectedLog?.amount} received via ${modeLabel} for #${logRef}!`, 'success');
                },
                error: (err) => {
                  console.error('Failed to update payment status:', err);
                  this.computeKpis();
                  this.closeDialog();
                  this.showToast('Failed to Update the payment record.', 'error');
                }
              });
        } else {
          this.showToast('No Payment record found for this flight log.', 'error');          
          return;
        }
      },
      error: (err) => {
        console.error('Failed to fetch payment record:', err);
        this.showToast('Failed to fetch payment record.', 'error');
        return;
      }
    });
  }

  // WhatsApp Reminder
  sendPaymentReminder(log: LogEntry): void {
    if (!log.cropOwnerPhone) {
      this.showToast('Farmer contact phone is missing.', 'error');
      return;
    }

    let cleanPhone = log.cropOwnerPhone.replace(/[^0-9]/g, '');
    if (cleanPhone.length === 10) cleanPhone = '91' + cleanPhone;

    const message = 
`🌾 *AeroKrishi Drone Spraying - Payment Due Reminder* 🛸
━━━━━━━━━━━━━━━━━━━━
Dear *${log.cropOwnerName}*,

Your drone spraying service has been completed:
📋 *Log Ref:* #${log.logId}
📅 *Date of Confirmation:* ${log.createDate} at ${log.createTime}
📅 *Date of Spray:* ${log.completeDate} at ${log.completeTime}
🌱 *Crop:* ${log.cropName} (${log.cropSize} Acres)
🧪 *Tanks Consumed:* ${log.tankUsage} Tanks
📍 *Village Plot:* ${log.cropVillage}
💰 *Total Amount Due:* *₹${log.amount}*
━━━━━━━━━━━━━━━━━━━━
Kindly arrange the payment via Cash or UPI/Bank Transfer.

Thank you for choosing AeroKrishi Autonomous Drone Systems!`;

    const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
    this.showToast(`WhatsApp reminder opened for ${log.cropOwnerName}`, 'success');
  }

  showToast(message: string, type: 'success' | 'error' = 'success'): void {
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toast = { show: true, message, type };
    this.toastTimer = setTimeout(() => (this.toast.show = false), 4000);
  }
}