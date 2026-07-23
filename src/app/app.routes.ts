import { Routes } from '@angular/router';
import { unlockedGuard } from './core/guards/unlocked.guard';
import { lockedGuard, setupGuard } from './core/guards/setup.guard';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./features/auth/startup').then((module) => module.Startup),
  },
  {
    path: 'setup',
    canActivate: [setupGuard],
    loadComponent: () => import('./features/auth/setup').then((module) => module.Setup),
  },
  {
    path: 'unlock',
    canActivate: [lockedGuard],
    loadComponent: () => import('./features/auth/unlock').then((module) => module.Unlock),
  },
  {
    path: 'vault',
    canActivate: [unlockedGuard],
    loadComponent: () => import('./features/vault/vault-shell').then((module) => module.VaultShell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'all' },
      {
        path: 'all',
        loadComponent: () =>
          import('./features/vault/vault-home').then((module) => module.VaultHome),
      },
      {
        path: 'favourites',
        data: { favourites: true },
        loadComponent: () =>
          import('./features/vault/vault-home').then((module) => module.VaultHome),
      },
      {
        path: 'weak-passwords',
        data: { weakPasswords: true },
        loadComponent: () =>
          import('./features/vault/vault-home').then((module) => module.VaultHome),
      },
      {
        path: 'archive',
        data: { scope: 'ARCHIVE' },
        loadComponent: () =>
          import('./features/vault/vault-home').then((module) => module.VaultHome),
      },
      {
        path: 'trash',
        data: { scope: 'TRASH' },
        loadComponent: () =>
          import('./features/vault/vault-home').then((module) => module.VaultHome),
      },
      {
        path: 'generator',
        loadComponent: () =>
          import('./features/generator/generator').then((module) => module.Generator),
      },
      {
        path: 'settings',
        loadComponent: () =>
          import('./features/settings/settings').then((module) => module.Settings),
      },
      {
        path: 'new/template/:id',
        loadComponent: () =>
          import('./features/item-editor/item-editor').then((module) => module.ItemEditor),
      },
      {
        path: 'new/:type',
        loadComponent: () =>
          import('./features/item-editor/item-editor').then((module) => module.ItemEditor),
      },
      {
        path: 'edit/:id',
        loadComponent: () =>
          import('./features/item-editor/item-editor').then((module) => module.ItemEditor),
      },
      {
        path: 'item/:id',
        loadComponent: () =>
          import('./features/item-details/item-details-page').then(
            (module) => module.ItemDetailsPage,
          ),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
