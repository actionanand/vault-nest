import type { CanDeactivateFn } from '@angular/router';

export interface UnsavedChangesAware {
  canDeactivate(): boolean | Promise<boolean>;
}

export const unsavedChangesGuard: CanDeactivateFn<UnsavedChangesAware> = (component) =>
  component.canDeactivate();
