import { readFile } from 'node:fs/promises';

const files = {
  manifest: 'wear/app/src/main/AndroidManifest.xml',
  activity: 'wear/app/src/main/java/com/actionanand/vaultnest/wear/MainActivity.kt',
  colors: 'wear/app/src/main/res/values/colors.xml',
  styles: 'wear/app/src/main/res/values/styles.xml',
  dimensions: 'wear/app/src/main/res/values/dimens.xml',
  phonePatch: 'scripts/patch-android.mjs',
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
    'Companion dependency is declared',
    sources.manifest.includes('standalone" android:value="false'),
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
];

const failures = checks.filter(([, passed]) => !passed);
for (const [label, passed] of checks) {
  console.log(`${passed ? '✅' : '❌'} ${label}`);
}
if (failures.length > 0) {
  throw new Error(`${failures.length} Wear OS Play quality contract(s) failed.`);
}

console.log('✅ Static Wear OS Play quality contracts passed.');
