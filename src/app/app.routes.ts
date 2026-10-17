import { Routes } from '@angular/router';
import { HomeComponent } from './components/home/home.component';
import { BookingComponent } from './components/booking/booking.component';
import { MaintenanceComponent } from './components/maintenance/maintenance.component';
import { OperationComponent } from './components/operation/operation.component';
import { LogsComponent } from './components/logs/logs.component';
import { SettingsComponent } from './components/settings/settings.component';
import { ExportReportsComponent } from './components/export-reports/export-reports.component';
import { LoginComponent } from './components/login/login.component';
import { authGuard } from './guards/auth.guard';

export const routes: Routes = [
  
  { path: '', component: HomeComponent },
  { path: 'login', component: LoginComponent },
  { path: 'booking', component: BookingComponent },
  
  // Protected operational routes
  { path: 'operations', component: OperationComponent, canActivate: [authGuard] },
  { path: 'logs', component: LogsComponent, canActivate: [authGuard] },
  { path: 'maintenance', component: MaintenanceComponent, canActivate: [authGuard] },
  { path: 'settings', component: SettingsComponent, canActivate: [authGuard] },
  { path: 'reports', component: ExportReportsComponent, canActivate: [authGuard] },
  { path: '**', redirectTo: '' }
];