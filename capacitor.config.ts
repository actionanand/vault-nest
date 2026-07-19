import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.vaultnest.mobile',
  appName: 'Vault Nest',
  webDir: 'dist/vault-nest/browser',
  server: { androidScheme: 'https' },
  android: { backgroundColor: '#111b21' },
  plugins: {
    LocalNotifications: { smallIcon: 'ic_stat_vault_nest', iconColor: '#d9f99d' },
    SplashScreen: { launchShowDuration: 1800, backgroundColor: '#111b21', showSpinner: false },
  },
};

export default config;
