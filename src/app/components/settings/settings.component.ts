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
  | 'CREATE_RATE' | 'EDIT_RATE'
  | 'UPDATE_CAPACITY'
  | 'CREATE_DRONE' | 'EDIT_DRONE' 
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

  // --- 1. RATES ---
  ratesList: Rate[] = [];
  filteredRates: Rate[] = [];
  pagedRates: Rate[] = [];
  isLoadingRates = false;
  rateSearch = '';
  rateSortDir: 'asc' | 'desc' = 'desc';
  rateCurrentPage = 0;
  ratePageSize = 5;
  ratePageSizeOptions = [5, 10, 20];
  rateTotalPages = 1;
  editingRateId: number | null = null;

  // --- 2. CAPACITY ---
  currentCapacity: MaxCapacity = { id: 1, maxAcres: 30 };
  isLoadingCapacity = false;

  // --- 3. DRONES ---
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

  // --- 4. VILLAGES ---
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

  // --- 5. CROPS ---
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

  // Modals & Forms
  activeModal: ModalMode = null;
  rateForm!: FormGroup;
  capacityForm!: FormGroup;
  droneForm!: FormGroup;
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
    this.rateForm = this.fb.group({
      price: [null, [Validators.required, Validators.min(0), Validators.max(50000)]]
    });

    this.capacityForm = this.fb.group({
      maxAcres: [30, [Validators.required, Validators.min(1), Validators.max(500), Validators.pattern('^[1-9][0-9]*$')]]
    });

    this.droneForm = this.fb.group({
      droneId: ['', [Validators.required, Validators.pattern('^[a-zA-Z0-9-_]{3,20}$')]],
      droneName: ['', [Validators.required, Validators.minLength(3)]],
      droneOwnerName: ['', [Validators.required, Validators.minLength(3)]],
      droneOwnerPhone: ['', [Validators.required, Validators.pattern('^[6-9][0-9]{9}$')]],
      droneStatus: ['ACTIVE', Validators.required]
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

  // ================= 1. SIMPLE RATES =================
  fetchRateData(): void {
    this.isLoadingRates = true;
    this.rateApi.getRates().subscribe({
      next: (rates) => {
        this.ratesList = rates || [];
        this.applyRateFilters();
        this.isLoadingRates = false;
      },
      error: () => {
        this.isLoadingRates = false;
        this.showToast('Failed to load rates list.', 'error');
      }
    });
  }

  applyRateFilters(): void {
    let result = [...this.ratesList];

    if (this.rateSearch.trim()) {
      const q = this.rateSearch.trim();
      result = result.filter(r => String(r.price).includes(q));
    }

    result.sort((a, b) => {
      const pA = Number(a.price);
      const pB = Number(b.price);
      return this.rateSortDir === 'asc' ? pA - pB : pB - pA;
    });

    this.filteredRates = result;
    this.rateTotalPages = Math.ceil(this.filteredRates.length / this.ratePageSize) || 1;
    if (this.rateCurrentPage >= this.rateTotalPages) this.rateCurrentPage = 0;

    const start = this.rateCurrentPage * this.ratePageSize;
    this.pagedRates = this.filteredRates.slice(start, start + this.ratePageSize);
  }

  toggleRateSort(): void {
    this.rateSortDir = this.rateSortDir === 'asc' ? 'desc' : 'asc';
    this.applyRateFilters();
  }

  openCreateRateModal(): void {
    this.editingRateId = null;
    this.rateForm.reset({ price: null });
    this.activeModal = 'CREATE_RATE';
  }

  openEditRateModal(r: Rate): void {
    this.editingRateId = r.rateId || null;
    this.rateForm.patchValue({ price: r.price });
    this.activeModal = 'EDIT_RATE';
  }

  saveRate(): void {
    if (this.rateForm.invalid) {
      this.rateForm.markAllAsTouched();
      return;
    }

    const payload = { price: Number(this.rateForm.value.price) };

    if (this.editingRateId) {
      this.rateApi.updateRate(this.editingRateId, payload).subscribe({
        next: () => {
          this.closeModal();
          this.fetchRateData();
          this.showToast(`Rate updated to ₹${payload.price}!`, 'success');
        },
        error: () => this.showToast('Failed to update rate.', 'error')
      });
    } else {
      this.rateApi.addRate(payload).subscribe({
        next: () => {
          this.closeModal();
          this.fetchRateData();
          this.showToast(`Rate ₹${payload.price}/tank added!`, 'success');
        },
        error: () => this.showToast('Failed to add rate.', 'error')
      });
    }
  }

  deleteRate(rateId?: number): void {
    if (!rateId || !confirm('Are you sure you want to delete this rate?')) return;
    this.rateApi.deleteRate(rateId).subscribe({
      next: () => {
        this.fetchRateData();
        this.showToast('Rate deleted.', 'success');
      },
      error: () => this.showToast('Failed to delete rate.', 'error')
    });
  }

  // ================= 2. CAPACITY =================
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
    this.capacityForm.reset({ maxAcres: this.currentCapacity.maxAcres });
    this.activeModal = 'UPDATE_CAPACITY';
  }

  saveCapacity(): void {
    if (this.capacityForm.invalid) return;
    const acres = Number(this.capacityForm.value.maxAcres);
    this.capacityApi.updateMaxCapacity(acres).subscribe({
      next: (res) => {
        this.currentCapacity = res;
        this.closeModal();
        this.showToast(`Daily capacity set to ${res.maxAcres} Acres/day!`, 'success');
      },
      error: () => this.showToast('Failed to update capacity.', 'error')
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
      return this.droneSortDir === 'asc' ? (valA > valB ? 1 : -1) : (valA > valB ? -1 : 1);
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
    this.droneApi.toggleDroneStatus(drone.droneId, newStatus).subscribe({
      next: () => {
        drone.droneStatus = newStatus;
        this.applyDroneFilters();
        this.showToast(`Drone ${drone.droneId} status changed!`, 'success');
      }
    });
  }

  openCreateDroneModal(): void {
    this.editingDroneId = null;
    this.droneForm.reset({ droneId: '', droneName: '', droneOwnerName: '', droneOwnerPhone: '', droneStatus: 'ACTIVE' });
    this.droneForm.get('droneId')?.enable();
    this.activeModal = 'CREATE_DRONE';
  }

  openEditDroneModal(d: Drone): void {
    this.editingDroneId = d.droneId;
    this.droneForm.patchValue(d);
    this.droneForm.get('droneId')?.disable();
    this.activeModal = 'EDIT_DRONE';
  }

  saveDrone(): void {
    if (this.droneForm.invalid) return;
    const payload = { ...this.droneForm.getRawValue() };
    if (this.editingDroneId) {
      this.droneApi.updateDrone(this.editingDroneId, payload).subscribe(() => {
        this.closeModal();
        this.fetchDrones();
        this.showToast(`Drone #${payload.droneId} updated!`, 'success');
      });
    } else {
      this.droneApi.createDrone(payload).subscribe(() => {
        this.closeModal();
        this.fetchDrones();
        this.showToast(`Drone #${payload.droneId} registered!`, 'success');
      });
    }
  }

  deleteDrone(id: string): void {
    if (!confirm(`Delete Drone #${id}?`)) return;
    this.droneApi.deleteDrone(id).subscribe(() => {
      this.fetchDrones();
      this.showToast(`Drone #${id} removed.`, 'success');
    });
  }

  // ================= 4. VILLAGES & 5. CROPS =================
  fetchVillages(): void {
    this.villageApi.getVillages().subscribe(data => {
      this.villages = data || [];
      this.applyVillageFilters();
    });
  }

  applyVillageFilters(): void {
    let result = [...this.villages];
    if (this.villageSearch.trim()) {
      const q = this.villageSearch.toLowerCase().trim();
      result = result.filter(v => v.name.toLowerCase().includes(q));
    }
    result.sort((a, b) => this.villageSortDir === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name));
    this.filteredVillages = result;
    this.villageTotalPages = Math.ceil(this.filteredVillages.length / this.villagePageSize) || 1;
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
    if (this.villageForm.invalid) return;
    const payload = { name: this.villageForm.value.name.trim() };
    if (this.editingVillageId) {
      this.villageApi.updateVillage(this.editingVillageId, payload).subscribe(() => {
        this.closeModal();
        this.fetchVillages();
        this.showToast('Village updated!', 'success');
      });
    } else {
      this.villageApi.addVillage(payload).subscribe(() => {
        this.closeModal();
        this.fetchVillages();
        this.showToast('Village added!', 'success');
      });
    }
  }

  deleteVillage(id?: number): void {
    if (!id || !confirm('Delete village?')) return;
    this.villageApi.deleteVillage(id).subscribe(() => {
      this.fetchVillages();
      this.showToast('Village removed.', 'success');
    });
  }

  fetchCrops(): void {
    this.cropApi.getCrops().subscribe(data => {
      this.crops = data || [];
      this.applyCropFilters();
    });
  }

  applyCropFilters(): void {
    let result = [...this.crops];
    if (this.cropSearch.trim()) {
      const q = this.cropSearch.toLowerCase().trim();
      result = result.filter(c => c.name.toLowerCase().includes(q));
    }
    result.sort((a, b) => this.cropSortDir === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name));
    this.filteredCrops = result;
    this.cropTotalPages = Math.ceil(this.filteredCrops.length / this.cropPageSize) || 1;
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
    if (this.cropForm.invalid) return;
    const payload = { name: this.cropForm.value.name.trim() };
    if (this.editingCropId) {
      this.cropApi.updateCrop(this.editingCropId, payload).subscribe(() => {
        this.closeModal();
        this.fetchCrops();
        this.showToast('Crop updated!', 'success');
      });
    } else {
      this.cropApi.addCrop(payload).subscribe(() => {
        this.closeModal();
        this.fetchCrops();
        this.showToast('Crop registered!', 'success');
      });
    }
  }

  deleteCrop(id?: number): void {
    if (!id || !confirm('Delete crop?')) return;
    this.cropApi.deleteCrop(id).subscribe(() => {
      this.fetchCrops();
      this.showToast('Crop deleted.', 'success');
    });
  }

  closeModal(): void {
    this.activeModal = null;
    this.editingRateId = null;
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