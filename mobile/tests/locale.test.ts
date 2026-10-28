/// <reference types="node" />
import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { attachmentKindText, effortText, statusText, date, errorText, getLocale, localeStore, normalizeLocale, number, relativeTime, setRuntimeLocale, t } from '../src/i18n.ts';
import { createLocalePreference } from '../src/locale-preference.ts';
import { elapsedLabel, glanceOf } from '../src/store/inbox.ts';
import { applyEvent, idleLive } from '../src/store/reduce.ts';
import { describeTool, summarizeTools } from '../src/store/trace.ts';
import { ownSentence } from '../src/store/pandacode-tools.ts';
import { headline, summarize } from '../src/live/summary.ts';
import { duration } from '../src/store/turns.ts';
import { parseAttachments, bubbleAttachments } from '../src/store/attachments.ts';

beforeEach(() => localeStore.setState({ locale: 'zh-CN', ready: false }));

test('display allowlists do not resolve inherited object properties', () => {
  for (const text of ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'Unrecognized host text']) {
    assert.equal(errorText(text), text);
    assert.equal(errorText(new Error(text)), text);
    assert.equal(statusText(text), text);
    assert.equal(attachmentKindText(text), text);
    assert.equal(effortText(text, `Custom ${text}`), `Custom ${text}`);
  }
  assert.equal(statusText('running'), '正在处理');
  assert.equal(attachmentKindText('Document context'), '文档上下文');
  assert.equal(effortText('medium', 'Medium'), '中');
});

test('Chinese is the default, unknown settings fall back and placeholders preserve user text', () => {
  assert.equal(getLocale(), 'zh-CN');
  assert.equal(normalizeLocale('en'), 'en');
  assert.equal(normalizeLocale('fr'), 'zh-CN');
  assert.equal(t('mobile.text.new_task'), '新建任务');
  assert.equal(t('mobile.bot.message', { name: 'User {name} <b>工作</b>' }), '向 User {name} <b>工作</b> 发送消息…');
  setRuntimeLocale('en');
  assert.equal(t('mobile.text.new_task'), 'New task');
});

test('locale loads once and an in-flight load cannot overwrite a user choice', async () => {
  let reads = 0;
  let resolve!: (value: string | null) => void;
  const writes: string[] = [];
  const preference = createLocalePreference({ read: () => { reads++; return new Promise(r => { resolve = r; }); }, write: async value => { writes.push(value); } });
  const first = preference.load();
  assert.equal(localeStore.getState().ready, false);
  assert.equal(preference.load(), first);
  preference.choose('en');
  resolve('zh-CN');
  await first;
  await preference.saved();
  assert.equal(reads, 1);
  assert.equal(getLocale(), 'en');
  assert.equal(localeStore.getState().ready, true);
  assert.deepEqual(writes, ['en']);
});

test('missing or unreadable preference starts Chinese; saved English loads before ready', async () => {
  const broken = createLocalePreference({ read: async () => { throw new Error('locked'); }, write: async () => {} });
  await broken.load();
  assert.equal(getLocale(), 'zh-CN');
  assert.equal(localeStore.getState().ready, true);
  localeStore.setState({ ready: false });
  await createLocalePreference({ read: async () => 'en', write: async () => {} }).load();
  assert.equal(getLocale(), 'en');
  assert.equal(localeStore.getState().ready, true);
});

test('rapid changes serialize disk writes and recover after a failed save', async () => {
  const writes: string[] = [];
  let release!: () => void;
  const preference = createLocalePreference({ read: async () => null, write: async value => {
    writes.push(value);
    if (writes.length === 1) { await new Promise<void>(r => { release = r; }); throw new Error('storage failed'); }
  } });
  preference.choose('en');
  preference.choose('zh-CN');
  await Promise.resolve(); await Promise.resolve();
  assert.deepEqual(writes, ['en']);
  release();
  await preference.saved();
  assert.deepEqual(writes, ['en', 'zh-CN']);
  assert.equal(getLocale(), 'zh-CN');
});

