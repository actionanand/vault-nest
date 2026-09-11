import { readFile } from 'node:fs/promises';

const files = {
  manifest: 'wear/app/src/main/AndroidManifest.xml',
  activity: 'wear/app/src/main/java/com/actionanand/vaultnest/wear/MainActivity.kt',
  colors: 'wear/app/src/main/res/values/colors.xml',
  styles: 'wear/app/src/main/res/values/styles.xml',
  dimensions: 'wear/app/src/main/res/values/dimens.xml',
  phonePatch: 'scripts/patch-android.mjs',
  phoneTransport: 'scripts/android/WatchVaultPlugin.java.template',
  phoneIdentity: 'capacitor.config.ts',
  watchIdentity: 'wear-config.json',
  watchTransport:
    'wear/app/src/main/java/com/actionanand/vaultnest/wear/WatchVaultListenerService.kt',
  watchRepository: 'wear/app/src/main/java/com/actionanand/vaultnest/wear/WatchVaultRepository.kt',
  watchSecurity: 'wear/app/src/main/java/com/actionanand/vaultnest/wear/ProtocolSecurity.kt',
  watchEnvironment: 'src/environments/watch-vault.environment.ts',
};

const sources = Object.fromEntries(
  await Promise.all(
    Object.entries(files).map(async ([key, path]) => [key, await readFile(path, 'utf8')]),
  ),
);

const checks = [
  [
    'Wear activity uses the startup theme',
    sources.manifest.includes('Theme.VaultNestWear.Starting'),
  ],
  [
    'Wear app is declared genuinely standalone',
    sources.manifest.includes('standalone" android:value="true'),
  ],
  [
    'Standalone vault has no internet permission',
    !sources.manifest.includes('android.permission.INTERNET'),
  ],
  ['Wear background is true black', /wear_background">#000000</i.test(sources.colors)],
  ['Launcher background is true black', /wear_launcher_background">#000000</i.test(sources.colors)],
  ['AndroidX splash theme is configured', sources.styles.includes('parent="Theme.SplashScreen"')],
  ['Splash icon size is 48dp', /wear_splash_icon_size">48dp</i.test(sources.dimensions)],
  [
    'Splash screen is installed before Wear content',
    sources.activity.includes('installSplashScreen()'),
  ],
  [
    'Scrollable screens expose a position indicator',
    sources.activity.includes('PositionIndicator('),
  ],
  [
    'Credential details support swipe-to-dismiss',
    sources.activity.includes('BasicSwipeToDismissBox('),
  ],
  ['Watch can open setup on the paired phone', sources.activity.includes('RemoteActivityHelper(')],
  [
    'First launch offers complete watch-only setup',
    sources.activity.includes('StandaloneOnboardingScreen(') &&
      sources.activity.includes('Set up on this watch') &&
      sources.activity.includes('Connect Android phone'),
  ],
  [
    'Every phone setup route retains a watch-only alternative',
    sources.activity.includes(
      'PhoneConnectionScreen(onRefresh: () -> Unit, onSetUpOnWatch: () -> Unit)',
    ) && sources.activity.includes('onClick = onSetUpOnWatch'),
  ],
  [
    'Watch generates passwords locally with SecureRandom',
    sources.watchSecurity.includes('object WatchPasswordGenerator') &&
      sources.watchSecurity.includes('SecureRandom'),
  ],
  [
    'Watch-only passwords use encrypted persistence and never enter phone sync',
    sources.watchRepository.includes('fun addWatchEntry(') &&
      sources.watchRepository.includes('encryptAtRest(') &&
      sources.watchTransport.includes('repository.replacePhoneEntries(entries)'),
  ],
  [
    'Standalone workflow supports save, reveal, copy, and confirmed local deletion',
    sources.activity.includes('Save on watch') &&
      sources.activity.includes('Show for 10 seconds') &&
      sources.activity.includes('Copy password') &&
      sources.activity.includes('Tap again to delete'),
  ],
  [
    'Phone clear preserves watch-only passwords',
    sources.watchTransport.includes('repository.clearPhoneEntries()') &&
      sources.watchSecurity.includes('clearPhoneEntries'),
  ],
  [
    'Local and synchronized limits are independently configurable',
    /WATCH_VAULT_MAX_ENTRIES\s*=\s*\d+/.test(sources.watchEnvironment) &&
      /WATCH_VAULT_MAX_LOCAL_ENTRIES\s*=\s*\d+/.test(sources.watchEnvironment),
  ],
  [
    'Remote phone failures are contained',
    sources.activity.includes('runCatching {\n        RemoteActivityHelper'),
  ],
  [
    'PIN hashing leaves the UI thread',
    sources.activity.includes('withContext(Dispatchers.Default)'),
  ],
  [
    'Vault file access leaves the UI thread',
    sources.activity.includes('withContext(Dispatchers.IO)'),
  ],
  [
    'Phone build handles the Wear settings route',
    sources.phonePatch.includes('android:scheme="vaultnest"'),
  ],
  [
    'Pairing requests persist across temporary disconnects',
    sources.phoneTransport.includes('PutDataRequest.create(PATH_PAIR_REQUEST)'),
  ],
  [
    'Pairing responses persist across temporary disconnects',
    sources.watchTransport.includes('PutDataRequest.create(WatchProtocol.PAIR_PUBLIC_KEY)'),
  ],
  [
    'Wear service receives persisted Data Layer changes',
    sources.manifest.includes('com.google.android.gms.wearable.DATA_CHANGED') &&
      sources.watchTransport.includes('override fun onDataChanged'),
  ],
  [
    'Secure pairing does not wait for Watch PIN creation',
    !sources.watchTransport.includes(
      'if (repository.pinRequired() && !repository.hasPin()) return',
    ),
  ],
  [
    'Phone and Wear application IDs match',
    /appId:\s*['"]com\.actionanand\.vaultnest\.app['"]/.test(sources.phoneIdentity) &&
      /"applicationId"\s*:\s*"com\.actionanand\.vaultnest\.app"/.test(sources.watchIdentity),
  ],
];

const failures = checks.filter(([, passed]) => !passed);
for (const [label, passed] of checks) {
  console.log(`${passed ? '✅' : '❌'} ${label}`);
}
if (failures.length > 0) {
  throw new Error(`${failures.length} Wear OS Play quality contract(s) failed.`);
}

console.log('✅ Static Wear OS Play quality contracts passed.');
