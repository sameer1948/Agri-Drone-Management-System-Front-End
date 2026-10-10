import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AgriDroneService } from '../../services/agri-drone.service';
import { LogEntry, Payment, PaymentStatus } from '../../models/drone.model';

type DialogMode = 'CONFIRM_MISSION' | 'RECEIVE_PAYMENT' | 'VIEW_DETAILS' | null;

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

  // Payments mapping (logId -> Payment)
  paymentsMap: Map<number, Payment> = new Map();

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
  selectedPayment: Payment | null = null;

  // Payment Form Fields
  paymentMode: 'CASH' | 'TRANSFER' = 'CASH';
  paymentRadioOption: 'FULL' | 'CUSTOM' = 'FULL';
  enteredAmount: number = 0;
  amountError: string = '';
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
        this.fetchAssociatedPayments();
      },
      error: (err) => {
        console.error('Error fetching logs:', err);
        this.isLoading = false;
        this.showToast('Failed to load spraying mission logs.', 'error');
      }
    });
  }

  private fetchAssociatedPayments(): void {
    // Optionally load payment records for each log to track real-time pending & paid values
    const logIds = this.allLogs.map(l => l.logId).filter(id => id != null) as number[];
    let loaded = 0;

    if (logIds.length === 0) {
      this.computeKpis();
      this.applyFiltersAndSort();
      this.isLoading = false;
      return;
    }

    logIds.forEach(id => {
      this.api.getPaymentByLogId(id).subscribe({
        next: (pay) => {
          if (pay && pay.logId) {
            this.paymentsMap.set(pay.logId, pay);
          }
          loaded++;
          if (loaded === logIds.length) {
            this.computeKpis();
            this.applyFiltersAndSort();
            this.isLoading = false;
          }
        },
        error: () => {
          loaded++;
          if (loaded === logIds.length) {
            this.computeKpis();
            this.applyFiltersAndSort();
            this.isLoading = false;
          }
        }
      });
    });
  }

  getPaymentForLog(logId?: number): Payment | undefined {
    if (!logId) return undefined;
    return this.paymentsMap.get(logId);
  }

  getPendingAmountForLog(log: LogEntry): number {
    const pay = this.getPaymentForLog(log.logId);
    if (pay) {
      return pay.pendingAmount ?? 0;
    }
    return log.paymentStatus === 'PAID' ? 0 : Number(log.amount);
  }

  getPaidAmountForLog(log: LogEntry): number {
    const pay = this.getPaymentForLog(log.logId);
    if (pay) {
      return pay.paidAmount ?? 0;
    }
    return log.paymentStatus === 'PAID' ? Number(log.amount) : 0;
  }

  isFullySettled(log: LogEntry): boolean {
    const pay = this.getPaymentForLog(log.logId);
    if (pay) {
      return pay.paymentStatus === 'PAID' || (pay.pendingAmount === 0 && pay.paidAmount >= pay.totalAmount);
    }
    return log.paymentStatus === 'PAID';
  }

  private computeKpis(): void {
    this.totalLogs = this.allLogs.length;

    this.pendingAmount = this.allLogs.reduce((acc, curr) => {
      return acc + this.getPendingAmountForLog(curr);
    }, 0);

    this.collectedAmount = this.allLogs.reduce((acc, curr) => {
      return acc + this.getPaidAmountForLog(curr);
    }, 0);
  }

  // --- Filtering & Sorting ---
  applyFiltersAndSort(): void {
    let result = [...this.allLogs];

    if (this.selectedStatusFilter !== 'ALL') {
      result = result.filter((l) => {
        const settled = this.isFullySettled(l);
        return this.selectedStatusFilter === 'PAID' ? settled : !settled;
      });
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
  openRowDetails(log: LogEntry): void {
    this.selectedLog = log;
    this.selectedPayment = this.getPaymentForLog(log.logId) || null;
    this.activeDialogMode = 'VIEW_DETAILS';
    this.isDialogOpen = true;
  }

  openConfirmDialog(log: LogEntry, event?: Event): void {
    if (event) event.stopPropagation();
    this.selectedLog = log;
    this.activeDialogMode = 'CONFIRM_MISSION';
    this.isDialogOpen = true;
  }

  openPaymentDialog(log: LogEntry, event?: Event): void {
    if (event) event.stopPropagation();
    this.selectedLog = log;
    this.selectedPayment = this.getPaymentForLog(log.logId) || null;
    this.activeDialogMode = 'RECEIVE_PAYMENT';
    this.paymentMode = 'CASH';
    this.paymentReferenceNote = '';

    // Calculate maximum available pending amount
    const maxPending = this.getPendingAmountForLog(log);
    this.paymentRadioOption = 'FULL';
    this.enteredAmount = maxPending;
    this.amountError = '';

    this.isDialogOpen = true;
  }

  closeDialog(): void {
    this.isDialogOpen = false;
    this.activeDialogMode = null;
    this.selectedLog = null;
    this.selectedPayment = null;
    this.amountError = '';
  }

  // --- Radio / Input Amount Handling ---
  onPaymentRadioChange(): void {
    if (!this.selectedLog) return;
    const maxPending = this.getPendingAmountForLog(this.selectedLog);

    if (this.paymentRadioOption === 'FULL') {
      this.enteredAmount = maxPending;
      this.amountError = '';
    } else {
      this.enteredAmount = 0;
      this.amountError = 'Please enter custom amount';
    }
  }

  validateCustomAmount(): void {
    if (!this.selectedLog) return;
    const maxPending = this.getPendingAmountForLog(this.selectedLog);
    const entered = Number(this.enteredAmount);

    if (this.paymentRadioOption === 'CUSTOM') {
      if (isNaN(entered) || entered <= 0) {
        this.amountError = 'Amount must be greater than ₹0.';
      } else if (entered > maxPending) {
        this.amountError = `Amount cannot exceed current pending balance of ₹${maxPending}.`;
      } else {
        this.amountError = '';
      }
    } else {
      this.amountError = '';
    }
  }

  get isPaymentSubmitDisabled(): boolean {
    if (!this.enteredAmount || this.enteredAmount <= 0) return true;
    if (this.amountError !== '') return true;
    return false;
  }

  // --- Execute Confirm ---
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
      tankUsage: Math.round(this.selectedLog.cropSize * 2.0),
      amount: this.selectedLog.amount,
      completeDate: new Date().toISOString().split('T')[0],
      completeTime: new Date().toLocaleTimeString('en-US', { hour12: false }),
      activityStatus: 'COMPLETED' as 'CONFIRMED' | 'COMPLETED' | 'CANCELLED',
      paymentStatus: 'PENDING' as PaymentStatus
    };

    const paymentEntry: Payment = {
      logId: this.selectedLog.logId ?? 0,
      paymentStatus: 'PENDING',
      totalAmount: Number(this.selectedLog.amount),
      paidAmount: 0.00,
      pendingAmount: Number(this.selectedLog.amount)
    };

    this.api.updateLog(logRef!, updatedLogEntry).subscribe({
      next: (u) => {
        this.showToast(`✅ Log Id #${logRef} confirmed and Spraying Completed!`, 'success');
        this.api.createPayment(paymentEntry).subscribe({
          next: (p) => {
            if (p?.logId) this.paymentsMap.set(p.logId, p);
            this.fetchLogs();
            this.showToast(`💰 Payment record initialized for Log #${logRef}.`, 'success');
          },
          error: (err) => {
            console.error('Failed to create payment record:', err);
            this.fetchLogs();
          }
        });
      },
      error: () => {
        this.showToast('Failed to update Confirmation.', 'error');
      }
    });

    this.closeDialog();
  }

  // --- Execute Payment Received ---
  executePaymentReceived(): void {
    if (!this.selectedLog?.logId) {
      this.showToast('Invalid log selection.', 'error');
      return;
    }

    const logRef = this.selectedLog.logId;
    const modeLabel = this.paymentMode === 'TRANSFER' ? 'UPI/Bank Transfer' : this.paymentMode;
    const incomingAmt = Number(this.enteredAmount);

    this.api.getPaymentByLogId(logRef).subscribe({
      next: (paymentRecord) => {
        if (!paymentRecord || !paymentRecord.paymentId) {
          this.showToast('No payment record exists for this flight mission.', 'error');
          return;
        }

        const currentPaid = Number(paymentRecord.paidAmount) || 0;
        const total = Number(paymentRecord.totalAmount) || Number(this.selectedLog!.amount);
        const newPaid = currentPaid + incomingAmt;
        const newPending = Math.max(0, total - newPaid);
        const newStatus: PaymentStatus = newPending === 0 ? 'PAID' : 'PENDING';

        const updatedPayment: Payment = {
          ...paymentRecord,
          paidAmount: newPaid,
          pendingAmount: newPending,
          paymentStatus: newStatus,
          lastPaymentDate: new Date().toISOString().split('T')[0],
          lastPaymentTime: new Date().toLocaleTimeString('en-US', { hour12: false }),
          paymentType: this.paymentMode,
          paymentNotes: this.paymentReferenceNote
        };

        this.api.updatePayment(paymentRecord.paymentId, updatedPayment).subscribe({
          next: (savedPayment) => {
            this.paymentsMap.set(logRef, savedPayment);

            if (newStatus === 'PAID') {
              this.selectedLog!.paymentStatus = 'PAID';
              this.api.updateLog(logRef, this.selectedLog!).subscribe();
            }

            this.computeKpis();
            this.applyFiltersAndSort();
            this.closeDialog();
            this.showToast(`💳 Payment of ₹${incomingAmt} recorded via ${modeLabel} for #${logRef}!`, 'success');
          },
          error: (err) => {
            console.error('Failed to update payment record:', err);
            this.showToast('Failed to update the payment record.', 'error');
          }
        });
      },
      error: (err) => {
        console.error('Failed to fetch payment record:', err);
        this.showToast('Failed to fetch payment record.', 'error');
      }
    });
  }

  // WhatsApp Reminder
  sendPaymentReminder(log: LogEntry, event?: Event): void {
    if (event) event.stopPropagation();

    if (!log.cropOwnerPhone) {
      this.showToast('Farmer contact phone is missing.', 'error');
      return;
    }

    let cleanPhone = log.cropOwnerPhone.replace(/[^0-9]/g, '');
    if (cleanPhone.length === 10) cleanPhone = '91' + cleanPhone;

    const pending = this.getPendingAmountForLog(log);

    const message = 
`🌾 *AeroKrishi Drone Spraying - Payment Due Reminder* 🛸
━━━━━━━━━━━━━━━━━━━━
Dear *${log.cropOwnerName}*,

Your drone spraying service summary:
📋 *Log Ref:* #${log.logId}
📅 *Date of Confirmation:* ${log.createDate} at ${log.createTime}
🌱 *Crop:* ${log.cropName} (${log.cropSize} Acres)
🧪 *Tanks Consumed:* ${log.tankUsage} Tanks
📍 *Village Plot:* ${log.cropVillage}
💰 *Total Amount:* ₹${log.amount}
⏳ *Pending Balance Due:* *₹${pending}*
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