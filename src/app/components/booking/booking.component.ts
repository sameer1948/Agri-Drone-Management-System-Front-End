import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, FormsModule, Validators } from '@angular/forms';
import { Rate } from '../../models/rate.model';
import { RateService } from '../../services/rate.service';
import { Booking } from '../../models/booking.model';
import { PageResponse } from '../../models/drone.model';
import { BookingService } from '../../services/booking.service';
import { Crop } from '../../models/crop.model';
import { Village } from '../../models/village.model';
import { CropService } from '../../services/crop.service';
import { VillageService } from '../../services/village.service';
import { MaxCapacityService } from '../../services/max-capacity.service';

interface ToastState {
  show: boolean;
  message: string;
  type: 'success' | 'error';
}

interface CalendarDay {
  date: Date;
  dateStr: string; // YYYY-MM-DD
  dayNumber: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  bookings: Booking[];
  totalAcres: number;
  isFull: boolean;
}

@Component({
  selector: 'app-booking',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  templateUrl: './booking.component.html',
  styleUrls: ['./booking.component.scss']
})
export class BookingComponent implements OnInit {

  private fb = inject(FormBuilder);
  private bookingApi = inject(BookingService);
  private rateApi = inject(RateService);
  private villageApi = inject(VillageService);
  private cropApi = inject(CropService);
  private capacityApi = inject(MaxCapacityService);

  // Maximum acreage a drone can spray in a single day
  maxDailyAcres: number = 30;

  // View Toggle ('TABLE' | 'CALENDAR')
  activeView: 'TABLE' | 'CALENDAR' = 'CALENDAR';

  bookings: Booking[] = [];
  allBookingsForCalendar: Booking[] = [];
  currentRate: Rate = { price: 250, isActive: true, effectiveFrom: '' };
  isLoading: boolean = false;

  // Master Data Dropdown Lists
  crops: Crop[] = [];
  villages: Village[] = [];

  // Filter & Search Controls
  searchTerm: string = '';
  statusFilter: 'ALL' | 'PENDING' | 'CONFIRMED' | 'CANCELLED' = 'ALL';

  // Sorting Controls
  sortBy: keyof Booking = 'bookingDate';
  sortDir: 'asc' | 'desc' = 'desc';

  // Modal Dialog Controls
  isModalOpen: boolean = false;
  bookingForm!: FormGroup;

  // Day Bookings Details Dialog (from Calendar click)
  isDayDetailsOpen: boolean = false;
  selectedCalendarDay: CalendarDay | null = null;

  // Calendar State
  currentCalendarDate: Date = new Date();
  calendarDays: CalendarDay[] = [];
  weekDays: string[] = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // Daily capacity error state for form
  isDateLimitExceeded: boolean = false;
  capacityErrorMessage: string = '';

  // Toast State
  toast: ToastState = { show: false, message: '', type: 'success' };
  private toastTimer: any = null;

  // Pagination State
  currentPage: number = 0;
  pageSize: number = 10;
  totalElements: number = 0;
  totalPages: number = 0;
  isFirstPage: boolean = true;
  isLastPage: boolean = false;
  pageSizeOptions: number[] = [5, 10, 20, 50];

  todayDate: string = '';
  calculatedAmount: number = 0;

