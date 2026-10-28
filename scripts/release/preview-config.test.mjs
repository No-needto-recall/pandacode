import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { connectConfiguration } from './preview-config.mjs';

test('preview builds explicitly permit missing Connect but reject partial configuration', () => {
  assert.deepEqual(connectConfiguration({}), { configured: false, relay: '', clientId: '' });
  assert.throws(() => connectConfiguration({ PANDACODE_RELAY_URL: 'https://relay.example.com' }), /both/);
  assert.throws(() => connectConfiguration({ PANDACODE_GITHUB_CLIENT_ID: 'example-client' }), /both/);
});

test('Connect build values are HTTPS origins and public opaque identifiers', () => {
  const valid = { PANDACODE_RELAY_URL: 'https://relay.example.com/', PANDACODE_GITHUB_CLIENT_ID: 'Iv1.example' };
  assert.deepEqual(connectConfiguration(valid), { configured: true, relay: 'https://relay.example.com', clientId: 'Iv1.example' });
  for (const relay of ['http://relay.example.com', 'https://user:password@relay.example.com', 'https://relay.example.com/path', 'https://relay.example.com/?x=1', 'https://relay.example.com/#fragment']) {
    assert.throws(() => connectConfiguration({ ...valid, PANDACODE_RELAY_URL: relay }), /HTTPS origin/);
  }
  assert.throws(() => connectConfiguration({ ...valid, PANDACODE_GITHUB_CLIENT_ID: 'client\nINJECT=value' }), /client ID/);
});

test('Windows preview has its own app data identity and no official update feed', () => {
  const config = JSON.parse(readFileSync(new URL('../../src-tauri/tauri.zh-preview.conf.json', import.meta.url), 'utf8'));
  assert.equal(config.productName, 'PandaCode Zh Preview');
  assert.equal(config.identifier, 'io.github.norecall.pandacode.zhpreview');
  assert.deepEqual(config.plugins.updater.endpoints, []);
  assert.equal(config.bundle.createUpdaterArtifacts, false);
  assert.deepEqual(config.bundle.windows.nsis.languages, ['SimpChinese', 'English']);
});
