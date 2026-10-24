import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';
import { environment } from '../../environments/environment';
import { LoginRequest } from '../models/login-request.model';
import { LoginResponse } from '../models/login-response.model';
import { User } from '../models/user.model';

@Injectable({
  providedIn: 'root'
})
export class AuthService {

  private http = inject(HttpClient);
  private router = inject(Router);
  private apiUrl = `${environment.apiBaseUrl}/auth`;

  private readonly TOKEN_KEY = 'drone_auth_token';
  private readonly USER_KEY = 'drone_user';

  // Signals for reactive template rendering
  currentUser = signal<User | null>(this.getUserFromStorage());
  isAuthenticated = computed(() => !!this.currentUser() && !this.isTokenExpired());

  login(credentials: LoginRequest): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${this.apiUrl}/login`, credentials).pipe(
      tap((res) => {
        localStorage.setItem(this.TOKEN_KEY, res.token);
        const user: User = { username: res.username, role: res.role };
        localStorage.setItem(this.USER_KEY, JSON.stringify(user));

        this.currentUser.set(user);
      })
    );
  }

  logout(): void {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.USER_KEY);
    this.currentUser.set(null);
  }

  getToken(): string | null {
    if (this.isTokenExpired()) {
      this.logout();
      return null;
    }
    return localStorage.getItem(this.TOKEN_KEY);
  }

  // Client-side JWT expiration check
  isTokenExpired(): boolean {
    const token = localStorage.getItem(this.TOKEN_KEY);
    if (!token) return true;

    try {
      const parts = token.split('.');
      if (parts.length !== 3) return true;

      // Base64Url to Base64 decode
      const payloadBase64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const decodedJson = atob(payloadBase64);
      const payload = JSON.parse(decodedJson);

      if (!payload.exp) return false;

      // exp is in seconds, convert to milliseconds
      const expirationDate = payload.exp * 1000;
      return Date.now() >= expirationDate;
    } catch {
      return true;
    }
  }

  private getUserFromStorage(): User | null {
    if (this.isTokenExpired()) {
      localStorage.removeItem(this.TOKEN_KEY);
      localStorage.removeItem(this.USER_KEY);
      return null;
    }

    const raw = localStorage.getItem(this.USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  
}