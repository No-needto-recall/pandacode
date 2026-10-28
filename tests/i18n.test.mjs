import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generate, validateCatalog } from '../scripts/i18n/generate.mjs';
import { DEFAULT_LOCALE, isLocale, translate, formatDate, formatNumber, formatRelativeTime } from '../src/i18n-generated/core.ts';
import { messages } from '../src/i18n-generated/messages.ts';
import { getLocale, setLocale, onLocaleChange, t } from '../src/i18n.ts';

const pair = (en, zh) => ({ en, 'zh-CN': zh });

test('localization defaults to Simplified Chinese and accepts only supported locales', () => {
  assert.equal(DEFAULT_LOCALE, 'zh-CN');
  assert.equal(isLocale('zh-CN'), true);
  assert.equal(isLocale('en'), true);
  for (const value of [null, undefined, 'zh', 'auto', 'en-US', '<script>']) assert.equal(isLocale(value), false);
});

test('all localized messages have matching keys and placeholders', () => {
  validateCatalog(messages);
  assert.equal(translate('zh-CN', 'common.save'), '保存');
  assert.equal(translate('en', 'common.save'), 'Save');
  assert.equal(translate('zh-CN', 'unknown.message'), 'unknown.message');
  for (const [key, entry] of Object.entries(messages)) {
    const names = [...entry.en.matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/g)].map(match => match[1]);
    const params = Object.fromEntries(names.map(name => [name, '<script>{原样}&"中文</script>']));
    for (const locale of ['en', 'zh-CN']) {
      const result = translate(locale, key, params);
      for (const name of names) assert.ok(!result.includes(`{${name}}`), `${key}: unresolved ${name}`);
      if (names.length) assert.ok(result.includes('<script>{原样}&"中文</script>'), `${key}: translation must return plain text without escaping or recursive interpolation`);
    }
  }
});

test('catalog validation rejects missing translations and mismatched parameters', () => {
  assert.throws(() => validateCatalog({ 'test.value': pair('Value {name}', '值') }), /placeholder mismatch/);
  assert.throws(() => validateCatalog({ 'test.value': pair('Value', '') }), /nonempty/);
  assert.throws(() => validateCatalog({ 'test.value': { en: 'Value' } }), /nonempty/);
  assert.throws(() => validateCatalog({ 'bad key': pair('Value', '值') }), /invalid message key/);
});

test('date, number and relative time follow the selected app language', () => {
  const time = new Date('2026-01-02T12:34:00Z');
  const options = { timeZone: 'UTC', year: 'numeric', month: 'long', day: 'numeric' };
  assert.equal(formatDate('zh-CN', time, options), '2026年1月2日');
  assert.equal(formatDate('en', time, options), 'January 2, 2026');
  assert.equal(formatNumber('zh-CN', 1234.5), '1,234.5');
  assert.equal(formatRelativeTime('zh-CN', -1, 'day'), '昨天');
  assert.equal(formatRelativeTime('en', -1, 'day'), 'yesterday');
  assert.equal(formatDate('zh-CN', new Date(NaN)), '无效日期');
  assert.equal(formatDate('en', Number.MAX_VALUE), 'Invalid Date');
});

test('changing language notifies once, preserves order and permits disposal', async () => {
  await setLocale('en');
  const values = [];
  const dispose = onLocaleChange(() => values.push(getLocale()));
  try {
    await Promise.all([setLocale('zh-CN'), setLocale('en'), setLocale('en')]);
    assert.deepEqual(values, ['zh-CN', 'en']);
    assert.equal(t('common.save'), 'Save');
    dispose();
    await setLocale('zh-CN');
    assert.deepEqual(values, ['zh-CN', 'en']);
    await assert.rejects(setLocale('unsupported'), /Unsupported locale/);
    assert.equal(getLocale(), 'zh-CN');
  } finally {
    dispose();
    await setLocale('en');
  }
});

test('checked-in client dictionaries match their shared sources', async () => {
  await generate({ check: true });
});

test('generation is deterministic, scoped per client and checks stale output', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pandacode-i18n-'));
  try {
    await mkdir(join(directory, 'shared/i18n/catalogs'), { recursive: true });
    await writeFile(join(directory, 'shared/i18n/core.ts'), 'export const test = true;\n');
    for (const [name, catalog] of [
      ['common', { 'common.test': pair('Shared', '共用') }],
      ['desktop-shell', { 'shell.test': pair('Desktop', '桌面') }],
      ['mobile', { 'mobile.test': pair('Phone', '手机') }],
    ]) await writeFile(join(directory, `shared/i18n/catalogs/${name}.json`), JSON.stringify(catalog));
    assert.equal((await generate({ directory })).changed.length, 4);
    assert.equal((await generate({ directory, check: true })).changed.length, 0);
    for (const path of ['shared/i18n/core.ts', 'src/i18n-generated/core.ts', 'src/i18n-generated/messages.ts', 'mobile/src/i18n-generated/core.ts', 'mobile/src/i18n-generated/messages.ts']) {
      const full = join(directory, path);
      await writeFile(full, (await readFile(full, 'utf8')).replace(/\n/g, '\r\n'));
    }
    assert.equal((await generate({ directory, check: true })).changed.length, 0);
    const desktop = await readFile(join(directory, 'src/i18n-generated/messages.ts'), 'utf8');
    const mobile = await readFile(join(directory, 'mobile/src/i18n-generated/messages.ts'), 'utf8');
    assert.match(desktop, /shell.test/);
    assert.doesNotMatch(desktop, /mobile.test/);
    assert.match(mobile, /mobile.test/);
    assert.doesNotMatch(mobile, /shell.test/);
    await writeFile(join(directory, 'src/i18n-generated/core.ts'), 'stale');
    await assert.rejects(generate({ directory, check: true }), /stale/);
    await generate({ directory });
    await writeFile(join(directory, 'shared/i18n/catalogs/desktop-extra.json'), JSON.stringify({ 'common.test': pair('Duplicate', '重复') }));
    await assert.rejects(generate({ directory }), /duplicate/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
