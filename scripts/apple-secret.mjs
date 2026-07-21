#!/usr/bin/env node
/**
 * Generate an Apple client secret JWT for Sign in with Apple.
 *
 * Usage:
 *   node scripts/apple-secret.mjs \
 *     --team-id MAG2WYD297 \
 *     --key-id YOUR_KEY_ID \
 *     --client-id com.streamscapes.auth \
 *     --private-key-path /path/to/AuthKey_XXXXXXXX.p8
 */

import { SignJWT, importPKCS8 } from 'jose';
import { readFileSync } from 'fs';

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1 || i + 1 >= process.argv.length) {
    console.error(`Missing --${name}`);
    process.exit(1);
  }
  return process.argv[i + 1];
}

const teamId = arg('team-id');
const keyId = arg('key-id');
const clientId = arg('client-id');
const keyPath = arg('private-key-path');

const privateKey = readFileSync(keyPath, 'utf8');
const key = await importPKCS8(privateKey, 'ES256');

const secret = await new SignJWT({})
  .setProtectedHeader({ alg: 'ES256', kid: keyId })
  .setIssuer(teamId)
  .setAudience('https://appleid.apple.com')
  .setSubject(clientId)
  .setIssuedAt()
  .setExpirationTime('180d')
  .sign(key);

console.log(secret);
