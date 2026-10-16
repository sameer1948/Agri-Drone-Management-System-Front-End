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
import { MaxCapacityService } from '../../services/max-capacity.service';

type ActionType = 'CONFIRM' | 'CANCEL' | 'DELETE' | null;

interface CalendarDay {
  date: Date;
  dateStr: string;
  dayNumber: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  bookings: Booking[];
  totalAcres: number;
  isFull: boolean;
}

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
  private capacityApi = inject(MaxCapacityService);
  private fb = inject(FormBuilder);

  // Maximum single-day fleet spraying capacity
  maxDailyAcres: number = 30;

  // Primary UI is Calendar
  activeView: 'CALENDAR' | 'TABLE' = 'CALENDAR';

  // Data & State
  bookings: Booking[] = [];
  allBookingsForCalendar: Booking[] = [];
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

  // Pagination & Sorting (Table View)
  currentPage = 0;
  pageSize = 10;
  pageSizeOptions = [5, 10, 20, 50];
  totalPages = 0;
  totalElements = 0;
  sortBy = 'bookingId';
  sortDir: 'asc' | 'desc' = 'desc';

  availableDrones: Drone[] = [];
  selectedDroneId: string = '';

  // Calendar State
  currentCalendarDate: Date = new Date();
  calendarDays: CalendarDay[] = [];
  weekDays: string[] = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  todayDate: string = '';

  // --- Two-Tier Dialog State ---
  // Tier 1: Day Missions Dialog (Child of Calendar)
  isDayMissionsDialogOpen = false;
  selectedCalendarDay: CalendarDay | null = null;

  // Tier 2: Mission Details & Actions Dialog (Child of Day Missions Dialog)
  isDetailsModalOpen = false;
  selectedBookingDetails: Booking | null = null;

  // Edit Modal State
  isEditModalOpen = false;
  editForm!: FormGroup;
  editingBooking: Booking | null = null;
  computedAmount = 0;
  isDateLimitExceeded = false;
  capacityErrorMessage = '';

  // Action Confirmation Dialog (Confirm / Cancel)
  isConfirmActionDialogOpen = false;
  activeActionType: ActionType = null;
  targetBooking: Booking | null = null;
  isActionAnimating = false;

  // Toast / Snackbar
  toast = { show: false, message: '', type: 'success' };
  private toastTimer: any;

  ngOnInit(): void {
    this.loadCapacity();
    this.todayDate = new Date().toISOString().split('T')[0];
    this.initEditForm();
    this.loadDrones();
    this.loadMasterData();
    this.rateApi.getCurrentRate().subscribe(r => { if (r?.price) this.currentRate = r; });
    this.loadCalendarDataset();
    this.loadData();
  }

  loadCapacity(): void {
    this.capacityApi.getMaxCapacity().subscribe({
      next: (cap) => {
        if (cap?.maxAcres) {
          this.maxDailyAcres = cap.maxAcres;
          // Re-evaluate calendar or form capacity checks
          if (this.buildCalendarMonth) this.buildCalendarMonth();
        }
      },
      error: () => this.showToast('Could not fetch capacity limit. Using default 30.', 'error') 
    });
  }

  loadMasterData(): void {
    this.cropApi.getCrops().subscribe({
      next: (data) => (this.cropsList = data || []),
      error: (err) => this.showToast(`Failed to load crops: ${err}`, 'error')
    });

    this.villageApi.getVillages().subscribe({
      next: (data) => (this.villagesList = data || []),
      error: (err) => this.showToast(`Failed to load villages: ${err}`, 'error')
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
      cropSize: [null, [Validators.required, Validators.min(1), Validators.max(30), Validators.pattern('^[1-9][0-9]*$')]],
      bookingStatus: ['PENDING', Validators.required],
      bookingNotes: ['']
    });

    this.editForm.get('bookingDate')?.valueChanges.subscribe((dt) => {
      if (dt) {
        const d = new Date(dt + 'T00:00:00');
        this.editForm.get('bookingDay')?.setValue(d.toLocaleDateString('en-US', { weekday: 'long' }), { emitEvent: false });
        this.checkEditDateCapacity();
      }
    });

    this.editForm.get('cropSize')?.valueChanges.subscribe(() => {
      this.recalcEditAmount();
      this.checkEditDateCapacity();
    });
  }

  checkEditDateCapacity(): void {
    const selectedDate = this.editForm.get('bookingDate')?.value;
    const requestedAcres = parseInt(this.editForm.get('cropSize')?.value, 10) || 0;
    const currentBookingId = this.editingBooking?.bookingId;

    if (!selectedDate) {
      this.isDateLimitExceeded = false;
      this.capacityErrorMessage = '';
      return;
    }

    const currentDayAcres = this.allBookingsForCalendar
      .filter(b => b.bookingDate === selectedDate && b.bookingStatus !== 'CANCELLED' && b.bookingId !== currentBookingId)
      .reduce((sum, b) => sum + (Number(b.cropSize) || 0), 0);

    if (currentDayAcres >= this.maxDailyAcres) {
      this.isDateLimitExceeded = true;
      this.capacityErrorMessage = `⚠️ Bookings are full for ${selectedDate} (${currentDayAcres}/${this.maxDailyAcres} Acres booked). Please try another day.`;
    } else if (currentDayAcres + requestedAcres > this.maxDailyAcres) {
      const remaining = this.maxDailyAcres - currentDayAcres;
      this.isDateLimitExceeded = true;
      this.capacityErrorMessage = `⚠️ Daily limit exceeded! Only ${remaining} acre(s) left on ${selectedDate} (Limit: ${this.maxDailyAcres} Ac/day).`;
    } else {
      this.isDateLimitExceeded = false;
      this.capacityErrorMessage = '';
    }
  }

  loadDrones(): void {
    this.droneApi.getDrones().subscribe({
      next: (drones) => {
        this.availableDrones = (drones || []).filter(d => d.droneStatus === 'ACTIVE');
        if (this.availableDrones.length > 0) {
          this.selectedDroneId = this.availableDrones[0].droneId;
        }
      },
      error: (err) => this.showToast(`Failed to load drones : ${err}`, 'error')
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

  loadCalendarDataset(): void {
    this.bookingApi.getBookings(0, 1000, 'bookingDate', 'asc').subscribe({
      next: (res: PageResponse<Booking>) => {
        this.allBookingsForCalendar = res.content || [];
        this.buildCalendarMonth();
      },
      error: () => this.showToast('Could not load calendar entries', 'error')
    });
  }

  // ================= CALENDAR BUILDER =================
  buildCalendarMonth(): void {
    const year = this.currentCalendarDate.getFullYear();
    const month = this.currentCalendarDate.getMonth();

    const firstDayIndex = new Date(year, month, 1).getDay();
    const lastDate = new Date(year, month + 1, 0).getDate();
    const prevLastDate = new Date(year, month, 0).getDate();

    const days: CalendarDay[] = [];

    for (let x = firstDayIndex; x > 0; x--) {
      const d = new Date(year, month - 1, prevLastDate - x + 1);
      days.push(this.createCalendarDayObj(d, false));
    }

    for (let i = 1; i <= lastDate; i++) {
      const d = new Date(year, month, i);
      days.push(this.createCalendarDayObj(d, true));
    }

    const remaining = 42 - days.length;
    for (let j = 1; j <= remaining; j++) {
      const d = new Date(year, month + 1, j);
      days.push(this.createCalendarDayObj(d, false));
    }

    this.calendarDays = days;
  }

  private createCalendarDayObj(d: Date, isCurrentMonth: boolean): CalendarDay {
    const y = d.getFullYear();
    const m = ('0' + (d.getMonth() + 1)).slice(-2);
    const day = ('0' + d.getDate()).slice(-2);
    const dateStr = `${y}-${m}-${day}`;

    const activeBookings = this.allBookingsForCalendar.filter(
      b => b.bookingDate === dateStr && b.bookingStatus !== 'CANCELLED'
    );
    const totalAcres = activeBookings.reduce((sum, b) => sum + (Number(b.cropSize) || 0), 0);

    return {
      date: d,
      dateStr,
      dayNumber: d.getDate(),
      isCurrentMonth,
      isToday: dateStr === this.todayDate,
      bookings: activeBookings,
      totalAcres,
      isFull: totalAcres >= this.maxDailyAcres
    };
  }

  prevMonth(): void {
    this.currentCalendarDate = new Date(this.currentCalendarDate.getFullYear(), this.currentCalendarDate.getMonth() - 1, 1);
    this.buildCalendarMonth();
  }

  nextMonth(): void {
    this.currentCalendarDate = new Date(this.currentCalendarDate.getFullYear(), this.currentCalendarDate.getMonth() + 1, 1);
    this.buildCalendarMonth();
  }

  jumpToToday(): void {
    this.currentCalendarDate = new Date();
    this.buildCalendarMonth();
  }

  switchView(view: 'CALENDAR' | 'TABLE'): void {
    this.activeView = view;
    if (view === 'CALENDAR') {
      this.loadCalendarDataset();
    } else {
      this.loadData(this.currentPage);
    }
  }

  // --- Tier 1: Day Missions Dialog (Child of Calendar) ---
  openDayMissionsDialog(day: CalendarDay): void {
    this.selectedCalendarDay = day;
    this.isDayMissionsDialogOpen = true;
  }

  // --- Tier 2: Mission Details & Actions Dialog (Child of Day Missions Dialog) ---
  openRowDetails(booking: Booking, event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    this.selectedBookingDetails = booking;
    this.isDetailsModalOpen = true; // Opens Tier 2 on top of Tier 1 cleanly
  }

  closeRowDetails(): void {
    this.selectedBookingDetails = null;
    this.isDetailsModalOpen = false; // Gracefully returns user to the open Tier 1 day list
  }

  closeDayMissionsDialog(): void {
    this.isDetailsModalOpen = false;
    this.selectedBookingDetails = null;
    this.isDayMissionsDialogOpen = false;
    this.selectedCalendarDay = null;
  }

  confirmFromDetails(): void {
    if (!this.selectedBookingDetails) return;
    const b = this.selectedBookingDetails;
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
    this.checkEditDateCapacity();
    this.isEditModalOpen = true;
  }

  closeEditModal(): void {
    this.isEditModalOpen = false;
    this.editingBooking = null;
    this.isDateLimitExceeded = false;
    this.capacityErrorMessage = '';
  }

  recalcEditAmount(): void {
    const size = parseInt(this.editForm.get('cropSize')?.value, 10) || 0;
    this.computedAmount = size * (this.currentRate.price || 250);
  }

  submitEditForm(): void {
    this.checkEditDateCapacity();
    if (this.isDateLimitExceeded) {
      this.showToast('Daily drone limit reached for this date. Choose another date.', 'error');
      return;
    }

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
        this.closeRowDetails();
        this.loadData(this.currentPage);
        this.loadCalendarDataset();
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
    this.isActionAnimating = false;
  }

  executeAction(): void {
    if (!this.targetBooking?.bookingId || !this.activeActionType) return;
    const id = this.targetBooking.bookingId;
    this.isActionAnimating = true;

    if (this.activeActionType === 'CONFIRM') {
      if (!this.selectedDroneId) {
        this.showToast('Please select a drone to assign to this mission.', 'error');
        this.isActionAnimating = false;
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
              setTimeout(() => {
                this.closeActionDialog();
                this.closeRowDetails();
                this.closeDayMissionsDialog();
                this.loadData(this.currentPage);
                this.loadCalendarDataset();
                this.showToast(`✅ Booking #${id} confirmed and logged with Drone ${droneName} (${this.selectedDroneId})!`, 'success');
              }, 300);
            },
            error: () => {
              this.isActionAnimating = false;
              this.showToast('Confirmation failed.', 'error');
            }
          });
        },
        error: () => {
          this.isActionAnimating = false;
          this.showToast('Failed to create log entry.', 'error');
        }
      });

    } else if (this.activeActionType === 'CANCEL') {
      const updated: Booking = { ...this.targetBooking, bookingStatus: 'CANCELLED' };
      this.bookingApi.updateBooking(id, updated).subscribe({
        next: () => {
          setTimeout(() => {
            this.closeActionDialog();
            this.closeRowDetails();
            this.closeDayMissionsDialog();
            this.loadData(this.currentPage);
            this.loadCalendarDataset();
            this.showToast(`Booking #${id} has been CANCELLED.`, 'success');
          }, 300);
        },
        error: () => {
          this.isActionAnimating = false;
          this.showToast('Cancellation failed.', 'error');
        }
      });
    }
  }

  // WhatsApp Notification
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
      statusHeader = '*Sri Jagadeeswara AGRI Drone Spraying - Dispatch Confirmed* 🛸';
      statusNotice = 'Our certified drone pilot and autonomous unit are assigned to your field. Please ensure water supply is accessible near the plot.';
    } else if (booking.bookingStatus === 'CANCELLED') {
      statusHeader = '*Sri Jagadeeswara AGRI Drone Spraying - Service Cancelled* 🛑';
      statusNotice = 'This scheduled spraying mission has been cancelled. For re-scheduling or inquiries, please contact our support desk.';
    } else {
      statusHeader = '*Sri Jagadeeswara AGRI Drone Spraying - Booking Received* ⏳';
      statusNotice = 'Your request has been received and is pending pilot dispatch verification.';
    }

    let formattedDate = booking.bookingDate;
    if (booking.bookingDate && booking.bookingDate.includes('-')) {
      const parts = booking.bookingDate.split('-');
      if (parts.length === 3 && parts[0].length === 4) {
        formattedDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
      }
    }

    const messageLines = [
      statusHeader,
      '━━━━━━━━━━━━━━━━━━━━',
      `Dear *${booking.cropOwnerName}*, details of your drone mission:`,
      '',
      `📅 *Date:* ${formattedDate} (${booking.bookingDay})`,
      `🌱 *Crop:* ${booking.cropName}`,
      `📐 *Field Area:* ${booking.cropSize} Acres (${booking.cropSize} Tanks)`,
      `📍 *Village / Location:* ${booking.cropVillage}`,
      `💰 *Rate per Tank:* ₹${booking.price}`,
      `💵 *Estimated Total:* ₹${booking.amount}`,
      `📊 *Status:* *${booking.bookingStatus}*`,
      booking.bookingNotes ? `📝 *Notes:* ${booking.bookingNotes}\n` : '',
      '━━━━━━━━━━━━━━━━━━━━',
      statusNotice,
      '',
      '*For any queries, contact us at:* +91 9642343838, +91 9032343838',
      '',
      '_*Sri Jagadeeswara AGRI Drone Spraying!*_'
    ].filter(line => line !== null && line !== undefined);

    const encodedMessage = encodeURIComponent(messageLines.join('\n'));
    const whatsappUrl = `https://wa.me/send?phone=${cleanPhone}&text=${encodedMessage}`;

    window.open(whatsappUrl, 'whatsapp_window');
    this.showToast(`Opening WhatsApp chat for ${booking.cropOwnerName}...`, 'success');
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

  showToast(message: string, type: 'success' | 'error' = 'success'): void {
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toast = { show: true, message, type };
    this.toastTimer = setTimeout(() => (this.toast.show = false), 4000);
  }

  getPageNumbers(): number[] {
    return Array.from({ length: this.totalPages }, (_, i) => i);
  }
}