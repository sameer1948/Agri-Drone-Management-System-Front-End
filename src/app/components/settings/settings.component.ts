import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, FormsModule, Validators } from '@angular/forms';
import { DroneService } from '../../services/drone.service';
import { RateService } from '../../services/rate.service';
import { Drone } from '../../models/drone.model';
import { Crop } from '../../models/crop.model';
import { Rate } from '../../models/rate.model';
import { Village } from '../../models/village.model';
import { CropService } from '../../services/crop.service';
import { VillageService } from '../../services/village.service';
import { MaxCapacityService } from '../../services/max-capacity.service';
import { MaxCapacity } from '../../models/max-capacity.model';

type ActiveTab = 'RATES' | 'CAPACITY' | 'DRONES' | 'VILLAGES' | 'CROPS';
type ModalMode = 
  | 'CREATE_DRONE' | 'EDIT_DRONE' 
  | 'UPDATE_RATE' 
  | 'UPDATE_CAPACITY'
  | 'CREATE_VILLAGE' | 'EDIT_VILLAGE' 
  | 'CREATE_CROP' | 'EDIT_CROP' 
  | null;

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss'
})
export class SettingsComponent implements OnInit {

  private droneApi = inject(DroneService);
  private rateApi = inject(RateService);
  private villageApi = inject(VillageService);
  private cropApi = inject(CropService);
  private capacityApi = inject(MaxCapacityService);
  private fb = inject(FormBuilder);

  // Active section view
  currentTab: ActiveTab = 'RATES';

  // --- 1. RATE STATE ---
  currentRate: Rate = { 
    price: 250, 
    isActive: true, 
    effectiveFrom: new Date().toISOString() 
  };
  rateHistory: Rate[] = [];
  filteredRates: Rate[] = [];
  pagedRates: Rate[] = [];
  isLoadingRates = false;
  rateSortDir: 'asc' | 'desc' = 'desc';
  rateCurrentPage = 0;
  ratePageSize = 5;
  ratePageSizeOptions = [5, 10, 20];
  rateTotalPages = 1;

  // --- 2. CAPACITY STATE (NEW) ---
  currentCapacity: MaxCapacity = { id: 1, maxAcres: 30 };
  isLoadingCapacity = false;

  // --- 3. DRONE STATE ---
  drones: Drone[] = [];
  filteredDrones: Drone[] = [];
  pagedDrones: Drone[] = [];
  isLoadingDrones = false;
  droneSearch = '';
  droneStatusFilter: 'ALL' | 'ACTIVE' | 'INACTIVE' = 'ALL';
  droneSortBy: keyof Drone = 'droneId';
  droneSortDir: 'asc' | 'desc' = 'asc';
  droneCurrentPage = 0;
  dronePageSize = 5;
  dronePageSizeOptions = [5, 10, 20];
  droneTotalPages = 1;

  // --- 4. VILLAGE STATE ---
  villages: Village[] = [];
  filteredVillages: Village[] = [];
  pagedVillages: Village[] = [];
  isLoadingVillages = false;
  villageSearch = '';
  villageSortDir: 'asc' | 'desc' = 'asc';
  villageCurrentPage = 0;
  villagePageSize = 5;
  villagePageSizeOptions = [5, 10, 20];
  villageTotalPages = 1;

  // --- 5. CROP STATE ---
  crops: Crop[] = [];
  filteredCrops: Crop[] = [];
  pagedCrops: Crop[] = [];
  isLoadingCrops = false;
  cropSearch = '';
  cropSortDir: 'asc' | 'desc' = 'asc';
  cropCurrentPage = 0;
  cropPageSize = 5;
  cropPageSizeOptions = [5, 10, 20];
  cropTotalPages = 1;

  // --- MODAL / FORM CONTROLS ---
  activeModal: ModalMode = null;
  droneForm!: FormGroup;
  rateForm!: FormGroup;
  capacityForm!: FormGroup;
  villageForm!: FormGroup;
  cropForm!: FormGroup;

  editingDroneId: string | null = null;
  editingVillageId: number | null = null;
  editingCropId: number | null = null;

  // Toast
  toast = { show: false, message: '', type: 'success' };
  private toastTimer: any;

  ngOnInit(): void {
    this.initForms();
    this.fetchRateData();
    this.fetchCapacityData();
    this.fetchDrones();
    this.fetchVillages();
    this.fetchCrops();
  }

