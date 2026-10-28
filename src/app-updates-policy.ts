import { t as tr } from './i18n.ts';
/* The updater's decisions, kept free of app imports so they can be tested on their own:
 * how often to check, when a downloaded update may restart PandaCode, and how Settings
 * describes each state. */
export type UpdateState =
  | { kind: 'off' }
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'current'; checkedAt: number }
  | { kind: 'available'; version: string }
  | { kind: 'downloading'; version: string; percent: number | null }
  | { kind: 'ready'; version: string }
  | { kind: 'installing'; version: string }
  | { kind: 'error'; message: string };

/** Automatic installs when idle; Notify checks and asks first; Off checks only on request. */
export type UpdateMode = 'automatic' | 'notify' | 'off';

export const CHECK_EVERY = 6 * 60 * 60 * 1000;
/** A downloaded update installs after this long without input, when no agent is working. */
export const IDLE_BEFORE_RESTART = 2 * 60 * 1000;

/** The saved preference; the old boolean saved 'on'/'off', and unset meant automatic. */
export function parseUpdateMode(saved: string | null): UpdateMode {
  return saved === 'off' || saved === 'notify' ? saved : 'automatic';
}

/** Whether a found update downloads by itself. A copy that can't install in place (a
 * Linux run outside an AppImage) only ever reports it. */
export function downloadsOnItsOwn(mode: UpdateMode, installable: boolean): boolean {
  return mode === 'automatic' && installable;
}

/** Whether a downloaded update may install now: nothing running, and the user stepped away. */
export function readyToRestart(busy: boolean, lastInput: number, now = Date.now()): boolean {
  return !busy && now - lastInput >= IDLE_BEFORE_RESTART;
}

/** Whether a downloaded update restarts PandaCode now: on its own only in Automatic, or once
 * the user clicked Install and restart; never while an agent is working. */
export function restartNow(mode: UpdateMode, approved: boolean, busy: boolean, lastInput: number, now = Date.now()): boolean {
  if (busy) return false;
  return approved || (mode === 'automatic' && readyToRestart(busy, lastInput, now));
}

/** The status-bar prompt for a state: Install and restart for a found update (unless
 * dismissed with Later), Restart to update once downloaded. Null hides it. */
export function updatePrompt(state: UpdateState, installable: boolean, dismissed: string | null): { label: string; title: string; later: boolean } | null {
  switch (state.kind) {
    case 'available':
      if (state.version === dismissed) return null;
      return installable
        ? { label: tr('modules.common.install_and_restart'), title: tr('modules.updates.availableInstall', { version: state.version }), later: true }
        : { label: tr('modules.updates.availableVersion', { version: state.version }), title: tr('modules.updates.availableManual', { version: state.version }), later: true };
    case 'ready': return { label: tr('modules.common.restart_to_update'), title: tr('modules.updates.readyPrompt', { version: state.version }), later: false };
    case 'installing': return { label: tr('modules.common.restart_to_update'), title: tr('modules.updates.installing', { version: state.version }), later: false };
    default: return null;
  }
}

/** One line for Settings → About. */
export function describeUpdate(state: UpdateState, mode: UpdateMode, now = Date.now(), installable = true): string {
  switch (state.kind) {
    case 'off': return tr('modules.updates.desktop');
    case 'checking': return tr('modules.updates.checking');
    case 'current': {
      const minutes = Math.round((now - state.checkedAt) / 60_000);
      const time = minutes < 1 ? tr('modules.time.justNow') : minutes < 60 ? tr('modules.time.minutesAgo', { count: minutes }) : tr('modules.time.hoursAgo', { count: Math.round(minutes / 60) });
      return tr('modules.updates.current', { time });
    }
    case 'available': return installable ? tr('modules.updates.available', { version: state.version }) : tr('modules.updates.package', { version: state.version });
    case 'downloading': return state.percent === null ? tr('modules.updates.downloading', { version: state.version }) : tr('modules.updates.downloadPercent', { version: state.version, percent: state.percent });
    case 'ready': return mode === 'automatic' ? tr('modules.updates.readyAuto', { version: state.version }) : tr('modules.updates.ready', { version: state.version });
    case 'installing': return tr('modules.updates.installing', { version: state.version });
    case 'error': return tr('modules.updates.error', { error: state.message });
    default: return mode === 'off' ? tr('modules.updates.off') : tr('modules.updates.auto');
  }
}
