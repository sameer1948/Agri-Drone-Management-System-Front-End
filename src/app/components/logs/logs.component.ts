import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, FormsModule, Validators } from '@angular/forms';
import { LogEntry } from '../../models/log.model';
import { Payment, PaymentStatus } from '../../models/payment.model';
import { LogService } from '../../services/log.service';
import { PaymentService } from '../../services/payment.service';
import { BookingService } from '../../services/booking.service';
import { CropService } from '../../services/crop.service';
import { VillageService } from '../../services/village.service';
import { DroneService } from '../../services/drone.service';
import { RateService } from '../../services/rate.service';
import { Crop } from '../../models/crop.model';
import { Village } from '../../models/village.model';
import { Drone } from '../../models/drone.model';
import { Rate } from '../../models/rate.model';

type DialogMode = 'CONFIRM_MISSION' | 'RECEIVE_PAYMENT' | 'VIEW_DETAILS' | null;

@Component({
  selector: 'app-logs',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './logs.component.html',
  styleUrls: ['./logs.component.scss']
})
export class LogsComponent implements OnInit {

  private logApi = inject(LogService);
  private paymentApi = inject(PaymentService);
  private bookingApi = inject(BookingService);
  private cropApi = inject(CropService);
  private villageApi = inject(VillageService);
  private droneApi = inject(DroneService);
  private rateApi = inject(RateService);
  private fb = inject(FormBuilder);

  allLogs: LogEntry[] = [];
  filteredLogs: LogEntry[] = [];
  pagedLogs: LogEntry[] = [];
  isLoading = false;

  // Payments mapping (logId -> Payment)
  paymentsMap: Map<number, Payment> = new Map();

  // Master Lists for Dropdowns
  cropsList: Crop[] = [];
  villagesList: Village[] = [];
  availableDrones: Drone[] = [];
  availableRates: Rate[] = [];

  searchTerm = '';
  selectedStatusFilter: 'ALL' | 'PAID' | 'PENDING' = 'ALL';

  // KPI Metrics & Privacy Visibility States
  totalLogs = 0;
  pendingAmount = 0;
  collectedAmount = 0;
  isPendingVisible = false;
  isCollectedVisible = false;

  // Sorting
  sortBy: keyof LogEntry = 'logId';
  sortDir: 'asc' | 'desc' = 'desc';

  // Pagination
  currentPage = 0;
  pageSize = 10;
  pageSizeOptions = [5, 10, 20, 50];
  totalPages = 0;

  // Dialog & In-Place Edit States
  isDialogOpen = false;
  activeDialogMode: DialogMode = null;
  selectedLog: LogEntry | null = null;
  selectedPayment: Payment | null = null;
  isEditMode = false;
  editLogForm!: FormGroup;

