import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = (route, state) => {
  
  const auth = inject(AuthService);
  const router = inject(Router);

  // If token is expired or user is not logged in
  if (auth.isTokenExpired() || !auth.isAuthenticated()) {
    auth.logout();
    return router.createUrlTree(['/login'], {
      queryParams: { 
        returnUrl: state.url,
        sessionExpired: auth.getToken() ? 'true' : null
      }
    });
  }

  return true;

};