import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';

export function inspectApk(bytes) {
  const names = [];
  unzipSync(bytes, { filter(entry) { names.push(entry.name); return false; } });
  if (!names.includes('assets/index.android.bundle')) throw new Error('APK has no embedded JavaScript bundle; it must not depend on Metro.');
  const libraries = names.filter(name => /^lib\/[^/]+\/[^/]+\.so$/.test(name));
  if (!libraries.length || libraries.some(name => !name.startsWith('lib/arm64-v8a/'))) throw new Error('Expected an ARM64-only APK for a physical Android phone.');
  return { abi: 'arm64-v8a', nativeLibraries: libraries.length, embeddedJavaScript: true };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const path = process.argv[2];
  if (!path || statSync(path).size > 500 * 1024 * 1024) throw new Error('Provide an APK smaller than 500 MiB.');
  const bytes = readFileSync(path);
  const result = inspectApk(bytes);
  const hash = createHash('sha256').update(bytes).digest('hex');
  writeFileSync(`${path}.sha256`, `${hash}  ${basename(path)}\n`);
  writeFileSync(`${path}.json`, JSON.stringify({
    ...result,
    applicationId: 'io.github.norecall.pandacode.zhpreview',
    versionCode: Number(process.env.PANDACODE_ANDROID_VERSION_CODE),
    sourceCommit: process.env.GITHUB_SHA,
    connectConfigured: Boolean(process.env.EXPO_PUBLIC_PANDACODE_RELAY_URL && process.env.EXPO_PUBLIC_PANDACODE_GITHUB_CLIENT_ID),
    signing: 'Expo template debug key; personal preview only, not production signing',
    sha256: hash,
  }, null, 2) + '\n');
  console.log(JSON.stringify(result));
}