  ngOnInit(): void {
    this.loadCapacity();
    this.todayDate = new Date().toISOString().split('T')[0];
    this.loadRate();
    this.loadMasterData();
    this.initForm();
    this.loadBookings();
    this.loadCalendarDataset();
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
      next: (data) => (this.crops = data || []),
      error: (err) => this.showToast(`Failed to load crops:${err}`, 'error')
    });

    this.villageApi.getVillages().subscribe({
      next: (data) => (this.villages = data || []),
      error: (err) => this.showToast(`Failed to load villages: ${err}`, 'error')
    });
  }

  loadRate(): void {
    this.rateApi.getCurrentRate().subscribe({
      next: (res) => {
        if (res && res.price) {
          this.currentRate = res;
          this.recalculatePrice();
        }
      },
      error: () => this.showToast('Failed to fetch rate. Defaulting to ₹250/tank.', 'error')
    });
  }

  private initForm(): void {
    this.bookingForm = this.fb.group({
      bookingDate: [this.todayDate, Validators.required],
      bookingDay: [''],
      cropName: ['', Validators.required],
      cropOwnerName: ['', [Validators.required, Validators.minLength(3)]],
      cropVillage: ['', Validators.required],
      cropOwnerPhone: ['', [Validators.required, Validators.pattern('^[6-9][0-9]{9}$')]],
      cropSize: [null, [Validators.required, Validators.min(1), Validators.max(30), Validators.pattern('^[1-9][0-9]*$')]],
      bookingNotes: [''],
      bookingStatus: ['PENDING']
    });

    this.bookingForm.get('bookingDate')?.valueChanges.subscribe((dateStr) => {
      if (dateStr) {
        const d = new Date(dateStr + 'T00:00:00');
        const dayName = d.toLocaleDateString('en-US', { weekday: 'long' });
        this.bookingForm.get('bookingDay')?.setValue(dayName, { emitEvent: false });
        this.checkDateCapacity();
      }
    });

    this.bookingForm.get('cropSize')?.valueChanges.subscribe(() => {
      this.recalculatePrice();
      this.checkDateCapacity();
    });
  }

  recalculatePrice(): void {
    const acres = parseInt(this.bookingForm.get('cropSize')?.value, 10) || 0;
    this.calculatedAmount = acres * (this.currentRate.price || 250);
  }

  /**
   * Validates if the selected date already reached or would exceed 30 Acres
   */
  checkDateCapacity(): void {
    const selectedDate = this.bookingForm.get('bookingDate')?.value;
    const requestedAcres = parseInt(this.bookingForm.get('cropSize')?.value, 10) || 0;

    if (!selectedDate) {
      this.isDateLimitExceeded = false;
      this.capacityErrorMessage = '';
      return;
    }

    const currentDayAcres = this.allBookingsForCalendar
      .filter(b => b.bookingDate === selectedDate && b.bookingStatus !== 'CANCELLED')
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

  loadBookings(page: number = this.currentPage): void {
    this.isLoading = true;
    this.currentPage = page;

    this.bookingApi.getBookings(this.currentPage, this.pageSize, this.sortBy as string, this.sortDir).subscribe({
      next: (res: PageResponse<Booking>) => {
        let items = res.content || [];

        if (this.searchTerm.trim()) {
          const q = this.searchTerm.toLowerCase().trim();
          items = items.filter(b =>
            (b.cropOwnerName && b.cropOwnerName.toLowerCase().includes(q)) ||
            (b.cropOwnerPhone && b.cropOwnerPhone.includes(q)) ||
            (b.cropVillage && b.cropVillage.toLowerCase().includes(q)) ||
            (b.cropName && b.cropName.toLowerCase().includes(q))
          );
        }

        if (this.statusFilter !== 'ALL') {
          items = items.filter(b => b.bookingStatus === this.statusFilter);
        }

        this.bookings = items;
        this.totalElements = res.totalElements;
        this.totalPages = res.totalPages;
        this.isFirstPage = res.first;
        this.isLastPage = res.last;
        this.isLoading = false;
      },
      error: (err) => {
        console.error('Failed to load bookings:', err);
        this.isLoading = false;
        this.showToast('Failed to load bookings from server.', 'error');
      }
    });
  }

  /**
   * Pulls unpaginated records for the calendar
   */
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

    // 1. Previous month buffer days
    for (let x = firstDayIndex; x > 0; x--) {
      const d = new Date(year, month - 1, prevLastDate - x + 1);
      days.push(this.createCalendarDayObj(d, false));
    }

    // 2. Current month days
    for (let i = 1; i <= lastDate; i++) {
      const d = new Date(year, month, i);
      days.push(this.createCalendarDayObj(d, true));
    }

    // 3. Next month trailing buffer days (to fill 42 cells grid)
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

  // --- Click on Calendar Tile opens Day Details Dialog ---
  openDayDetails(day: CalendarDay): void {
    this.selectedCalendarDay = day;
    this.isDayDetailsOpen = true;
  }

  closeDayDetails(): void {
    this.isDayDetailsOpen = false;
    this.selectedCalendarDay = null;
  }

  // Quick Book button directly from selected date in calendar
  bookForSpecificDate(dateStr: string): void {
    this.closeDayDetails();
    this.openCreateModal();
    this.bookingForm.patchValue({ bookingDate: dateStr });
    this.checkDateCapacity();
  }

  // ================= VIEW TOGGLE =================
  switchView(view: 'TABLE' | 'CALENDAR'): void {
    this.activeView = view;
    if (view === 'CALENDAR') {
      this.loadCalendarDataset();
    } else {
      this.loadBookings(this.currentPage);
    }
  }

  setSort(column: keyof Booking): void {
    if (this.sortBy === column) {
      this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortBy = column;
      this.sortDir = 'desc';
    }
    this.currentPage = 0;
    this.loadBookings(0);
  }

  onFilterChange(): void {
    this.currentPage = 0;
    this.loadBookings(0);
  }

  goToPage(page: number): void {
    if (page >= 0 && page < this.totalPages) {
      this.loadBookings(page);
    }
  }

  onPageSizeChange(newSize: number): void {
    this.pageSize = Number(newSize);
    this.currentPage = 0;
    this.loadBookings(0);
  }

  getPageNumbers(): number[] {
    return Array.from({ length: this.totalPages }, (_, i) => i);
  }

  openCreateModal(): void {
    this.isDateLimitExceeded = false;
    this.capacityErrorMessage = '';
    this.bookingForm.reset({
      bookingDate: this.todayDate,
      bookingDay: new Date().toLocaleDateString('en-US', { weekday: 'long' }),
      cropName: '',
      cropOwnerName: '',
      cropVillage: '',
      cropOwnerPhone: '',
      cropSize: null,
      bookingNotes: '',
      bookingStatus: 'PENDING'
    });
    this.recalculatePrice();
    this.checkDateCapacity();
    this.isModalOpen = true;
  }

  closeModal(): void {
    this.isModalOpen = false;
  }

  saveBooking(): void {
    this.checkDateCapacity();

    if (this.isDateLimitExceeded) {
      this.showToast('Daily drone spraying limit reached for this date. Choose another day.', 'error');
      return;
    }

    if (this.bookingForm.invalid) {
      this.bookingForm.markAllAsTouched();
      this.showToast('Please correct validation errors before submitting.', 'error');
      return;
    }

    const formVals = this.bookingForm.value;
    const bookingPayload: Booking = {
      bookingDate: formVals.bookingDate,
      bookingDay: formVals.bookingDay || new Date(formVals.bookingDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long' }),
      cropName: formVals.cropName,
      cropOwnerName: formVals.cropOwnerName,
      cropOwnerPhone: formVals.cropOwnerPhone,
      cropSize: parseInt(formVals.cropSize, 10),
      cropVillage: formVals.cropVillage,
      price: this.currentRate.price,
      amount: this.calculatedAmount,
      bookingNotes: formVals.bookingNotes || '',
      bookingStatus: 'PENDING'
    };

    this.bookingApi.createBooking(bookingPayload).subscribe({
      next: () => {
        this.closeModal();
        this.loadBookings(0);
        this.loadCalendarDataset();
        this.showToast('🎉 Drone spraying service booked successfully!', 'success');
      },
      error: (err) => {
        console.error('Create failed:', err);
        this.showToast('Failed to create booking. Please try again.', 'error');
      }
    });
  }

  showToast(message: string, type: 'success' | 'error'): void {
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toast = { show: true, message, type };
    this.toastTimer = setTimeout(() => (this.toast.show = false), 4000);
  }

  closeToast(): void {
    this.toast.show = false;
  }
}