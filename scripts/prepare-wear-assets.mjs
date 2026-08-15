import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const source = resolve('public/vault-nest.png');
const target = resolve('wear/app/src/main/res/drawable-nodpi/vault_nest_brand.png');
await mkdir(dirname(target), { recursive: true });
await copyFile(source, target);
console.log('⌚ Prepared the existing Vault Nest brand icon for Wear OS.');
