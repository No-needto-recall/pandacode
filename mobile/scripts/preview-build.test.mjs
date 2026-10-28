import test from 'node:test';
import assert from 'node:assert/strict';
import { zipSync, strToU8 } from 'fflate';
import { inspectApk } from './verify-apk.mjs';
import configure from '../app.config.ts';

const files = { 'assets/index.android.bundle': strToU8('embedded bundle'), 'lib/arm64-v8a/libapp.so': new Uint8Array([1]) };

test('phone preview requires an embedded bundle and ARM64 native libraries', () => {
  assert.deepEqual(inspectApk(zipSync(files)), { abi: 'arm64-v8a', nativeLibraries: 1, embeddedJavaScript: true });
  assert.throws(() => inspectApk(zipSync({ 'lib/arm64-v8a/libapp.so': new Uint8Array([1]) })), /JavaScript bundle/);
  assert.throws(() => inspectApk(zipSync({ ...files, 'lib/x86_64/libapp.so': new Uint8Array([1]) })), /ARM64/);
  assert.throws(() => inspectApk(zipSync({ 'assets/index.android.bundle': new Uint8Array([1]) })), /ARM64/);
});

test('Android preview isolates its package and does not claim the upstream Expo account', () => {
  const previous = process.env.PANDACODE_ANDROID_PREVIEW;
  const previousCode = process.env.PANDACODE_ANDROID_VERSION_CODE;
  const base = { name: 'PandaCode', slug: 'pandacode', owner: 'upstream-owner', platforms: ['ios', 'android'], plugins: ['expo-router', ['expo-widgets', {}]], android: { package: 'com.aicodeking.pandacode', versionCode: 1 }, ios: { bundleIdentifier: 'com.aicodeking.pandacode' }, extra: { eas: { projectId: 'upstream-project' } } };
  try {
    process.env.PANDACODE_ANDROID_PREVIEW = '1';
    process.env.PANDACODE_ANDROID_VERSION_CODE = '42';
    const preview = configure({ config: base });
    assert.equal(preview.android.package, 'io.github.norecall.pandacode.zhpreview');
    assert.equal(preview.android.versionCode, 42);
    assert.equal(preview.owner, undefined);
    assert.equal(preview.extra.eas, undefined);
    assert.deepEqual(preview.platforms, ['android']);
    assert.deepEqual(preview.plugins, ['expo-router']);
    assert.deepEqual(preview.ios, base.ios);
    process.env.PANDACODE_ANDROID_VERSION_CODE = '-1';
    assert.throws(() => configure({ config: base }), /version code/);
    delete process.env.PANDACODE_ANDROID_PREVIEW;
    const ordinary = configure({ config: base });
    assert.deepEqual(ordinary.android, base.android);
    assert.equal(ordinary.owner, base.owner);
    assert.deepEqual(ordinary.extra.eas, base.extra.eas);
  } finally {
    if (previous === undefined) delete process.env.PANDACODE_ANDROID_PREVIEW; else process.env.PANDACODE_ANDROID_PREVIEW = previous;
    if (previousCode === undefined) delete process.env.PANDACODE_ANDROID_VERSION_CODE; else process.env.PANDACODE_ANDROID_VERSION_CODE = previousCode;
  }
});
