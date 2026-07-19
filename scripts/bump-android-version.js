const fs = require('node:fs');
const path = require('node:path');

const file = path.join(process.cwd(), 'android-version.json');
const version = JSON.parse(fs.readFileSync(file, 'utf8'));
version.versionCode += 1;
fs.writeFileSync(file, `${JSON.stringify(version, null, 2)}\n`);
console.log(`Android version ${version.versionName} (${version.versionCode})`);
