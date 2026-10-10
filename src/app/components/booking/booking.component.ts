import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  FormsModule,
  Validators
} from '@angular/forms';
import { AgriDroneService } from '../../services/agri-drone.service';
import { Booking, PageResponse, Rate } from '../../models/drone.model';

interface ToastState {
  show: boolean;
  message: string;
  type: 'success' | 'error';
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
  private api = inject(AgriDroneService);

  // --- Auth Placeholder ---
  isLoggedIn: boolean = true;

  bookings: Booking[] = [];
  currentRate: Rate = { price: 250 };
  isLoading: boolean = false;

  // --- Filter & Search Controls ---
  searchTerm: string = '';
  statusFilter: 'ALL' | 'PENDING' | 'CONFIRMED' | 'CANCELLED' = 'ALL';

  // --- Sorting Controls ---
  sortBy: keyof Booking = 'bookingDate';
  sortDir: 'asc' | 'desc' = 'desc';

  // --- Modal Dialog Controls ---
  isModalOpen: boolean = false;
  isEditMode: boolean = false;
  editingBookingId: number | null = null;
  bookingForm!: FormGroup;

  // --- Toast / Snackbar State ---
  toast: ToastState = {
    show: false,
    message: '',
    type: 'success'
  };
  private toastTimer: any = null;

  // --- Pagination State ---
  currentPage: number = 0;       // 0-based for Spring Boot
  pageSize: number = 5;
  totalElements: number = 0;
  totalPages: number = 0;
  isFirstPage: boolean = true;
  isLastPage: boolean = false;
  pageSizeOptions: number[] = [5, 10, 20, 50];

  // Pre-configured Crops
  crops = [
    { name: 'Paddy / Rice', factor: 2.0 },
    { name: 'Cotton', factor: 2.5 },
    { name: 'Sugarcane', factor: 3.0 },
    { name: 'Wheat', factor: 1.8 },
    { name: 'Maize / Corn', factor: 2.0 },
    { name: 'Chilli / Spices', factor: 2.5 },
    { name: 'Soybean', factor: 1.8 }
  ];

  todayDate: string = '';
  calculatedAmount: number = 0;

  ngOnInit(): void {
    this.todayDate = new Date().toISOString().split('T')[0];
    this.loadRate();
    this.initForm();
    this.loadBookings();
  }

  loadRate(): void {
    this.api.getCurrentRate().subscribe({
      next: (res) => {
        if (res && res.price) {
          this.currentRate = res;
          this.recalculatePrice();
        }
      },
      error: () => console.warn('Using default rate ₹250/tank')
    });
  }

  private initForm(): void {
    this.bookingForm = this.fb.group({
      bookingDate: [this.todayDate, Validators.required],
      bookingDay: [''],
      cropName: ['', Validators.required],
      cropOwnerName: ['', [Validators.required, Validators.minLength(3)]],
      cropVillage: ['', [Validators.required, Validators.minLength(2)]],
      cropOwnerPhone: [
        '',
        [Validators.required, Validators.pattern('^[6-9][0-9]{9}$')]
      ],
      cropSize: [
        null,
        [
          Validators.required,
          Validators.min(0.25),
          Validators.max(200),
          Validators.pattern('^[0-9]+(\\.[0-9]{1,2})?$')
        ]
      ],
      bookingNotes: [''],
      bookingStatus: ['PENDING']
    });

    this.bookingForm.get('bookingDate')?.valueChanges.subscribe((dateStr) => {
      if (dateStr) {
        const d = new Date(dateStr + 'T00:00:00');
        const dayName = d.toLocaleDateString('en-US', { weekday: 'long' });
        this.bookingForm.get('bookingDay')?.setValue(dayName, { emitEvent: false });
      }
    });

    this.bookingForm.get('cropName')?.valueChanges.subscribe(() => this.recalculatePrice());
    this.bookingForm.get('cropSize')?.valueChanges.subscribe(() => this.recalculatePrice());
  }