test('trace tables, elapsed time and live activities update without re-importing modules', () => {
  const tool = { name: 'Read', status: 'running' as const, input: '{"file_path":"Hello World.ts"}' };
  assert.equal(describeTool(tool).verb, '正在读取');
  assert.equal(describeTool(tool).chip, 'Hello World.ts');
  assert.equal(ownSentence('dispatch_workers', { assignments: [{}, {}] }, false)?.object, '2 个工作智能体');
  assert.match(summarizeTools([{ name: 'Bash', status: 'completed' }]), /1 条命令/);
  assert.equal(elapsedLabel(65 * 60_000), '1 小时 5 分钟');
  assert.equal(duration(41_000), '41 秒');
  assert.match(headline(3, 2), /3 个活跃智能体.*2 项待处理/);
  const inbox = { running: [], needs: [], recent: [], unsent: [], snoozed: [], settled: [] };
  assert.equal(summarize(inbox, new Set(), '09:41', '').summary.labels.approval, '批准');
  setRuntimeLocale('en');
  assert.equal(describeTool(tool).verb, 'Reading');
  assert.equal(elapsedLabel(65 * 60_000), '1h 5m');
  assert.equal(summarize(inbox, new Set(), '09:41', '').summary.labels.approval, 'Approval');
});

test('app status keys re-render, while host text and attachment protocol headers stay untouched', () => {
  const live = applyEvent(idleLive(), { sessionId: 'test', kind: 'text', text: 'Untranslated user output' }, 1);
  assert.equal(glanceOf(live).activity, '正在生成回复');
  setRuntimeLocale('en');
  assert.equal(glanceOf(live).activity, 'Generating response');
  setRuntimeLocale('zh-CN');
  const host = applyEvent(live, { sessionId: 'test', kind: 'status', text: 'Host original output' }, 2);
  assert.equal(glanceOf(host).activity, 'Host original output');
  assert.equal(errorText('Unrecognized host error'), 'Unrecognized host error');
  assert.equal(errorText(new Error('That computer is offline.')), '此电脑已离线。');
  assert.equal(bubbleAttachments(undefined, 'Prompt\n\nDocument context: foo.txt\nHello').chips[0]?.kind, 'Document context');
  assert.equal(parseAttachments([{ id: 'a', kind: 'image', name: 'user.png', mime: 'image/png' }])?.[0]?.name, 'user.png');
});

test('formatters use the selected app locale, independent of the OS locale', () => {
  const value = new Date('2026-10-28T12:00:00Z');
  assert.equal(date(value, { dateStyle: 'long', timeZone: 'UTC' }), new Intl.DateTimeFormat('zh-CN', { dateStyle: 'long', timeZone: 'UTC' }).format(value));
  assert.equal(number(1234.5), new Intl.NumberFormat('zh-CN').format(1234.5));
  assert.equal(relativeTime(-1, 'day'), '昨天');
  setRuntimeLocale('en');
  assert.equal(relativeTime(-1, 'day'), 'yesterday');
});

test('root loads language before connecting and switches without remounting navigation', () => {
  const root = readFileSync(new URL('../src/app/_layout.tsx', import.meta.url), 'utf8');
  assert.match(root, /loadLocale\(\)\.then\(\(\) => connect\.init\(\)\)/);
  assert.match(root, /if \(!ready \|\| !localeReady\) return null/);
  assert.doesNotMatch(root, /key=\{(?:locale|language)\}/);
  const widget = readFileSync(new URL('../src/live/PandaActivity.tsx', import.meta.url), 'utf8');
  assert.match(widget, /label: props\.labels\.approval/);
  assert.doesNotMatch(widget, /msg\(|useLocale\(/);
  const settings = readFileSync(new URL('../src/app/\(tabs\)/settings/index.tsx', import.meta.url), 'utf8');
  assert.match(settings, /setLocale\(language\.id\)/);
  assert.match(settings, /accessibilityRole="radio"/);
});
