#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import readline from 'node:readline/promises';

const alias = 'vaultnest';
const outputFile = 'release-keystore.jks';
const keyFile = 'vault-nest-key.pem';
const certFile = 'vault-nest-cert.pem';
const validityDays = '36500';
const subject = '/CN=Vault Nest/OU=Mobile/O=Vault Nest/C=IN';

async function resolvePassword() {
  const passwordIndex = process.argv.indexOf('--password');

  if (passwordIndex >= 0 && process.argv[passwordIndex + 1]) {
    return process.argv[passwordIndex + 1];
  }

  if (process.env.KEYSTORE_PASSWORD) {
    return process.env.KEYSTORE_PASSWORD;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  rl._writeToOutput = (value) => {
    if (value.includes('Enter keystore password')) {
      rl.output.write(value);
    }
  };

  const password = await rl.question('Enter keystore password: ');
  rl.output.write('\n');
  rl.close();

  if (!password) {
    throw new Error('Password cannot be empty.');
  }

  return password;
}

function run(command, args, env = {}) {
  execFileSync(command, args, {
    env: { ...process.env, ...env },
    stdio: 'pipe',
  });
}

function cleanup() {
  for (const file of [keyFile, certFile]) {
    if (existsSync(file)) {
      rmSync(file);
    }
  }
}

try {
  run('openssl', ['version']);
} catch {
  console.error('openssl was not found. Install openssl and try again.');
  process.exit(1);
}

try {
  const password = await resolvePassword();

  if (existsSync(outputFile)) {
    rmSync(outputFile);
  }

  run('openssl', ['genrsa', '-out', keyFile, '2048']);
  run('openssl', [
    'req',
    '-new',
    '-x509',
    '-key',
    keyFile,
    '-out',
    certFile,
    '-days',
    validityDays,
    '-subj',
    subject,
  ]);
  run(
    'openssl',
    [
      'pkcs12',
      '-export',
      '-in',
      certFile,
      '-inkey',
      keyFile,
      '-out',
      outputFile,
      '-name',
      alias,
      '-passout',
      'env:OPENSSL_PASS',
    ],
    { OPENSSL_PASS: password },
  );

  cleanup();

  console.log(`Created ${outputFile}`);
  console.log(`Alias: ${alias}`);
  console.log('Format: PKCS12');
  console.log(
    `Verify: openssl pkcs12 -in ${outputFile} -passin env:KEYSTORE_PASSWORD -info -noout`,
  );
  console.log(`Encode: base64 -w 0 ${outputFile} > keystore.b64.txt`);
} catch (error) {
  cleanup();
  console.error(error instanceof Error ? error.message : 'Keystore generation failed.');
  process.exit(1);
}