  loadBookings(page: number = this.currentPage): void {
    this.isLoading = true;
    this.currentPage = page;

    // Call service with dynamic sort parameters
    this.api.getBookings(this.currentPage, this.pageSize, this.sortBy as string, this.sortDir).subscribe({
      next: (res: PageResponse<Booking>) => {
        let items = res.content || [];

        // Apply search filter (Farmer name, phone, crop, village)
        if (this.searchTerm.trim()) {
          const q = this.searchTerm.toLowerCase().trim();
          items = items.filter(b =>
            (b.cropOwnerName && b.cropOwnerName.toLowerCase().includes(q)) ||
            (b.cropOwnerPhone && b.cropOwnerPhone.includes(q)) ||
            (b.cropVillage && b.cropVillage.toLowerCase().includes(q)) ||
            (b.cropName && b.cropName.toLowerCase().includes(q))
          );
        }

        // Apply status filter
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

  // --- Sorting Handler ---
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

  // --- Filter Handler ---
  onFilterChange(): void {
    this.currentPage = 0;
    this.loadBookings(0);
  }

  // --- Pagination Controls ---
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

  onAcresBlur(): void {
    const ctrl = this.bookingForm.get('cropSize');
    if (ctrl?.value && !isNaN(ctrl.value)) {
      ctrl.setValue(parseFloat(parseFloat(ctrl.value).toFixed(2)));
    }
  }

  recalculatePrice(): void {
    const selectedCrop = this.bookingForm.get('cropName')?.value;
    const acres = parseFloat(this.bookingForm.get('cropSize')?.value) || 0;
    const cropObj = this.crops.find((c) => c.name === selectedCrop);
    const factor = cropObj ? cropObj.factor : 2.0;

    const tanks = acres * factor;
    this.calculatedAmount = Math.round(tanks * this.currentRate.price);
  }

  // --- Modal Operations ---
  openCreateModal(): void {
    this.isEditMode = false;
    this.editingBookingId = null;
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
    this.isModalOpen = true;
  }

  openEditModal(item: Booking): void {
    if (!this.isLoggedIn) {
      this.showToast('Only logged in administrators can edit bookings.', 'error');
      return;
    }
    this.isEditMode = true;
    this.editingBookingId = item.bookingId || null;

    this.bookingForm.patchValue({
      bookingDate: item.bookingDate,
      bookingDay: item.bookingDay,
      cropName: item.cropName,
      cropOwnerName: item.cropOwnerName,
      cropVillage: item.cropVillage,
      cropOwnerPhone: item.cropOwnerPhone,
      cropSize: item.cropSize,
      bookingNotes: item.bookingNotes || '',
      bookingStatus: item.bookingStatus || 'PENDING'
    });
    this.recalculatePrice();
    this.isModalOpen = true;
  }

  closeModal(): void {
    this.isModalOpen = false;
  }

  // --- Save / Submit ---
  saveBooking(): void {
    if (this.bookingForm.invalid) {
      this.bookingForm.markAllAsTouched();
      this.showToast('Please correct all validation errors before submitting.', 'error');
      return;
    }

    const formVals = this.bookingForm.value;
    const bookingPayload: Booking = {
      bookingDate: formVals.bookingDate,
      bookingDay: formVals.bookingDay || new Date(formVals.bookingDate).toLocaleDateString('en-US', { weekday: 'long' }),
      cropName: formVals.cropName,
      cropOwnerName: formVals.cropOwnerName,
      cropOwnerPhone: formVals.cropOwnerPhone,
      cropSize: parseFloat(formVals.cropSize),
      cropVillage: formVals.cropVillage,
      price: this.currentRate.price,
      amount: this.calculatedAmount,
      bookingNotes: formVals.bookingNotes || '',
      bookingStatus: formVals.bookingStatus || 'PENDING'
    };

    if (this.isEditMode && this.editingBookingId) {
      this.api.updateBooking(this.editingBookingId, bookingPayload).subscribe({
        next: () => {
          this.closeModal();
          this.loadBookings(this.currentPage);
          this.showToast('Booking updated successfully!', 'success');
        },
        error: (err) => {
          console.error('Update failed:', err);
          this.showToast('Failed to update booking. Please try again.', 'error');
        }
      });
    } else {
      this.api.createBooking(bookingPayload).subscribe({
        next: () => {
          this.closeModal();
          this.loadBookings(0); // reload first page to include newly booked item
          this.showToast('🎉 New drone spraying service booked successfully!', 'success');
        },
        error: (err) => {
          console.error('Create failed:', err);
          this.showToast('Failed to create booking. Please try again.', 'error');
        }
      });
    }
  }

  deleteBooking(bookingId?: number): void {
    if (!this.isLoggedIn) {
      this.showToast('Only logged in administrators can delete bookings.', 'error');
      return;
    }

    if (!bookingId) return;
    if (!confirm(`Are you sure you want to delete Booking #${bookingId}?`)) return;

    this.api.deleteBooking(bookingId).subscribe({
      next: () => {
        this.showToast(`Booking #${bookingId} deleted successfully.`, 'success');
        // Handle page step-down if deleting the last element on page
        const targetPage = (this.bookings.length === 1 && this.currentPage > 0)
          ? this.currentPage - 1
          : this.currentPage;
        this.loadBookings(targetPage);
      },
      error: (err) => {
        console.error('Delete failed:', err);
        this.showToast('Failed to delete booking from database.', 'error');
      }
    });
  }

  showToast(message: string, type: 'success' | 'error'): void {
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toast = { show: true, message, type };
    this.toastTimer = setTimeout(() => {
      this.toast.show = false;
    }, 4000);
  }

  closeToast(): void {
    this.toast.show = false;
  }

  toggleLogin(): void {
    this.isLoggedIn = !this.isLoggedIn;
    this.showToast(`Login status changed: ${this.isLoggedIn ? 'Logged In (Admin)' : 'Logged Out (Viewer)'}`, 'success');
  }
}