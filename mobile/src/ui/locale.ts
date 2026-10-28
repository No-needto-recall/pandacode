import { useStore } from 'zustand';
import { get, set } from '../connect/secrets.ts';
import { localeStore } from '../i18n.ts';
import { createLocalePreference } from '../locale-preference.ts';

const KEY = 'language';
const preference = createLocalePreference({ read: () => get(KEY), write: locale => set(KEY, locale) });
export const useLocale = () => useStore(localeStore, state => state.locale);
export const useLocaleReady = () => useStore(localeStore, state => state.ready);
export const setLocale = preference.choose;
/** Loaded before the first screen mounts; no navigation keys or connection resets on a switch. */
export const loadLocale = preference.load;
