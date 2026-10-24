import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  
  const authService = inject(AuthService);
  const router = inject(Router);
  const token = authService.getToken();

  let authReq = req;
  // 1. Attach Bearer token if present
  if (token) {
    authReq = req.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`
      }
    });
  }

  // 2. Intercept responses: Catch token expiration or unauthorized access (401 / 403)
  return next(authReq).pipe(
    catchError((error: HttpErrorResponse) => {
      const isLoginRequest = req.url.includes('/api/auth/') || req.url.includes('/login');

      if ((error.status === 401 || error.status === 403) && !isLoginRequest) {
        // Clear session state
        authService.logout();

        // Redirect user to login with query param
        router.navigate(['/login'], {
          queryParams: { sessionExpired: 'true' }
        });
      }

      return throwError(() => error);
    })
  );

};