import { inject } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';
import { AuthStore } from '../services/auth.store';

export const unlockedGuard: CanActivateFn = async () => {
  const auth = inject(AuthStore);
  const router = inject(Router);
  await auth.initialise();
  return auth.isUnlocked() || router.createUrlTree(['/unlock']);
};
