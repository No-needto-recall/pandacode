import { normalizeLocale, setRuntimeLocale, type Locale } from './i18n.ts';

export interface LocaleStorage {
  read(): Promise<string | null>;
  write(locale: Locale): Promise<void>;
}

/** Persistence is separate from native SecureStore so startup and write races can be tested. */
export function createLocalePreference(storage: LocaleStorage) {
  let revision = 0;
  let loading: Promise<void> | undefined;
  let saving = Promise.resolve();
  return {
    choose(locale: Locale) {
      revision++;
      setRuntimeLocale(locale);
      // Quick repeated taps cannot let an older write finish after a newer one.
      saving = saving.catch(() => undefined).then(() => storage.write(locale));
      void saving.catch(() => undefined);
    },
    load(): Promise<void> {
      loading ??= (async () => {
        const ticket = revision;
        const stored = await storage.read().catch(() => null);
        // A settings change made while storage reads must win.
        if (ticket === revision) setRuntimeLocale(normalizeLocale(stored));
      })();
      return loading;
    },
    /** Testable completion boundary; settings do not need to await disk writes. */
    saved: () => saving.catch(() => undefined),
  };
}
