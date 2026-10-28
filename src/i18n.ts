import {
  DEFAULT_LOCALE, isLocale, translate,
  formatDate as date, formatNumber as number, formatRelativeTime as relative,
  type Locale, type MessageKey, type Parameters,
} from './i18n-generated/core.ts';

export type { Locale, MessageKey } from './i18n-generated/core.ts';
export const LOCALE_STORAGE_KEY = 'pandacode.locale';
const listeners = new Set<() => void>();

function storedLocale(): Locale {
  try {
    const value = globalThis.localStorage?.getItem(LOCALE_STORAGE_KEY);
    return isLocale(value) ? value : DEFAULT_LOCALE;
  } catch { return DEFAULT_LOCALE; }
}

let locale = storedLocale();
let revision = 0;
let initialization: Promise<void> | undefined;
let saves: Promise<void> = Promise.resolve();
const native = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

function apply(value: Locale) {
  revision++;
  try { globalThis.localStorage?.setItem(LOCALE_STORAGE_KEY, value); } catch { /* Storage may be unavailable in private webviews. */ }
  if (typeof document !== 'undefined') {
    document.documentElement.lang = value;
    const description = document.querySelector('meta[name="description"]');
    description?.setAttribute('content', translate(value, 'common.app.description'));
  }
  if (locale === value) return;
  locale = value;
  for (const listener of listeners) {
    try { listener(); } catch (error) { console.error('Language change listener failed', error); }
  }
}

export function getLocale(): Locale { return locale; }
export function t(key: MessageKey, params?: Parameters): string { return translate(locale, key, params); }
export function formatDate(value: Date | number, options?: Intl.DateTimeFormatOptions): string { return date(locale, value, options); }
export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string { return number(locale, value, options); }
export function formatRelativeTime(value: number, unit: Intl.RelativeTimeFormatUnit): string { return relative(locale, value, unit); }

export function onLocaleChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function setLocale(value: Locale): Promise<void> {
  if (!isLocale(value)) return Promise.reject(new Error('Unsupported locale'));
  const save = async () => {
    if (native()) {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('locale_set', { locale: value });
    }
    apply(value);
  };
  const result = saves.then(save);
  saves = result.catch(() => undefined);
  return result;
}

export function initLocale(): Promise<void> {
  return initialization ??= (async () => {
    apply(locale);
    if (typeof window === 'undefined') return;
    window.addEventListener('storage', event => {
      if (event.key === LOCALE_STORAGE_KEY && isLocale(event.newValue)) apply(event.newValue);
    });
    if (!native()) return;
    const { listen } = await import('@tauri-apps/api/event');
    const unlisten = await listen<Locale>('locale-changed', event => {
      if (isLocale(event.payload)) apply(event.payload);
    });
    window.addEventListener('pagehide', () => { unlisten(); }, { once: true });
    const beforeRead = revision;
    const { invoke } = await import('@tauri-apps/api/core');
    const stored = await invoke<Locale>('locale_get');
    if (revision === beforeRead && isLocale(stored)) apply(stored);
  })();
}
