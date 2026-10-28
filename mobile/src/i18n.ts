// App-owned text only. Protocol values, prompts and host/tool output are never translated.
// This module has no native imports, so formatters and store selectors can also run in Node.
import { createStore } from 'zustand/vanilla';
import { translate, formatDate, formatNumber, formatRelativeTime, type Locale, type MessageKey } from './i18n-generated/core.ts';

export type { Locale, MessageKey };
export const localeStore = createStore<{ locale: Locale; ready: boolean }>(() => ({ locale: 'zh-CN', ready: false }));
export const getLocale = () => localeStore.getState().locale;
export const normalizeLocale = (value: unknown): Locale => value === 'en' ? 'en' : 'zh-CN';
export const t = (key: MessageKey, params?: Record<string, string | number>) => translate(getLocale(), key, params);
export const date = (value: Date | number, options?: Intl.DateTimeFormatOptions) => formatDate(getLocale(), value, options);
export const number = (value: number, options?: Intl.NumberFormatOptions) => formatNumber(getLocale(), value, options);
export const relativeTime = (value: number, unit: Intl.RelativeTimeFormatUnit) => formatRelativeTime(getLocale(), value, unit);

/** Used by settings and tests; does not recreate navigation, connections or draft stores. */
export function setRuntimeLocale(locale: Locale) { localeStore.setState({ locale, ready: true }); }

const COUNT_KEYS = {
  step: ['mobile.count.step_one', 'mobile.count.step_many'],
  worker: ['mobile.count.worker_one', 'mobile.count.worker_many'],
  file: ['mobile.count.file_one', 'mobile.count.file_many'],
  changed_file: ['mobile.count.changed_file_one', 'mobile.count.changed_file_many'],
  command: ['mobile.count.command_one', 'mobile.count.command_many'],
  search: ['mobile.count.search_one', 'mobile.count.search_many'],
  page: ['mobile.count.page_one', 'mobile.count.page_many'],
  plan: ['mobile.count.plan_one', 'mobile.count.plan_many'],
  agent: ['mobile.count.agent_one', 'mobile.count.agent_many'],
  skill: ['mobile.count.skill_one', 'mobile.count.skill_many'],
  tool: ['mobile.count.tool_one', 'mobile.count.tool_many'],
} as const;
export type CountKind = keyof typeof COUNT_KEYS;
export const countNoun = (count: number, kind: CountKind) => t(COUNT_KEYS[kind][count === 1 ? 0 : 1], { count });

/** These exact app error codes stay English for retries; only their UI presentation is localized. */
const APP_ERRORS: Readonly<Record<string, MessageKey>> = {
  "This phone was signed out of PandaCode Connect.": 'mobile.text.this_phone_was_signed_out_of_pandacode_connect',
  "The relay has another key for this device.": 'mobile.text.the_relay_has_another_key_for_this_device',
  "Sign in to PandaCode Connect first.": 'mobile.text.sign_in_to_pandacode_connect_first',
  "PandaCode Connect is not configured in this build.": 'mobile.text.pandacode_connect_is_not_configured_in_this_build',
  "The relay did not confirm that the account was deleted.": 'mobile.text.the_relay_did_not_confirm_that_the_account_was_deleted',
  "That computer is offline.": 'mobile.text.that_computer_is_offline',
  "Too many requests to that computer. Try again in a moment.": 'mobile.text.too_many_requests_to_that_computer_try_again_in_a_moment',
  "The connection to the relay was lost.": 'mobile.text.the_connection_to_the_relay_was_lost',
  "Not connected to the relay.": 'mobile.text.not_connected_to_the_relay',
  "That computer did not answer in time.": 'mobile.text.that_computer_did_not_answer_in_time',
  "That computer's reply was stale or repeated. Update PandaCode on both computers and check their clocks.": 'mobile.text.that_computer_s_reply_was_stale_or_repeated_update_pandacode_on_both_computers_and_check_t',
  "This form format is not supported here. Cancel to let the agent continue.": 'mobile.text.this_form_format_is_not_supported_here_cancel_to_let_the_agent_continue',
};
export function errorText(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error ?? '');
  const key = Object.hasOwn(APP_ERRORS, text) ? APP_ERRORS[text] : undefined;
  return key ? t(key) : text;
}

const STATUS_KEYS: Readonly<Record<string, MessageKey>> = {
  running: 'mobile.text.working', working: 'mobile.text.working', waiting: 'mobile.text.waiting', completed: 'mobile.text.completed', done: 'mobile.text.done',
  failed: 'mobile.text.failed', failure: 'mobile.text.failed', error: 'mobile.text.error', stopped: 'mobile.text.stopped', queued: 'mobile.text.queued', paused: 'mobile.text.paused',
  skipped: 'mobile.text.skipped', pending: 'mobile.text.waiting', active: 'mobile.text.in_progress', success: 'mobile.text.done', idle: 'mobile.text.finished',
};
/** Render known product status identifiers without changing their protocol values. */
export const statusText = (status: string) => Object.hasOwn(STATUS_KEYS, status) ? t(STATUS_KEYS[status]) : status;
const ATTACHMENT_KEYS: Readonly<Record<string, MessageKey>> = {
  'Attached image': 'mobile.text.attached_image', 'Attached mockup': 'mobile.attachment.mockup', 'Attached browser screenshot': 'mobile.text.screenshot',
  'Document context': 'mobile.attachment.document', 'Folder context': 'mobile.attachment.folder', 'File context': 'mobile.attachment.file',
};
export const attachmentKindText = (kind: string) => Object.hasOwn(ATTACHMENT_KEYS, kind) ? t(ATTACHMENT_KEYS[kind]) : kind;

const EFFORT_KEYS: Readonly<Record<string, MessageKey>> = {
  default: 'mobile.effort.default',
  auto: 'mobile.effort.auto',
  none: 'mobile.effort.none',
  minimal: 'mobile.effort.minimal',
  low: 'mobile.effort.low',
  medium: 'mobile.effort.medium',
  high: 'mobile.effort.high',
  xhigh: 'mobile.effort.xhigh',
  max: 'mobile.effort.max',
};
export const effortText = (id: string, fallback: string) => Object.hasOwn(EFFORT_KEYS, id) ? t(EFFORT_KEYS[id]) : fallback;
