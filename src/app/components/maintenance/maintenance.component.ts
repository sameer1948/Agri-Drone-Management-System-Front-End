import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, FormsModule, Validators } from '@angular/forms';
import { Repair } from '../../models/repair.model';
import { RepairService } from '../../services/repair.service';
type DialogMode = 'VIEW' | 'CREATE' | 'EDIT' | null;

@Component({
  selector: 'app-maintenance',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  templateUrl: './maintenance.component.html',
  styleUrls: ['./maintenance.component.scss']
})
export class MaintenanceComponent implements OnInit {
  
  private repairApi = inject(RepairService);
  private fb = inject(FormBuilder);

  repairs: Repair[] = [];
  filteredRepairs: Repair[] = [];
  pagedRepairs: Repair[] = [];
  isLoading = false;

  // KPI Metrics
  totalRepairsCount = 0;
  totalRepairExpenses = 0;
  avgRepairCost = 0;

  // Filters & Sorting
  searchTerm = '';
  sortBy: keyof Repair = 'repairDate';
  sortDir: 'asc' | 'desc' = 'desc';

  // Pagination
  currentPage = 0;
  pageSize = 10;
  pageSizeOptions = [5, 10, 20, 50];
  totalPages = 0;

  // Modals state
  activeDialogMode: DialogMode = null;
  selectedRepair: Repair | null = null;
  repairForm!: FormGroup;

  // Toast / Notifications
  toast = { show: false, message: '', type: 'success' };
  private toastTimer: any;

  ngOnInit(): void {
    this.initForm();
    this.fetchRepairs();
  }

  private initForm(): void {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const timeStr = [
      String(now.getHours()).padStart(2, '0'),
      String(now.getMinutes()).padStart(2, '0'),
      String(now.getSeconds()).padStart(2, '0')
    ].join(':');

    this.repairForm = this.fb.group({
      repairId: [null],
      repairNote: ['', [Validators.required, Validators.minLength(5)]],
      amount: [0, [Validators.required, Validators.min(0)]],
      repairDate: [today, Validators.required],
      repairTime: [timeStr, Validators.required],
      location: ['', [Validators.required, Validators.minLength(2)]],
      bookingId: [null]
    });
  }

  fetchRepairs(): void {
    this.isLoading = true;
    this.repairApi.getRepairs().subscribe({
      next: (data) => {
        this.repairs = data || [];
        this.computeKpis();
        this.applyFiltersAndSort();
        this.isLoading = false;
      },
      error: (err) => {
        console.error('Failed to load maintenance repairs:', err);
        this.isLoading = false;
        this.showToast('Failed to load repairs registry.', 'error');
      }
    });
  }

  private computeKpis(): void {
    this.totalRepairsCount = this.repairs.length;
    this.totalRepairExpenses = this.repairs.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
    this.avgRepairCost = this.totalRepairsCount > 0 
      ? Math.round(this.totalRepairExpenses / this.totalRepairsCount) 
      : 0;
  }

  // --- Filtering & Sorting ---
  applyFiltersAndSort(): void {
    let result = [...this.repairs];

    if (this.searchTerm.trim()) {
      const q = this.searchTerm.toLowerCase().trim();
      result = result.filter(r =>
        (r.repairNote && r.repairNote.toLowerCase().includes(q)) ||
        (r.location && r.location.toLowerCase().includes(q)) ||
        (r.bookingId && String(r.bookingId).includes(q))
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

    this.filteredRepairs = result;
    this.totalPages = Math.ceil(this.filteredRepairs.length / this.pageSize) || 1;
    if (this.currentPage >= this.totalPages) {
      this.currentPage = 0;
    }
    this.updatePagedRepairs();
  }

  updatePagedRepairs(): void {
    const start = this.currentPage * this.pageSize;
    const end = start + this.pageSize;
    this.pagedRepairs = this.filteredRepairs.slice(start, end);
  }

  setSort(column: keyof Repair): void {
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
      this.updatePagedRepairs();
    }
  }

  onPageSizeChange(newSize: number): void {
    this.pageSize = Number(newSize);
    this.currentPage = 0;
    this.applyFiltersAndSort();
  }

  getPageNumbers(): number[] {
    return Array.from({ length: this.totalPages }, (_, i) => i);
  }

  // --- Modal Operations ---
  openViewDetails(repair: Repair): void {
    this.selectedRepair = repair;
    this.activeDialogMode = 'VIEW';
  }

  openCreateModal(): void {
    const now = new Date();
    this.repairForm.reset({
      repairId: null,
      repairNote: '',
      amount: 0,
      repairDate: now.toISOString().split('T')[0],
      repairTime: [
        String(now.getHours()).padStart(2, '0'),
        String(now.getMinutes()).padStart(2, '0'),
        String(now.getSeconds()).padStart(2, '0')
      ].join(':'),
      location: '',
      bookingId: null
    });
    this.activeDialogMode = 'CREATE';
  }

  openEditModal(repair: Repair, event?: Event): void {
    if (event) event.stopPropagation();
    this.selectedRepair = repair;
    this.repairForm.patchValue({
      repairId: repair.repairId,
      repairNote: repair.repairNote,
      amount: repair.amount,
      repairDate: repair.repairDate,
      repairTime: repair.repairTime,
      location: repair.location,
      bookingId: repair.bookingId || null
    });
    this.activeDialogMode = 'EDIT';
  }

  closeModal(): void {
    this.activeDialogMode = null;
    this.selectedRepair = null;
  }

  // --- Save / Submit ---
  saveRepair(): void {
    if (this.repairForm.invalid) {
      this.repairForm.markAllAsTouched();
      this.showToast('Please fix validation errors before saving.', 'error');
      return;
    }

    const payload: Repair = {
      ...this.repairForm.value,
      amount: Number(this.repairForm.value.amount),
      bookingId: this.repairForm.value.bookingId ? Number(this.repairForm.value.bookingId) : undefined
    };

    if (this.activeDialogMode === 'EDIT' && payload.repairId) {
      this.repairApi.updateRepair(payload.repairId, payload).subscribe({
        next: () => {
          this.closeModal();
          this.fetchRepairs();
          this.showToast(`Repair #${payload.repairId} updated successfully!`, 'success');
        },
        error: (err) => {
          console.error('Update failed:', err);
          this.showToast('Failed to update repair entry.', 'error');
        }
      });
    } else {
      this.repairApi.createRepair(payload).subscribe({
        next: () => {
          this.closeModal();
          this.fetchRepairs();
          this.showToast('New maintenance repair recorded successfully!', 'success');
        },
        error: (err) => {
          console.error('Creation failed:', err);
          this.showToast('Failed to create repair entry.', 'error');
        }
      });
    }
  }

  deleteRepair(repairId?: number, event?: Event): void {
    if (event) event.stopPropagation();
    if (!repairId) return;

    if (!confirm(`Are you sure you want to delete Repair entry #${repairId}?`)) return;

    this.repairApi.deleteRepair(repairId).subscribe({
      next: () => {
        this.fetchRepairs();
        this.showToast(`Repair #${repairId} deleted.`, 'success');
      },
      error: (err) => {
        console.error('Delete failed:', err);
        this.showToast('Failed to delete repair entry.', 'error');
      }
    });
  }

  showToast(message: string, type: 'success' | 'error' = 'success'): void {
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toast = { show: true, message, type };
    this.toastTimer = setTimeout(() => (this.toast.show = false), 4000);
  }
  
}