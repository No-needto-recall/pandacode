import { escape as escapeI18n } from './dom.ts';
import { t as tr, onLocaleChange } from './i18n.ts';
import { preview } from './bridge';
import { icon, morph } from './dom';
import { appUpdates, describeUpdate, type UpdateMode } from './app-updates';

/** Public project links. Opening one is user-initiated; only the update check runs on its own. */
export const PROJECT_LINKS = {
  repository: 'https://github.com/aicodeking/pandacode',
  issues: 'https://github.com/aicodeking/pandacode/issues',
  releases: 'https://github.com/aicodeking/pandacode/releases',
  license: 'https://github.com/aicodeking/pandacode/blob/main/LICENSE',
} as const;

const link = (label: string, url: string) =>
  `<button type="button" class="secondary-button" data-action="open-url" data-url="${url}">${label}${icon('forward')}</button>`;

/** The About group: app version, license, updates from GitHub Releases, and links. */
export function aboutSettingsHtml(): string {
  return `<div class="settings-group settings-about" aria-labelledby="settings-about-heading">
    <div class="setting-row"><div><strong id="settings-about-heading">${escapeI18n(tr('modules.common.about_pandacode'))}</strong><small class="settings-about-version">${escapeI18n(tr('modules.common.version'))}</small></div></div>
    <div class="setting-row"><div><strong>${escapeI18n(tr('modules.common.license'))}</strong><small>${escapeI18n(tr('modules.common.open_source_mit_based_no_account_no_telemetry'))}</small></div>${link(tr('modules.about.license'), PROJECT_LINKS.license)}</div>
    <div class="setting-row settings-updates"><div><strong>${escapeI18n(tr('modules.common.updates'))}</strong><small class="settings-update-status" aria-live="polite">${escapeI18n(tr('modules.common.checks_github_releases_automatically'))}</small></div><div class="settings-row-actions"><button type="button" class="secondary-button settings-update-action" hidden></button>${link(tr('modules.about.releases'), PROJECT_LINKS.releases)}</div></div>
    <div class="setting-row settings-updates-auto"><div><strong>${escapeI18n(tr('modules.common.update_mode'))}</strong><small>${escapeI18n(tr('modules.common.automatic_restarts_when_no_agent_is_working_notify_me_asks_first'))}</small></div><select class="settings-select" data-update-mode aria-label="${escapeI18n(tr('modules.common.update_mode'))}"><option value="automatic">${escapeI18n(tr('modules.common.automatic'))}</option><option value="notify">${escapeI18n(tr('modules.common.notify_me'))}</option><option value="off">${escapeI18n(tr('modules.common.off'))}</option></select></div>
    <div class="setting-row"><div><strong>${escapeI18n(tr('modules.common.source_code'))}</strong><small>${escapeI18n(tr('modules.common.report_bugs_and_follow_development'))}</small></div><div class="settings-row-actions">${link(tr('modules.about.repository'), PROJECT_LINKS.repository)}${link(tr('modules.about.issues'), PROJECT_LINKS.issues)}</div></div>
    <div class="setting-row"><div><strong>${escapeI18n(tr('common.forkLabel'))}</strong><small>This is a fork of PandaCode</small></div><div class="settings-row-actions">${link('PandaCode', PROJECT_LINKS.repository)}${link(tr('common.forkSource'), 'https://github.com/No-needto-recall/pandacode/tree/feat/zh-cn-localization')}</div></div>
  </div>`;
}

/** Reads the bundle version from Tauri; the browser preview has no app bundle. */
async function appVersion(): Promise<string> {
  if (preview) return 'Preview';
  return (await import('@tauri-apps/api/app')).getVersion();
}

export function mountAboutSettings(host: HTMLElement): () => void {
  const version = host.querySelector<HTMLElement>('.settings-about-version');
  let disposed = false, versionValue: string | null = null, versionError = false;
  const cleanupUpdates = mountUpdates(host);
  const paintVersion = () => { if (version) version.textContent = versionError ? tr('modules.common.version_unavailable') : versionValue !== null ? tr('modules.about.version', { version: preview ? tr('modules.common.preview') : versionValue }) : tr('modules.common.version'); };
  const disposeLocale = onLocaleChange(() => {
    const next = document.createElement('div'); next.innerHTML = aboutSettingsHtml();
    if (!host.querySelector('.settings-updates-auto')) next.querySelector('.settings-updates-auto')?.remove();
    const selector = 'strong, small:not([class]), button[data-url], option';
    const fresh = [...next.querySelectorAll(selector)];
    host.querySelectorAll(selector).forEach((element, index) => { if (fresh[index]) morph(element, fresh[index].innerHTML, 20); });
    host.querySelector('[data-update-mode]')?.setAttribute('aria-label', tr('modules.common.update_mode'));
    paintVersion();
  });
  if (version) {
    appVersion()
      .then(value => { versionValue = value; if (!disposed) paintVersion(); })
      .catch(() => { versionError = true; if (!disposed) paintVersion(); });
  }
  return () => { disposed = true; disposeLocale(); cleanupUpdates(); };
}

/** The Updates rows follow the updater: status, Check now / Install / Restart now, and the mode. */
function mountUpdates(host: HTMLElement): () => void {
  const updates = appUpdates();
  const status = host.querySelector<HTMLElement>('.settings-update-status')!;
  const action = host.querySelector<HTMLButtonElement>('.settings-update-action')!;
  const modeSelect = host.querySelector<HTMLSelectElement>('[data-update-mode]')!;
  if (!updates?.supported) {
    status.textContent = describeUpdate({ kind: 'off' }, 'off');
    host.querySelector<HTMLElement>('.settings-updates-auto')?.remove();
    return onLocaleChange(() => { status.textContent = describeUpdate({ kind: 'off' }, 'off'); });
  }
  const paint = () => {
    const state = updates.state;
    status.textContent = describeUpdate(state, updates.mode, Date.now(), updates.installable);
    modeSelect.value = updates.mode;
    const restartable = updates.installable && (state.kind === 'ready' || state.kind === 'available');
    action.hidden = state.kind === 'downloading' || state.kind === 'installing';
    action.disabled = state.kind === 'checking';
    action.textContent = restartable ? (state.kind === 'ready' ? tr('modules.common.restart_now') : tr('modules.common.install')) : tr('modules.common.check_now');
  };
  const click = () => { void (updates.installable && (updates.state.kind === 'ready' || updates.state.kind === 'available') ? updates.restart() : updates.check()); };
  const change = () => updates.setMode(modeSelect.value as UpdateMode);
  action.addEventListener('click', click);
  modeSelect.addEventListener('change', change);
  const unsubscribe = updates.subscribe(paint);
  const disposeLocale = onLocaleChange(paint);
  paint();
  return () => { disposeLocale(); unsubscribe(); action.removeEventListener('click', click); modeSelect.removeEventListener('change', change); };
}
