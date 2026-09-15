import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const bundlePath = process.argv[2];
if (!bundlePath || !existsSync(bundlePath)) {
  throw new Error('Usage: node scripts/verify-wear-artifact.mjs <release.aab>');
}

function readArchiveEntry(entryPath) {
  try {
    return execFileSync('unzip', ['-p', bundlePath, entryPath], { maxBuffer: 64 * 1024 * 1024 });
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    return execFileSync('tar', ['-xOf', bundlePath, entryPath], { maxBuffer: 64 * 1024 * 1024 });
  }
}

const manifest = readArchiveEntry('base/manifest/AndroidManifest.xml');

const archiveEntries = (() => {
  try {
    return execFileSync('unzip', ['-Z1', bundlePath], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    return execFileSync('tar', ['-tf', bundlePath], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
  }
})();

function manifestWindow(marker, windowSize = 256) {
  const offset = manifest.indexOf(Buffer.from(marker, 'utf8'));
  if (offset < 0) throw new Error(`Final AAB manifest is missing ${marker}`);
  return manifest.subarray(offset, Math.min(manifest.length, offset + windowSize));
}

const standalone = manifestWindow('com.google.android.wearable.standalone');
if (!standalone.includes(Buffer.from('true')) || standalone.includes(Buffer.from('false'))) {
  throw new Error('Final AAB does not declare standalone=true');
}

const targetSdk = manifestWindow('targetSdkVersion', 128);
if (!targetSdk.includes(Buffer.from('36'))) {
  throw new Error('Final AAB does not target API 36');
}

for (const marker of ['com.actionanand.vaultnest.app', 'android.hardware.type.watch']) {
  manifestWindow(marker);
}

const abiPairs = [
  ['base/lib/armeabi-v7a/', 'base/lib/arm64-v8a/', 'ARM'],
  ['base/lib/x86/', 'base/lib/x86_64/', 'x86'],
];
for (const [thirtyTwoBitAbi, sixtyFourBitAbi, family] of abiPairs) {
  if (archiveEntries.includes(thirtyTwoBitAbi) && !archiveEntries.includes(sixtyFourBitAbi)) {
    throw new Error(`Final AAB contains 32-bit ${family} native code without 64-bit support`);
  }
}

const dexEntries = archiveEntries
  .split(/\r?\n/)
  .filter((entry) => /^base\/dex\/classes\d*\.dex$/.test(entry));
if (dexEntries.length === 0) {
  throw new Error('Final AAB does not contain an inspectable base DEX file');
}
const dex = Buffer.concat(dexEntries.map(readArchiveEntry));
for (const forbiddenText of ['Connect Android phone', 'Open phone setup']) {
  if (dex.includes(Buffer.from(forbiddenText))) {
    throw new Error(`Final AAB still exposes companion-dependent action: ${forbiddenText}`);
  }
}

console.log('✅ Final AAB declares standalone=true.');
console.log('✅ Final AAB targets API 36.');
console.log('✅ Final AAB contains the expected package and watch feature.');
console.log('✅ Final AAB satisfies the ARM 64-bit native-code check.');
console.log('✅ Final AAB does not expose a companion-dependent first-launch action.');
