import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, FormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { RateService } from '../../services/rate.service';
import { Rate } from '../../models/rate.model';
import { DroneService } from '../../services/drone.service';
import { Booking, BookingStatus } from '../../models/booking.model';
import { Drone, PageResponse } from '../../models/drone.model';
import { LogEntry } from '../../models/log.model';
import { PaymentStatus } from '../../models/payment.model';
import { BookingService } from '../../services/booking.service';
import { LogService } from '../../services/log.service';
import { Crop } from '../../models/crop.model';
import { Village } from '../../models/village.model';
import { CropService } from '../../services/crop.service';
import { VillageService } from '../../services/village.service';

type ActionType = 'CONFIRM' | 'CANCEL' | 'DELETE' | null;

@Component({
  selector: 'app-operation',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, RouterLink],
  templateUrl: './operation.component.html',
  styleUrls: ['./operation.component.scss']
})
export class OperationComponent implements OnInit {

  private droneApi = inject(DroneService);
  private bookingApi = inject(BookingService);
  private logApi = inject(LogService);
  private rateApi = inject(RateService);
  private villageApi = inject(VillageService);
  private cropApi = inject(CropService);
  private fb = inject(FormBuilder);

  // Data & State
  bookings: Booking[] = [];
  currentRate: Rate = { price: 250, isActive: true, effectiveFrom: '' };
  isLoading = false;

  // Master Data Lists from DB
  cropsList: Crop[] = [];
  villagesList: Village[] = [];

  // Metrics
  totalCount = 0;
  pendingCount = 0;
  confirmedCount = 0;
  totalRevenue = 0;

  // Filters & Search
  searchTerm = '';
  selectedStatusFilter = 'ALL';
  selectedCropFilter = 'ALL';

  // Pagination & Sorting
  currentPage = 0;
  pageSize = 10;
  pageSizeOptions = [5, 10, 20, 50];
  totalPages = 0;
  totalElements = 0;
  sortBy = 'bookingId';
  sortDir: 'asc' | 'desc' = 'desc';

  availableDrones: Drone[] = [];
  selectedDroneId: string = '';

  // --- Modals State ---
  isEditModalOpen = false;
  isDetailsModalOpen = false;
  selectedBookingDetails: Booking | null = null;
  editForm!: FormGroup;
  editingBooking: Booking | null = null;
  computedAmount = 0;

  // Confirmation Action Dialog
  isConfirmActionDialogOpen = false;
  activeActionType: ActionType = null;
  targetBooking: Booking | null = null;

  // Toast / Snackbar
  toast = { show: false, message: '', type: 'success' };
  private toastTimer: any;

  ngOnInit(): void {
    this.initEditForm();
    this.loadDrones();
    this.loadMasterData();
    this.rateApi.getCurrentRate().subscribe(r => { if (r?.price) this.currentRate = r; });
    this.loadData();
  }

  loadMasterData(): void {
    this.cropApi.getCrops().subscribe({
      next: (data) => (this.cropsList = data || []),
      error: (err) => console.error('Failed to load crops:', err)
    });

    this.villageApi.getVillages().subscribe({
      next: (data) => (this.villagesList = data || []),
      error: (err) => console.error('Failed to load villages:', err)
    });
  }

  private initEditForm(): void {
    this.editForm = this.fb.group({
      bookingDate: ['', Validators.required],
      bookingDay: [''],
      cropName: ['', Validators.required],
      cropOwnerName: ['', [Validators.required, Validators.minLength(3)]],
      cropOwnerPhone: ['', [Validators.required, Validators.pattern('^[6-9][0-9]{9}$')]],
      cropVillage: ['', Validators.required],
      cropSize: [null, [Validators.required, Validators.min(1), Validators.pattern('^[1-9][0-9]*$')]],
      bookingStatus: ['PENDING', Validators.required],
      bookingNotes: ['']
    });

    this.editForm.get('bookingDate')?.valueChanges.subscribe((dt) => {
      if (dt) {
        const d = new Date(dt + 'T00:00:00');
        this.editForm.get('bookingDay')?.setValue(d.toLocaleDateString('en-US', { weekday: 'long' }), { emitEvent: false });
      }
    });

    // 1 Acre = 1 Tank
    this.editForm.get('cropSize')?.valueChanges.subscribe(() => this.recalcEditAmount());
  }

  loadDrones(): void {
    this.droneApi.getDrones().subscribe({
      next: (drones) => {
        this.availableDrones = (drones || []).filter(d => d.droneStatus === 'ACTIVE');
        if (this.availableDrones.length > 0) {
          this.selectedDroneId = this.availableDrones[0].droneId;
        }
      },
      error: (err) => console.error('Failed to load drones', err)
    });
  }