  // Actual Sprayed Acres & Dynamic Pricing Fields
  selectedPrice: number = 250;
  actualSprayedAcres: number = 0;
  recomputedAmount: number = 0;

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
    this.initEditForm();
    this.loadDatabaseMasterData();
    this.fetchLogs();
  }

  private initEditForm(): void {
    this.editLogForm = this.fb.group({
      cropOwnerName: ['', [Validators.required, Validators.minLength(3)]],
      cropOwnerPhone: ['', [Validators.required, Validators.pattern('^[6-9][0-9]{9}$')]],
      cropName: ['', Validators.required],
      cropVillage: ['', Validators.required],
      droneId: ['', Validators.required],
      cropSize: [null, [Validators.required, Validators.min(0.5)]],
      price: [250, [Validators.required, Validators.min(1)]]
    });
  }

  private loadDatabaseMasterData(): void {
    this.cropApi.getCrops().subscribe({
      next: (crops) => (this.cropsList = crops || []),
      error: () => console.warn('Could not load crops')
    });

    this.villageApi.getVillages().subscribe({
      next: (villages) => (this.villagesList = villages || []),
      error: () => console.warn('Could not load villages')
    });

    this.droneApi.getDrones().subscribe({
      next: (drones) => (this.availableDrones = (drones || []).filter(d => d.droneStatus === 'ACTIVE')),
      error: () => console.warn('Could not load drones')
    });

    this.rateApi.getRates().subscribe({
      next: (rates) => (this.availableRates = rates || []),
      error: () => console.warn('Could not load tariff rates')
    });
  }

  fetchLogs(): void {
    this.isLoading = true;
    this.logApi.getLogs().subscribe({
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
    const logIds = this.allLogs.filter(c => c.activityStatus === 'COMPLETED' && c.logId != null).map(c => c.logId as number);
    let loaded = 0;

    if (logIds.length === 0) {
      this.computeKpis();
      this.applyFiltersAndSort();
      this.isLoading = false;
      return;
    }

    logIds.forEach(id => {
      this.paymentApi.getPaymentByLogId(id).subscribe({
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

  // --- Toggle Eye Visibility ---
  togglePendingVisibility(): void {
    this.isPendingVisible = !this.isPendingVisible;
  }

  toggleCollectedVisibility(): void {
    this.isCollectedVisible = !this.isCollectedVisible;
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
    this.isEditMode = false;
    this.isDialogOpen = true;
  }

  enableEditMode(): void {
    if (!this.selectedLog) return;
    this.isEditMode = true;
    this.editLogForm.patchValue({
      cropOwnerName: this.selectedLog.cropOwnerName,
      cropOwnerPhone: this.selectedLog.cropOwnerPhone,
      cropName: this.selectedLog.cropName,
      cropVillage: this.selectedLog.cropVillage,
      droneId: this.selectedLog.droneId,
      cropSize: this.selectedLog.cropSize,
      price: this.selectedLog.price || 250
    });
  }

  disableEditMode(): void {
    this.isEditMode = false;
  }

  saveInPlaceEdit(): void {
    if (this.editLogForm.invalid || !this.selectedLog?.logId) {
      this.editLogForm.markAllAsTouched();
      return;
    }

    const val = this.editLogForm.value;
    const newAcres = Number(val.cropSize);
    const newPrice = Number(val.price);
    const newTotal = Number((newAcres * newPrice).toFixed(2));

    const updatedLog: LogEntry = {
      ...this.selectedLog,
      cropOwnerName: val.cropOwnerName.trim(),
      cropOwnerPhone: val.cropOwnerPhone.trim(),
      cropName: val.cropName,
      cropVillage: val.cropVillage,
      droneId: val.droneId,
      cropSize: newAcres,
      tankUsage: newAcres, // Strictly 1:1
      price: newPrice,     
      amount: newTotal
    };

    // 1. Update Log in backend
    this.logApi.updateLog(this.selectedLog.logId, updatedLog).subscribe({
      next: () => {
        // 2. Synchronize original booking in backend
        if (this.selectedLog?.bookingId) {
          const syncNote = `Record parameters updated via Mission Log #${this.selectedLog.logId}`;
          this.bookingApi.updateActualSprayedArea(this.selectedLog.bookingId, newAcres, syncNote).subscribe({
            next: () => console.log(`Booking #${this.selectedLog!.bookingId} synchronized.`),
            error: (err) => console.warn(`Could not sync booking:`, err)
          });
        }

        // Update ALL local state objects immediately
        this.selectedLog = { ...updatedLog };
        this.selectedPrice = newPrice;
        this.actualSprayedAcres = newAcres;
        this.recomputedAmount = newTotal;

        // Update in-memory lists so clicking other buttons reads the fresh 350
        const idx = this.allLogs.findIndex(l => l.logId === updatedLog.logId);
        if (idx !== -1) this.allLogs[idx] = { ...updatedLog };
        const pIdx = this.pagedLogs.findIndex(l => l.logId === updatedLog.logId);
        if (pIdx !== -1) this.pagedLogs[pIdx] = { ...updatedLog };

        this.isEditMode = false;
        this.computeKpis();
        this.showToast(`✅ Log #${updatedLog.logId} updated: Rate ₹${newPrice}/tank & Area ${newAcres} Ac!`, 'success');
      },
      error: () => {
        this.showToast('Failed to update mission parameters.', 'error');
      }
    });
  }

openConfirmDialog(log: LogEntry, event?: Event): void {
    if (event) event.stopPropagation();

    // Find the freshest state from in-memory allLogs (in case it was just edited)
    const freshLog = this.allLogs.find(l => l.logId === log.logId) || log;
    this.selectedLog = { ...freshLog };

    // Set the actual sprayed acres from the log
    this.actualSprayedAcres = Number(freshLog.cropSize) || 0;

    // Strictly prioritize freshLog.price (e.g., 350) over any default
    if (freshLog.price !== undefined && freshLog.price !== null && Number(freshLog.price) > 0) {
      this.selectedPrice = Number(freshLog.price);
    } else if (this.availableRates && this.availableRates.length > 0) {
      this.selectedPrice = Number(this.availableRates[0].price);
    } else {
      this.selectedPrice = 250;
    }

    this.recomputeConfirmCost();
    this.activeDialogMode = 'CONFIRM_MISSION';
    this.isEditMode = false;
    this.isDialogOpen = true;
  }

  onActualAcresChange(): void {
    this.recomputeConfirmCost();
  }

  private recomputeConfirmCost(): void {
    if (!this.selectedLog) return;
    // Use selectedPrice first; if missing, use selectedLog.price
    const price = Number(this.selectedPrice) > 0 
      ? Number(this.selectedPrice) 
      : (Number(this.selectedLog.price) > 0 ? Number(this.selectedLog.price) : 250);

    const acres = Number(this.actualSprayedAcres) || 0;
    // 1 Acre = 1 Tank calculation
    this.recomputedAmount = Number((acres * price).toFixed(2));
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
    this.isEditMode = false;

    this.isDialogOpen = true;
  }

  closeDialog(): void {
    this.isDialogOpen = false;
    this.activeDialogMode = null;
    this.selectedLog = null;
    this.selectedPayment = null;
    this.isEditMode = false;
    this.amountError = '';
  }

  getFormattedPaymentNotes(notes?: string): string[] {
    if (!notes || !notes.trim()) return [];
    return notes
      .split(';')
      .map(line => line.trim())
      .filter(line => line.length > 0);
  }

  copyNotesToClipboard(notes?: string): void {
    if (!notes) return;
    navigator.clipboard.writeText(notes.trim()).then(() => {
      this.showToast('📋 Payment notes copied to clipboard!', 'success');
    }).catch(() => {
      this.showToast('Failed to copy to clipboard.', 'error');
    });
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
        this.amountError = `Amount cannot exceed balance of ₹${maxPending}.`;
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

  // --- Execute Confirm with Actual Sprayed Acreage (1 Acre = 1 Tank) ---
  executeConfirmAction(): void {
    if (!this.selectedLog || !this.selectedLog.logId) return;

    const logRef = this.selectedLog.logId;
    const bookingRef = this.selectedLog.bookingId;
    const finalAcres = Number(this.actualSprayedAcres) > 0 ? Number(this.actualSprayedAcres) : Number(this.selectedLog.cropSize);
    
    //  Lock the exact price user configured (e.g. 350)
    const appliedPrice = Number(this.selectedPrice) > 0 
      ? Number(this.selectedPrice) 
      : (Number(this.selectedLog.price) > 0 ? Number(this.selectedLog.price) : 250);

    const finalAmount = Number((finalAcres * appliedPrice).toFixed(2));

    const now = new Date();
    const compDate = now.toISOString().split('T')[0];
    const compTime = now.toTimeString().split(' ')[0];

    // 1. Updated Log Entry (1 Acre = 1 Tank)
    const updatedLogEntry: LogEntry = {
      ...this.selectedLog,
      cropSize: finalAcres,
      tankUsage: finalAcres, // Strictly 1:1
      price: appliedPrice,   
      amount: finalAmount,   
      completeDate: compDate,
      completeTime: compTime,
      activityStatus: 'COMPLETED',
      paymentStatus: 'PENDING'
    };

    // 2. Initialize Payment Entry
    const paymentEntry: Payment = {
      logId: logRef,
      paymentStatus: 'PENDING',
      totalAmount: Number(finalAmount),
      paidAmount: 0.00,
      pendingAmount: Number(finalAmount)
    };

    const completionNote = `Sprayed area: ${finalAcres} ac @ ₹${appliedPrice}/tank.`;

    // Step A: Update the Mission Log
    this.logApi.updateLog(logRef, updatedLogEntry).subscribe({
      next: () => {
        // Step B: Synchronize the original Booking record with actual sprayed acres
        if (bookingRef) {
          this.bookingApi.updateActualSprayedArea(bookingRef, finalAcres, completionNote).subscribe({
            next: () => console.log(`Booking #${bookingRef} synchronized.`),
            error: (err) => console.warn(`Could not sync booking:`, err)
          });
        }

        // Step C: Initialize Payment Ledger Entry
        this.paymentApi.createPayment(paymentEntry).subscribe({
          next: (p) => {
            if (p?.logId) this.paymentsMap.set(p.logId, p);
            this.fetchLogs();
            this.showToast(`✅ Mission #${logRef} confirmed with ${finalAcres} Acres @ ₹${appliedPrice}/tank (Total: ₹${finalAmount})!`, 'success');
          },
          error: () => this.fetchLogs()
        });
      },
      error: () => {
        this.showToast('Failed to finalize mission confirmation.', 'error');
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

    this.paymentApi.getPaymentByLogId(logRef).subscribe({
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

        const nowStr = new Date().toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' });
        const userRemarks = this.paymentReferenceNote.trim() ? ` [Remarks: ${this.paymentReferenceNote.trim()}]` : '';

        const newNoteEntry = `Payment of ₹${incomingAmt} recorded via ${modeLabel} on ${nowStr}${userRemarks}; `;
        const updatedPaymentNotes = paymentRecord.paymentNotes 
          ? `${paymentRecord.paymentNotes.trim()} ${newNoteEntry}`
          : newNoteEntry;

        const updatedPayment: Payment = {
          ...paymentRecord,
          paidAmount: newPaid,
          pendingAmount: newPending,
          paymentStatus: newStatus,
          paymentDate: paymentRecord.paymentDate == null ? new Date().toISOString().split('T')[0] : paymentRecord.paymentDate, 
          paymentTime: paymentRecord.paymentDate == null ? new Date().toLocaleTimeString('en-US', { hour12: false }): paymentRecord.paymentTime,
          lastPaymentDate: new Date().toISOString().split('T')[0],
          lastPaymentTime: new Date().toLocaleTimeString('en-US', { hour12: false }),
          paymentType: this.paymentMode,
          paymentNotes: updatedPaymentNotes
        };

        this.paymentApi.updatePayment(paymentRecord.paymentId, updatedPayment).subscribe({
          next: (savedPayment) => {
            this.paymentsMap.set(logRef, savedPayment);

            if (newStatus === 'PAID') {
              this.selectedLog!.paymentStatus = 'PAID';
              this.logApi.updateLog(logRef, this.selectedLog!).subscribe();
            }

            this.computeKpis();
            this.applyFiltersAndSort();
            this.closeDialog();
            this.showToast(`💳 Payment of ₹${incomingAmt} recorded via ${modeLabel} for #${logRef}!`, 'success');
          },
          error: (err) => {
            console.error('Failed to update payment record:', err);
            this.showToast('Failed to update payment record.', 'error');
          }
        });
      },
      error: () => this.showToast('Failed to fetch payment record.', 'error')
    });
  }

  // --- Dynamic WhatsApp Notification ---
  sendSmartNotification(log: LogEntry, event?: Event): void {
    if (event) event.stopPropagation();

    if (!log.cropOwnerPhone) {
      this.showToast('Farmer contact phone is missing.', 'error');
      return;
    }

    let cleanPhone = log.cropOwnerPhone.replace(/[^0-9]/g, '');
    if (cleanPhone.length === 10) cleanPhone = '91' + cleanPhone;

    const pending = this.getPendingAmountForLog(log);
    const paid = this.getPaidAmountForLog(log);
    const isSettled = this.isFullySettled(log);
    const isCompleted = log.activityStatus === 'COMPLETED';

    let header = '';
    let footerMessage = '';

    if (isCompleted && isSettled) {
      header = '*Sri Jagadeeswara AGRI Drone Spraying - Service Completed & Paid* ';
      footerMessage = 'Thank you! Your spraying service is completely finished and fully settled.';
    } else if (isCompleted && !isSettled) {
      header = '*Sri Jagadeeswara AGRI Drone Spraying - Mission Completed (Payment Pending)* ';
      footerMessage = `Your field has been sprayed successfully. Please settle the pending balance of *₹${pending}* via Cash or UPI at your earliest convenience.`;
    } else {
      header = '*Sri Jagadeeswara AGRI Drone Spraying - Pilot & Mission Dispatched* ';
      footerMessage = 'Our pilot and autonomous drone unit are prepared for your scheduled mission. Please ensure field water availability.';
    }

    const messageLines = [
      header,
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      `Dear *${log.cropOwnerName}*, details of your flight log:`,
      '',
      `*Log ID:* #${log.logId} (Booking #${log.bookingId})`,
      `*Drone Unit:* ${log.droneId}`,
      `*Scheduled Slot:* ${log.createDate} at ${log.createTime}`,
      log.confirmedDate ? `*Confirmed Date:* ${log.confirmedDate} (${log.confirmedTime})` : '',
      log.completeDate ? `*Completed Date:* ${log.completeDate} (${log.completeTime})` : '',
      `*Crop & Plot:* ${log.cropName} (${log.cropVillage})`,
      `*Sprayed Land Size:* ${log.cropSize} Acres (${log.tankUsage} Tanks @ 1 Acre = 1 Tank)`,
      `*Tariff Rate:* ₹${log.price}/tank`,
      `*Total Bill:* ₹${log.amount}`,
      isCompleted ? `*Amount Paid:* ₹${paid}` : '',
      isCompleted ? `*Pending Balance:* *₹${pending}*` : '',
      `*Activity Status:* *${log.activityStatus}*`,
      `*Payment Status:* *${isSettled ? 'PAID' : 'PENDING'}*`,
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      footerMessage,
      '',
      '*Official Pilot Hotline:* +91 9642343838, +91 9032343838',
      '_*Sri Jagadeeswara AGRI Drone Spraying*_'
    ].filter(line => line !== null && line !== undefined && line.trim() !== '');

    const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(messageLines.join('\n'))}`;
    window.open(url, '_blank', 'noopener,noreferrer');
    this.showToast(`WhatsApp notice opened for ${log.cropOwnerName}`, 'success');
  }

  showToast(message: string, type: 'success' | 'error' = 'success'): void {
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toast = { show: true, message, type };
    this.toastTimer = setTimeout(() => (this.toast.show = false), 4000);
  }
}