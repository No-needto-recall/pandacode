import { setLocale } from '../src/i18n.ts';

// Existing protocol/trace assertions exercise the English presentation explicitly.
await setLocale('en');