  loadData(page: number = this.currentPage): void {
    this.isLoading = true;
    this.currentPage = page;

    this.bookingApi.getFilteredBookings({
      status: this.selectedStatusFilter,
      crop: this.selectedCropFilter,
      search: this.searchTerm,
      page: this.currentPage,
      size: this.pageSize,
      sortBy: this.sortBy,
      sortDir: this.sortDir
    }).subscribe({
      next: (res: PageResponse<Booking>) => {
        this.bookings = res.content || [];
        this.totalElements = res.totalElements;
        this.totalPages = res.totalPages;
        this.computeMetrics(res.content, res.totalElements);
        this.isLoading = false;
      },
      error: () => {
        this.isLoading = false;
        this.showToast('Failed to load records from server.', 'error');
      }
    });
  }

  private computeMetrics(pageItems: Booking[], total: number): void {
    this.totalCount = total;
    this.pendingCount = pageItems.filter(b => b.bookingStatus === 'PENDING').length;
    this.confirmedCount = pageItems.filter(b => b.bookingStatus === 'CONFIRMED').length;
    this.totalRevenue = pageItems.reduce((acc, curr) => acc + (curr.amount || 0), 0);
  }

  toggleSort(column: string): void {
    if (this.sortBy === column) {
      this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortBy = column;
      this.sortDir = 'desc';
    }
    this.loadData(0);
  }

  // --- Row Click Details Dialog ---
  openRowDetails(booking: Booking): void {
    this.selectedBookingDetails = booking;
    this.isDetailsModalOpen = true;
  }

  closeRowDetails(): void {
    this.selectedBookingDetails = null;
    this.isDetailsModalOpen = false;
  }

  confirmFromDetails(): void {
    if (!this.selectedBookingDetails) return;
    const b = this.selectedBookingDetails;
    this.closeRowDetails();
    this.openActionDialog('CONFIRM', b);
  }

  // --- Edit Modal Handlers ---
  openEditModal(booking: Booking, event?: Event): void {
    if (event) event.stopPropagation();
    this.editingBooking = booking;
    this.editForm.patchValue({
      bookingDate: booking.bookingDate,
      bookingDay: booking.bookingDay,
      cropName: booking.cropName,
      cropOwnerName: booking.cropOwnerName,
      cropOwnerPhone: booking.cropOwnerPhone,
      cropVillage: booking.cropVillage,
      cropSize: booking.cropSize,
      bookingStatus: booking.bookingStatus,
      bookingNotes: booking.bookingNotes || ''
    });
    this.recalcEditAmount();
    this.isEditModalOpen = true;
  }

  closeEditModal(): void {
    this.isEditModalOpen = false;
    this.editingBooking = null;
  }

  recalcEditAmount(): void {
    const size = parseInt(this.editForm.get('cropSize')?.value, 10) || 0;
    this.computedAmount = size * (this.currentRate.price || 250);
  }

  submitEditForm(): void {
    if (this.editForm.invalid || !this.editingBooking?.bookingId) return;

    const f = this.editForm.value;
    const payload: Booking = {
      bookingId: this.editingBooking.bookingId,
      bookingDate: f.bookingDate,
      bookingDay: f.bookingDay,
      cropName: f.cropName,
      cropOwnerName: f.cropOwnerName,
      cropOwnerPhone: f.cropOwnerPhone,
      cropVillage: f.cropVillage,
      cropSize: parseInt(f.cropSize, 10),
      bookingStatus: f.bookingStatus,
      bookingNotes: f.bookingNotes,
      price: this.currentRate.price,
      amount: this.computedAmount
    };

    this.bookingApi.updateBooking(this.editingBooking.bookingId, payload).subscribe({
      next: () => {
        this.closeEditModal();
        this.loadData(this.currentPage);
        this.showToast(`Booking #${payload.bookingId} updated successfully!`, 'success');
      },
      error: () => this.showToast('Failed to update booking.', 'error')
    });
  }

  // --- Confirmation Action Dialog (Confirm / Cancel) ---
  openActionDialog(type: ActionType, booking: Booking, event?: Event): void {
    if (event) event.stopPropagation();
    this.activeActionType = type;
    this.targetBooking = booking;
    if (this.availableDrones.length > 0 && !this.selectedDroneId) {
      this.selectedDroneId = this.availableDrones[0].droneId;
    }
    this.isConfirmActionDialogOpen = true;
  }

  closeActionDialog(): void {
    this.isConfirmActionDialogOpen = false;
    this.activeActionType = null;
    this.targetBooking = null;
  }

