const fs = require('node:fs');
const path = require('node:path');

const wearFile = path.join(process.cwd(), 'wear-version.json');
const wearVersion = JSON.parse(fs.readFileSync(wearFile, 'utf8'));

if (!Number.isInteger(wearVersion.versionCode) || wearVersion.versionCode < 1) {
  throw new Error('wear-version.json versionCode must be a positive integer.');
}
if (!Number.isInteger(wearVersion.wearRevision) || wearVersion.wearRevision < 1) {
  throw new Error('wear-version.json wearRevision must be a positive integer.');
}

wearVersion.versionCode += 1;

fs.writeFileSync(wearFile, `${JSON.stringify(wearVersion, null, 2)}\n`);
console.log(`Wear OS versionCode: ${wearVersion.versionCode}`);
