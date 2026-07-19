import { inject } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';
import { AuthStore } from '../services/auth.store';

export const setupGuard: CanActivateFn = async () => {
  const auth = inject(AuthStore);
  const router = inject(Router);
  await auth.initialise();
  return (
    auth.status() === 'NEEDS_SETUP' ||
    router.createUrlTree([auth.isUnlocked() ? '/vault' : '/unlock'])
  );
};

export const lockedGuard: CanActivateFn = async () => {
  const auth = inject(AuthStore);
  const router = inject(Router);
  await auth.initialise();
  return (
    auth.status() === 'LOCKED' ||
    router.createUrlTree([auth.status() === 'NEEDS_SETUP' ? '/setup' : '/vault'])
  );
};
