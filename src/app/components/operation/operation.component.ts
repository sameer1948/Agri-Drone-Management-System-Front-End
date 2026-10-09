import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, FormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AgriDroneService } from '../../services/agri-drone.service';
import { Booking, BookingStatus, Drone, LogEntry, PageResponse, PaymentStatus, Rate } from '../../models/drone.model';

type ActionType = 'CONFIRM' | 'CANCEL' | 'DELETE' | null;

@Component({
  selector: 'app-operation',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, RouterLink],
  templateUrl: './operation.component.html',
  styleUrls: ['./operation.component.scss']
})
export class OperationComponent implements OnInit {
  
  private api = inject(AgriDroneService);
  private fb = inject(FormBuilder);

  // Simulated Admin Auth State (Default: true for testing)
  isAdminLoggedIn: boolean = true;

  // Data & State
  bookings: Booking[] = [];
  currentRate: Rate = { price: 250 };
  isLoading = false;

  // Metrics
  totalCount = 0;
  pendingCount = 0;
  confirmedCount = 0;
  totalRevenue = 0;

  // Filters & Search
  searchTerm = '';
  selectedStatusFilter = 'ALL';
  selectedCropFilter = 'ALL';

  cropsList = [
    { name: 'Paddy / Rice', factor: 2.0 },
    { name: 'Cotton', factor: 2.5 },
    { name: 'Sugarcane', factor: 3.0 },
    { name: 'Wheat', factor: 1.8 },
    { name: 'Maize / Corn', factor: 2.0 },
    { name: 'Chilli / Spices', factor: 2.5 },
    { name: 'Soybean', factor: 1.8 }
  ];

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
    this.api.getCurrentRate().subscribe(r => { if (r?.price) this.currentRate = r; });
    this.loadData();
  }

  private initEditForm(): void {
    this.editForm = this.fb.group({
      bookingDate: ['', Validators.required],
      bookingDay: [''],
      cropName: ['', Validators.required],
      cropOwnerName: ['', [Validators.required, Validators.minLength(3)]],
      cropOwnerPhone: ['', [Validators.required, Validators.pattern('^[6-9][0-9]{9}$')]],
      cropVillage: ['', Validators.required],
      cropSize: [null, [Validators.required, Validators.min(0.25), Validators.max(200)]],
      bookingStatus: ['PENDING', Validators.required],
      bookingNotes: ['']
    });

    this.editForm.get('bookingDate')?.valueChanges.subscribe((dt) => {
      if (dt) {
        const d = new Date(dt + 'T00:00:00');
        this.editForm.get('bookingDay')?.setValue(d.toLocaleDateString('en-US', { weekday: 'long' }), { emitEvent: false });
      }
    });

    this.editForm.get('cropSize')?.valueChanges.subscribe(() => this.recalcEditAmount());
    this.editForm.get('cropName')?.valueChanges.subscribe(() => this.recalcEditAmount());
  }

  loadDrones(): void {
    this.api.getDrones().subscribe({
      next: (drones) => {
        this.availableDrones = drones;
        if (drones.length > 0) {
          this.selectedDroneId = drones[0].droneId;
        }
      },
      error: (err) => console.error('Failed to load drones', err)
    });
  }

  loadData(page: number = this.currentPage): void {
    if (!this.isAdminLoggedIn) return;

    this.isLoading = true;
    this.currentPage = page;

    this.api.getFilteredBookings({
      status: this.selectedStatusFilter,
      crop: this.selectedCropFilter,
      search: this.searchTerm,
      page: this.currentPage,
      size: this.pageSize,
      sortBy: this.sortBy,
      sortDir: this.sortDir
    }).subscribe({
      next: (res: PageResponse<Booking>) => {
        this.bookings = res.content;
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

  // Sorting
  toggleSort(column: string): void {
    if (this.sortBy === column) {
      this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortBy = column;
      this.sortDir = 'desc';
    }
    this.loadData(0);
  }

  // --- Edit Modal Handlers ---
  openEditModal(booking: Booking): void {
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
    const crop = this.editForm.get('cropName')?.value;
    const size = parseFloat(this.editForm.get('cropSize')?.value) || 0;
    const factor = this.cropsList.find(c => c.name === crop)?.factor || 2.0;
    this.computedAmount = Math.round(size * factor * this.currentRate.price);
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
      cropSize: parseFloat(f.cropSize),
      bookingStatus: f.bookingStatus,
      bookingNotes: f.bookingNotes,
      price: this.currentRate.price,
      amount: this.computedAmount
    };

    this.api.updateBooking(this.editingBooking.bookingId, payload).subscribe({
      next: () => {
        this.closeEditModal();
        this.loadData(this.currentPage);
        this.showToast(`Booking #${payload.bookingId} updated successfully!`, 'success');
      },
      error: () => this.showToast('Failed to update booking.', 'error')
    });
  }

  // --- Confirmation Action Dialog (Confirm, Cancel, Delete) ---
  openActionDialog(type: ActionType, booking: Booking): void {
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
      // 1. Validate drone selection
      if (!this.selectedDroneId) {
        this.showToast('Please select a drone to assign to this mission.', 'error');
        return;
      }

      const assignedDrone = this.availableDrones.find(d => d.droneId === this.selectedDroneId);
      const droneName = assignedDrone ? assignedDrone.droneName : 'Standard Agri Drone';
      console.log(this.targetBooking);

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
        tankUsage: Math.round(this.targetBooking.cropSize * 2.0), // TODO Example calculation
        amount: this.targetBooking.amount,
        activityStatus: 'CONFIRMED' as 'CONFIRMED' | 'COMPLETED' | 'CANCELLED',
        paymentStatus: 'PENDING' as PaymentStatus       
      };

      const updatedBooking : Booking = {
        bookingId: this.targetBooking.bookingId,
        bookingDate: this.targetBooking.bookingDate || new Date().toISOString().split('T')[0],
        bookingDay: this.targetBooking.bookingDay,
        cropName: this.targetBooking.cropName,
        cropOwnerName: this.targetBooking.cropOwnerName,
        cropOwnerPhone: this.targetBooking.cropOwnerPhone,
        cropSize: this.targetBooking.cropSize,
        cropVillage: this.targetBooking.cropVillage,
        price: this.targetBooking.price,
        amount: this.targetBooking.amount,
        bookingNotes: this.targetBooking.bookingNotes,
        bookingStatus: 'CONFIRMED' as BookingStatus
      }
      this.api.createLog(newLogEntry).subscribe({
        next: () => {
          this.api.updateBooking(id, updatedBooking).subscribe({
            next: () => {
              this.closeActionDialog();
              this.loadData(this.currentPage);
              this.showToast(`✅ Booking #${id} confirmed and logged with Drone ${droneName} (${this.selectedDroneId})!`, 'success');
            },
            error: () => this.showToast('Cancellation failed.', 'error')
          });
        },
        error: () => {
          this.showToast('Failed to create log entry.', 'error');
        }
      }
    );

      //2. Call backend confirm-and-log API
      // this.api.confirmAndLogBooking(id, this.selectedDroneId, droneName).subscribe({
      //   next: () => {
      //     this.closeActionDialog();
      //     this.loadData(this.currentPage);
      //     this.showToast(`✅ Booking #${id} confirmed and logged with Drone ${droneName} (${this.selectedDroneId})!`, 'success');
      //   },
      //   error: () => this.showToast('Confirmation & logging failed.', 'error')
      // });

    } else if (this.activeActionType === 'DELETE') {
      this.api.deleteBooking(id).subscribe({
        next: () => {
          this.closeActionDialog();
          this.loadData(this.currentPage);
          this.showToast(`Booking #${id} deleted from database.`, 'success');
        },
        error: () => this.showToast('Delete operation failed.', 'error')
      });

    } else if (this.activeActionType === 'CANCEL') {
      const updated: Booking = { ...this.targetBooking, bookingStatus: 'CANCELLED' };
      this.api.updateBooking(id, updated).subscribe({
        next: () => {
          this.closeActionDialog();
          this.loadData(this.currentPage);
          this.showToast(`Booking #${id} has been CANCELLED.`, 'success');
        },
        error: () => this.showToast('Cancellation failed.', 'error')
      });
    }
  }

  // --- Send Placeholder Action ---
  // sendNotification(booking: Booking): void {
  //   this.showToast(`📤 Dispatch notice queued for ${booking.cropOwnerName} (${booking.cropOwnerPhone}) via SMS/WhatsApp!`, 'success');

  // }

  // Inside AdminBookingsComponent class in admin-bookings.component.ts:

  sendNotification(booking: Booking): void {
    if (!booking.cropOwnerPhone) {
      this.showToast('Farmer mobile number is missing.', 'error');
      return;
    }

    // 1. Sanitize the phone number (remove dashes, spaces, plus signs)
    let cleanPhone = booking.cropOwnerPhone.replace(/[^0-9]/g, '');

    // If a 10-digit Indian number is provided without country code, prefix with '91'
    if (cleanPhone.length === 10) {
      cleanPhone = '91' + cleanPhone;
    }

    // 2. Compose a clean, professional flight mission summary
    const message = 
        `🌾 *AeroKrishi Drone Spraying Mission Details* 🛸
        ━━━━━━━━━━━━━━━━━━━━
        Dear *${booking.cropOwnerName}*, your drone spraying schedule is confirmed:

        📅 *Date:* ${booking.bookingDate} (${booking.bookingDay})
        🌱 *Crop:* ${booking.cropName}
        📐 *Field Area:* ${booking.cropSize} Acres
        📍 *Village / Location:* ${booking.cropVillage}
        💰 *Rate per Tank:* ₹${booking.price}
        💵 *Estimated Total:* ₹${booking.amount}
        📊 *Status:* *${booking.bookingStatus}*
        ${booking.bookingNotes ? `📝 *Notes:* ${booking.bookingNotes}\n` : ''}━━━━━━━━━━━━━━━━━━━━
        Our certified drone pilot will arrive with the spray payload. Please keep field water access available.

        _AeroKrishi Autonomous Fleet Systems_`;

    // 3. URL-encode the formatted message
    const encodedMessage = encodeURIComponent(message);

    // 4. Construct WhatsApp Click-to-Chat URL
    const whatsappUrl = `https://wa.me/${cleanPhone}?text=${encodedMessage}`;

    // 5. Open in a new browser tab
    window.open(whatsappUrl, '_blank', 'noopener,noreferrer');

    this.showToast(`Opening WhatsApp chat for ${booking.cropOwnerName}...`, 'success');
  }

  // Toast
  showToast(message: string, type: 'success' | 'error' = 'success'): void {
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toast = { show: true, message, type };
    this.toastTimer = setTimeout(() => this.toast.show = false, 10000);
  }

  getPageNumbers(): number[] {
    return Array.from({ length: this.totalPages }, (_, i) => i);
  }
}