  private initForms(): void {
    this.droneForm = this.fb.group({
      droneId: ['', [Validators.required, Validators.pattern('^[a-zA-Z0-9-_]{3,20}$')]],
      droneName: ['', [Validators.required, Validators.minLength(3)]],
      droneOwnerName: ['', [Validators.required, Validators.minLength(3)]],
      droneOwnerPhone: ['', [Validators.required, Validators.pattern('^[6-9][0-9]{9}$')]],
      droneStatus: ['ACTIVE', Validators.required]
    });

    this.rateForm = this.fb.group({
      price: [250, [Validators.required, Validators.min(50), Validators.max(10000)]],
      changeReason: ['Standard rate update']
    });

    this.capacityForm = this.fb.group({
      maxAcres: [30, [Validators.required, Validators.min(1), Validators.max(500), Validators.pattern('^[1-9][0-9]*$')]]
    });

    this.villageForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(2)]]
    });

    this.cropForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(2)]]
    });
  }

  setTab(tab: ActiveTab): void {
    this.currentTab = tab;
  }

  // ================= CAPACITY OPERATIONS =================
  fetchCapacityData(): void {
    this.isLoadingCapacity = true;
    this.capacityApi.getMaxCapacity().subscribe({
      next: (cap) => {
        if (cap && cap.maxAcres) {
          this.currentCapacity = cap;
        }
        this.isLoadingCapacity = false;
      },
      error: () => {
        this.isLoadingCapacity = false;
      }
    });
  }

  openUpdateCapacityModal(): void {
    this.capacityForm.reset({
      maxAcres: this.currentCapacity.maxAcres
    });
    this.activeModal = 'UPDATE_CAPACITY';
  }

  saveCapacity(): void {
    if (this.capacityForm.invalid) {
      this.capacityForm.markAllAsTouched();
      return;
    }

    const acres = Number(this.capacityForm.value.maxAcres);
    this.capacityApi.updateMaxCapacity(acres).subscribe({
      next: (res) => {
        this.currentCapacity = res;
        this.closeModal();
        this.showToast(`Daily fleet capacity updated to ${res.maxAcres} Acres/day!`, 'success');
      },
      error: () => this.showToast('Failed to update daily capacity.', 'error')
    });
  }

  // ================= 1. RATE OPERATIONS =================
  fetchRateData(): void {
    this.isLoadingRates = true;
    this.rateApi.getCurrentRate().subscribe({
      next: (rate) => {
        if (rate && rate.price) this.currentRate = rate;
      },
      error: () => this.showToast('Could not load current rate.', 'error')
    });

    this.rateApi.getAllRateHistory().subscribe({
      next: (history) => {
        this.rateHistory = history || [];
        this.applyRateSortAndPaging();
        this.isLoadingRates = false;
      },
      error: () => {
        this.isLoadingRates = false;
      }
    });
  }

  applyRateSortAndPaging(): void {
    let result = [...this.rateHistory];
    result.sort((a, b) => {
      const timeA = a.effectiveFrom ? new Date(a.effectiveFrom).getTime() : 0;
      const timeB = b.effectiveFrom ? new Date(b.effectiveFrom).getTime() : 0;
      return this.rateSortDir === 'asc' ? timeA - timeB : timeB - timeA;
    });

    this.filteredRates = result;
    this.rateTotalPages = Math.ceil(this.filteredRates.length / this.ratePageSize) || 1;
    if (this.rateCurrentPage >= this.rateTotalPages) this.rateCurrentPage = 0;

    const start = this.rateCurrentPage * this.ratePageSize;
    this.pagedRates = this.filteredRates.slice(start, start + this.ratePageSize);
  }

  toggleRateSort(): void {
    this.rateSortDir = this.rateSortDir === 'asc' ? 'desc' : 'asc';
    this.applyRateSortAndPaging();
  }

  openUpdateRateModal(): void {
    this.rateForm.reset({
      price: this.currentRate.price,
      changeReason: ''
    });
    this.activeModal = 'UPDATE_RATE';
  }

  saveRate(): void {
    if (this.rateForm.invalid) {
      this.rateForm.markAllAsTouched();
      return;
    }

    const payload: Rate = {
      price: Number(this.rateForm.value.price),
      changeReason: this.rateForm.value.changeReason?.trim() || 'Tariff revision'
    };

    this.rateApi.createNewRate(payload).subscribe({
      next: (res) => {
        this.currentRate = res;
        this.closeModal();
        this.fetchRateData();
        this.showToast(`New standard rate set to ₹${res.price}/tank!`, 'success');
      },
      error: () => this.showToast('Failed to update rate.', 'error')
    });
  }

  // ================= 3. DRONE OPERATIONS =================
  fetchDrones(): void {
    this.isLoadingDrones = true;
    this.droneApi.getDrones().subscribe({
      next: (data) => {
        this.drones = data || [];
        this.applyDroneFilters();
        this.isLoadingDrones = false;
      },
      error: () => {
        this.isLoadingDrones = false;
        this.showToast('Failed to load Drone List.', 'error');
      }
    });
  }

  applyDroneFilters(): void {
    let result = [...this.drones];

    if (this.droneStatusFilter !== 'ALL') {
      result = result.filter(d => d.droneStatus === this.droneStatusFilter);
    }

    if (this.droneSearch.trim()) {
      const q = this.droneSearch.toLowerCase().trim();
      result = result.filter(d =>
        d.droneId.toLowerCase().includes(q) ||
        d.droneName.toLowerCase().includes(q) ||
        d.droneOwnerName.toLowerCase().includes(q) ||
        d.droneOwnerPhone.includes(q)
      );
    }

    result.sort((a: any, b: any) => {
      const valA = a[this.droneSortBy];
      const valB = b[this.droneSortBy];
      if (valA === valB) return 0;
      if (valA == null) return 1;
      if (valB == null) return -1;
      const comp = valA > valB ? 1 : -1;
      return this.droneSortDir === 'asc' ? comp : -comp;
    });

    this.filteredDrones = result;
    this.droneTotalPages = Math.ceil(this.filteredDrones.length / this.dronePageSize) || 1;
    if (this.droneCurrentPage >= this.droneTotalPages) this.droneCurrentPage = 0;

    const start = this.droneCurrentPage * this.dronePageSize;
    this.pagedDrones = this.filteredDrones.slice(start, start + this.dronePageSize);
  }

  setDroneSort(col: keyof Drone): void {
    if (this.droneSortBy === col) {
      this.droneSortDir = this.droneSortDir === 'asc' ? 'desc' : 'asc';
    } else {
      this.droneSortBy = col;
      this.droneSortDir = 'asc';
    }
    this.applyDroneFilters();
  }

  toggleDroneStatus(drone: Drone): void {
    const newStatus = drone.droneStatus === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    const action = newStatus === 'ACTIVE' ? 'enabled' : 'disabled';

    this.droneApi.toggleDroneStatus(drone.droneId, newStatus).subscribe({
      next: () => {
        drone.droneStatus = newStatus;
        this.applyDroneFilters();
        this.showToast(`Drone ${drone.droneId} ${action}!`, 'success');
      },
      error: () => {
        const updated: Drone = { ...drone, droneStatus: newStatus };
        this.droneApi.updateDrone(drone.droneId, updated).subscribe({
          next: () => {
            drone.droneStatus = newStatus;
            this.applyDroneFilters();
            this.showToast(`Drone ${drone.droneId} ${action}!`, 'success');
          },
          error: () => this.showToast('Failed to change status.', 'error')
        });
      }
    });
  }

  openCreateDroneModal(): void {
    this.editingDroneId = null;
    this.droneForm.reset({
      droneId: '',
      droneName: '',
      droneOwnerName: '',
      droneOwnerPhone: '',
      droneStatus: 'ACTIVE'
    });
    this.droneForm.get('droneId')?.enable();
    this.activeModal = 'CREATE_DRONE';
  }

  openEditDroneModal(drone: Drone): void {
    this.editingDroneId = drone.droneId;
    this.droneForm.patchValue({
      droneId: drone.droneId,
      droneName: drone.droneName,
      droneOwnerName: drone.droneOwnerName,
      droneOwnerPhone: drone.droneOwnerPhone,
      droneStatus: drone.droneStatus
    });
    this.droneForm.get('droneId')?.disable();
    this.activeModal = 'EDIT_DRONE';
  }

  saveDrone(): void {
    if (this.droneForm.invalid) {
      this.droneForm.markAllAsTouched();
      return;
    }

    const payload: Drone = { ...this.droneForm.getRawValue() };

    if (this.activeModal === 'EDIT_DRONE' && this.editingDroneId) {
      this.droneApi.updateDrone(this.editingDroneId, payload).subscribe({
        next: () => {
          this.closeModal();
          this.fetchDrones();
          this.showToast(`Drone #${payload.droneId} updated!`, 'success');
        },
        error: () => this.showToast('Failed to update drone.', 'error')
      });
    } else {
      this.droneApi.createDrone(payload).subscribe({
        next: () => {
          this.closeModal();
          this.fetchDrones();
          this.showToast(`Drone #${payload.droneId} registered!`, 'success');
        },
        error: () => this.showToast('Registration failed. ID may be a duplicate.', 'error')
      });
    }
  }

  deleteDrone(droneId: string): void {
    if (!confirm(`Are you sure you want to delete Drone #${droneId}?`)) return;
    this.droneApi.deleteDrone(droneId).subscribe({
      next: () => {
        this.fetchDrones();
        this.showToast(`Drone #${droneId} removed.`, 'success');
      },
      error: () => this.showToast('Failed to delete drone.', 'error')
    });
  }

  // ================= 4. VILLAGE OPERATIONS =================
  fetchVillages(): void {
    this.isLoadingVillages = true;
    this.villageApi.getVillages().subscribe({
      next: (data) => {
        this.villages = data || [];
        this.applyVillageFilters();
        this.isLoadingVillages = false;
      },
      error: () => {
        this.isLoadingVillages = false;
        this.showToast('Failed to load villages.', 'error');
      }
    });
  }

  applyVillageFilters(): void {
    let result = [...this.villages];
    if (this.villageSearch.trim()) {
      const q = this.villageSearch.toLowerCase().trim();
      result = result.filter(v => v.name.toLowerCase().includes(q));
    }

    result.sort((a, b) => {
      const comp = a.name.localeCompare(b.name);
      return this.villageSortDir === 'asc' ? comp : -comp;
    });

    this.filteredVillages = result;
    this.villageTotalPages = Math.ceil(this.filteredVillages.length / this.villagePageSize) || 1;
    if (this.villageCurrentPage >= this.villageTotalPages) this.villageCurrentPage = 0;

    const start = this.villageCurrentPage * this.villagePageSize;
    this.pagedVillages = this.filteredVillages.slice(start, start + this.villagePageSize);
  }

  toggleVillageSort(): void {
    this.villageSortDir = this.villageSortDir === 'asc' ? 'desc' : 'asc';
    this.applyVillageFilters();
  }

  openCreateVillageModal(): void {
    this.editingVillageId = null;
    this.villageForm.reset({ name: '' });
    this.activeModal = 'CREATE_VILLAGE';
  }

  openEditVillageModal(v: Village): void {
    this.editingVillageId = v.villageId || null;
    this.villageForm.patchValue({ name: v.name });
    this.activeModal = 'EDIT_VILLAGE';
  }

  saveVillage(): void {
    if (this.villageForm.invalid) {
      this.villageForm.markAllAsTouched();
      return;
    }

    const trimmed = this.villageForm.value.name.trim();
    const isDuplicate = this.villages.some(v => 
      v.name.toLowerCase() === trimmed.toLowerCase() && v.villageId !== this.editingVillageId
    );

    if (isDuplicate) {
      this.showToast(`Village "${trimmed}" already exists. Duplicates not allowed.`, 'error');
      return;
    }

    const payload: Village = { name: trimmed };

    if (this.activeModal === 'EDIT_VILLAGE' && this.editingVillageId) {
      this.villageApi.updateVillage(this.editingVillageId, payload).subscribe({
        next: () => {
          this.closeModal();
          this.fetchVillages();
          this.showToast(`Village updated to "${trimmed}"!`, 'success');
        },
        error: (err) => this.showToast(err.error?.message || 'Failed to update village.', 'error')
      });
    } else {
      this.villageApi.addVillage(payload).subscribe({
        next: () => {
          this.closeModal();
          this.fetchVillages();
          this.showToast(`Village "${trimmed}" added!`, 'success');
        },
        error: (err) => this.showToast(err.error?.message || 'Failed to add village.', 'error')
      });
    }
  }

  deleteVillage(villageId?: number): void {
    if (!villageId) return;
    if (!confirm('Are you sure you want to delete this village record?')) return;

    this.villageApi.deleteVillage(villageId).subscribe({
      next: () => {
        this.fetchVillages();
        this.showToast('Village removed.', 'success');
      },
      error: () => this.showToast('Failed to delete village.', 'error')
    });
  }

  // ================= 5. CROP OPERATIONS =================
  fetchCrops(): void {
    this.isLoadingCrops = true;
    this.cropApi.getCrops().subscribe({
      next: (data) => {
        this.crops = data || [];
        this.applyCropFilters();
        this.isLoadingCrops = false;
      },
      error: () => {
        this.isLoadingCrops = false;
        this.showToast('Failed to load crops.', 'error');
      }
    });
  }

  applyCropFilters(): void {
    let result = [...this.crops];
    if (this.cropSearch.trim()) {
      const q = this.cropSearch.toLowerCase().trim();
      result = result.filter(c => c.name.toLowerCase().includes(q));
    }

    result.sort((a, b) => {
      const comp = a.name.localeCompare(b.name);
      return this.cropSortDir === 'asc' ? comp : -comp;
    });

    this.filteredCrops = result;
    this.cropTotalPages = Math.ceil(this.filteredCrops.length / this.cropPageSize) || 1;
    if (this.cropCurrentPage >= this.cropTotalPages) this.cropCurrentPage = 0;

    const start = this.cropCurrentPage * this.cropPageSize;
    this.pagedCrops = this.filteredCrops.slice(start, start + this.cropPageSize);
  }

  toggleCropSort(): void {
    this.cropSortDir = this.cropSortDir === 'asc' ? 'desc' : 'asc';
    this.applyCropFilters();
  }

  openCreateCropModal(): void {
    this.editingCropId = null;
    this.cropForm.reset({ name: '' });
    this.activeModal = 'CREATE_CROP';
  }

  openEditCropModal(c: Crop): void {
    this.editingCropId = c.cropId || null;
    this.cropForm.patchValue({ name: c.name });
    this.activeModal = 'EDIT_CROP';
  }

  saveCrop(): void {
    if (this.cropForm.invalid) {
      this.cropForm.markAllAsTouched();
      return;
    }

    const trimmed = this.cropForm.value.name.trim();
    const isDuplicate = this.crops.some(c => 
      c.name.toLowerCase() === trimmed.toLowerCase() && c.cropId !== this.editingCropId
    );

    if (isDuplicate) {
      this.showToast(`Crop "${trimmed}" already exists. Duplicates not allowed.`, 'error');
      return;
    }

    const payload: Crop = { name: trimmed };

    if (this.activeModal === 'EDIT_CROP' && this.editingCropId) {
      this.cropApi.updateCrop(this.editingCropId, payload).subscribe({
        next: () => {
          this.closeModal();
          this.fetchCrops();
          this.showToast(`Crop updated to "${trimmed}"!`, 'success');
        },
        error: (err) => this.showToast(err.error?.message || 'Failed to update crop.', 'error')
      });
    } else {
      this.cropApi.addCrop(payload).subscribe({
        next: () => {
          this.closeModal();
          this.fetchCrops();
          this.showToast(`Crop "${trimmed}" registered!`, 'success');
        },
        error: (err) => this.showToast(err.error?.message || 'Failed to add crop.', 'error')
      });
    }
  }

  deleteCrop(cropId?: number): void {
    if (!cropId) return;
    if (!confirm('Are you sure you want to delete this crop record?')) return;

    this.cropApi.deleteCrop(cropId).subscribe({
      next: () => {
        this.fetchCrops();
        this.showToast('Crop removed.', 'success');
      },
      error: () => this.showToast('Failed to delete crop.', 'error')
    });
  }

  closeModal(): void {
    this.activeModal = null;
    this.editingDroneId = null;
    this.editingVillageId = null;
    this.editingCropId = null;
  }

  showToast(message: string, type: 'success' | 'error' = 'success'): void {
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toast = { show: true, message, type };
    this.toastTimer = setTimeout(() => (this.toast.show = false), 4000);
  }

  getPages(total: number): number[] {
    return Array.from({ length: total }, (_, i) => i);
  }
}