  executeAction(): void {
    if (!this.targetBooking?.bookingId || !this.activeActionType) return;
    const id = this.targetBooking.bookingId;

    if (this.activeActionType === 'CONFIRM') {
      if (!this.selectedDroneId) {
        this.showToast('Please select a drone to assign to this mission.', 'error');
        return;
      }

      const assignedDrone = this.availableDrones.find(d => d.droneId === this.selectedDroneId);
      const droneName = assignedDrone ? assignedDrone.droneName : 'Standard Agri Drone';

      const newLogEntry: LogEntry = {
        bookingId: this.targetBooking.bookingId!,
        droneId: this.selectedDroneId,
        createDate: this.targetBooking.bookingDate,
        createTime: new Date().toLocaleTimeString('en-US', { hour12: false }),
        cropName: this.targetBooking.cropName,
        cropOwnerName: this.targetBooking.cropOwnerName,
        cropOwnerPhone: this.targetBooking.cropOwnerPhone,
        cropSize: this.targetBooking.cropSize,
        cropVillage: this.targetBooking.cropVillage,
        tankUsage: this.targetBooking.cropSize, // 1 acre = 1 tank
        amount: this.targetBooking.amount,
        activityStatus: 'CONFIRMED' as 'CONFIRMED' | 'COMPLETED' | 'CANCELLED',
        paymentStatus: 'PENDING' as PaymentStatus       
      };

      const updatedBooking: Booking = {
        ...this.targetBooking,
        bookingStatus: 'CONFIRMED' as BookingStatus
      };

      this.logApi.createLog(newLogEntry).subscribe({
        next: () => {
          this.bookingApi.updateBooking(id, updatedBooking).subscribe({
            next: () => {
              this.closeActionDialog();
              this.loadData(this.currentPage);
              this.showToast(`✅ Booking #${id} confirmed and logged with Drone ${droneName} (${this.selectedDroneId})!`, 'success');
            },
            error: () => this.showToast('Confirmation failed.', 'error')
          });
        },
        error: () => this.showToast('Failed to create log entry.', 'error')
      });

    } else if (this.activeActionType === 'CANCEL') {
      const updated: Booking = { ...this.targetBooking, bookingStatus: 'CANCELLED' };
      this.bookingApi.updateBooking(id, updated).subscribe({
        next: () => {
          this.closeActionDialog();
          this.loadData(this.currentPage);
          this.showToast(`Booking #${id} has been CANCELLED.`, 'success');
        },
        error: () => this.showToast('Cancellation failed.', 'error')
      });
    }
  }

  // --- Dynamic WhatsApp Notification ---
  sendNotification(booking: Booking, event?: Event): void {
    if (event) event.stopPropagation();

    if (!booking.cropOwnerPhone) {
      this.showToast('Farmer mobile number is missing.', 'error');
      return;
    }

    let cleanPhone = booking.cropOwnerPhone.replace(/[^0-9]/g, '');
    if (cleanPhone.length === 10) cleanPhone = '91' + cleanPhone;

    let statusHeader = '';
    let statusNotice = '';

    if (booking.bookingStatus === 'CONFIRMED') {
      statusHeader = '*Sri Jagadeeswara AGRI Drone Spraying - Dispatch Confirmed*';
      statusNotice = 'Our certified drone pilot and autonomous unit are assigned to your field. Please ensure water supply is accessible near the plot.';
    } else if (booking.bookingStatus === 'CANCELLED') {
      statusHeader = '*Sri Jagadeeswara AGRI Drone Spraying - Service Cancelled*';
      statusNotice = 'This scheduled spraying mission has been cancelled. For re-scheduling or inquiries, please contact.';
    } else {
      statusHeader = '*Sri Jagadeeswara AGRI Drone Spraying - Booking Received*';
      statusNotice = 'Your request has been received and is pending pilot dispatch verification.';
    }

    const messageLines = [
      statusHeader,
      '━━━━━━━━━━━━━━━━━━━━',
      `Dear *${booking.cropOwnerName}*, details of your drone mission:`,
      '',
      `*Date:* ${booking.bookingDate} (${booking.bookingDay})`,
      `*Crop:* ${booking.cropName}`,
      `*Field Area:* ${booking.cropSize} Acres (${booking.cropSize} Tanks)`,
      `*Village / Location:* ${booking.cropVillage}`,
      `*Rate per Tank:* ₹${booking.price}`,
      `*Estimated Total:* ₹${booking.amount}`,
      `*Status:* *${booking.bookingStatus}*`,
      booking.bookingNotes ? `📝 *Notes:* ${booking.bookingNotes}\n` : '',
      '━━━━━━━━━━━━━━━━━━━━',
      statusNotice,
      '',
      '*For any queries, contact us at:* +91 9642343838, +91 9032343838',
      '' ,
      '_*Sri Jagadeeswara AGRI Drone Spraying!*_'
    ].filter(line => line !== null && line !== undefined);

    const encodedMessage = encodeURIComponent(messageLines.join('\n'));
    const whatsappUrl = `https://web.whatsapp.com/send?phone=${cleanPhone}&text=${encodedMessage}`;

    // Target a named window to redirect/reuse an existing WhatsApp Web tab
    window.open(whatsappUrl, 'whatsapp_window');
    this.showToast(`Redirecting WhatsApp chat for ${booking.cropOwnerName}...`, 'success');
  }

  showToast(message: string, type: 'success' | 'error' = 'success'): void {
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toast = { show: true, message, type };
    this.toastTimer = setTimeout(() => (this.toast.show = false), 4000);
  }

  getPageNumbers(): number[] {
    return Array.from({ length: this.totalPages }, (_, i) => i);
  }
}