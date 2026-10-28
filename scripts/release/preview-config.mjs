import { appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function connectConfiguration(env) {
  const relay = (env.PANDACODE_RELAY_URL || env.EXPO_PUBLIC_PANDACODE_RELAY_URL || '').trim();
  const clientId = (env.PANDACODE_GITHUB_CLIENT_ID || env.EXPO_PUBLIC_PANDACODE_GITHUB_CLIENT_ID || '').trim();
  if (!relay && !clientId) return { configured: false, relay: '', clientId: '' };
  if (!relay || !clientId) throw new Error('Connect requires both its relay URL and matching GitHub client ID.');
  const url = new URL(relay);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('The Connect relay must be an HTTPS origin without credentials, a path or a query.');
  }
  if (!/^[A-Za-z0-9_.-]{1,128}$/.test(clientId)) throw new Error('Invalid public GitHub client ID. Do not supply a client secret.');
  return { configured: true, relay: url.origin, clientId };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const config = connectConfiguration(process.env);
  if (!config.configured) console.log('::warning::Connect is not configured. The desktop works locally; the phone cannot connect to a computer until both public repository variables are set and the packages are rebuilt.');
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `configured=${config.configured}\n`);
  if (process.env.GITHUB_ENV) {
    const values = {
      PANDACODE_RELAY_URL: config.relay,
      PANDACODE_GITHUB_CLIENT_ID: config.clientId,
      EXPO_PUBLIC_PANDACODE_RELAY_URL: config.relay,
      EXPO_PUBLIC_PANDACODE_GITHUB_CLIENT_ID: config.clientId,
    };
    for (const [key, value] of Object.entries(values)) appendFileSync(process.env.GITHUB_ENV, `${key}=${value}\n`);
  }
  console.log(`Connect configured: ${config.configured}`);
}
