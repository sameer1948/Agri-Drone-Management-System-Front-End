import { Routes } from '@angular/router';
import { HomeComponent } from './components/home/home.component';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { BookingComponent } from './components/booking/booking.component';
import { MaintenanceComponent } from './components/maintenance/maintenance.component';
import { OperationComponent } from './components/operation/operation.component';
import { LogsComponent } from './components/logs/logs.component';

export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'dashboard', component: DashboardComponent },
  { path: 'booking', component: BookingComponent },
  { path: 'operations', component: OperationComponent },
  { path: 'logs', component: LogsComponent },
  { path: 'maintenance', component: MaintenanceComponent },
  { path: '**', redirectTo: '' }
];