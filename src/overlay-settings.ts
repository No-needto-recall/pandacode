import { escape as escapeI18n } from './dom.ts';
import { t as tr, onLocaleChange } from './i18n.ts';
import './overlay-settings.css';
import { morph } from './dom';
import { overlayCall, type OverlayPreferences } from './overlay-client';
import { isMac, isWindows } from './platform';
import { infoMark } from './tooltip';
export { syncOverlayContext } from './overlay-client';

export function mountOverlaySettings(host: HTMLElement): () => void {
  host.classList.add('overlay-settings');
  const markup = () => `<div class="settings-group"><div class="setting-row"><div><strong>${escapeI18n(tr('modules.common.quick_launcher'))}</strong><small>${escapeI18n(tr('modules.common.start_tasks_and_check_agents_from_any_app'))}</small></div><input type="checkbox" class="settings-switch" aria-label="${escapeI18n(tr('modules.common.enable_quick_launcher'))}" disabled></div><form class="overlay-shortcut-form"><div class="overlay-shortcut-heading"><label for="overlay-shortcut">${escapeI18n(tr('modules.common.keyboard_shortcut'))}</label>${infoMark(tr('modules.common.use_commandorcontrol_shift_alt_and_a_key_separated_by'), tr('modules.common.shortcut_format'))}<small id="overlay-shortcut-hint" class="sr-only">${escapeI18n(tr('modules.common.use_commandorcontrol_shift_alt_and_a_key_separated_by'))}</small></div><div class="overlay-shortcut-controls"><input id="overlay-shortcut" aria-describedby="overlay-shortcut-hint" spellcheck="false" autocomplete="off" maxlength="100" placeholder="CommandOrControl+Shift+Space" disabled><button class="secondary-button" type="button" data-overlay-record disabled>${escapeI18n(tr('modules.common.record'))}</button><button class="secondary-button" type="submit" disabled>${escapeI18n(tr('modules.common.save'))}</button><button class="secondary-button" type="button" data-overlay-preview disabled>${escapeI18n(tr('modules.common.open'))}</button></div><p class="overlay-settings-status" role="status" hidden></p></form></div>`;
  host.innerHTML = markup();
  const enabled = host.querySelector<HTMLInputElement>('input[type=checkbox]')!;
  const input = host.querySelector<HTMLInputElement>('#overlay-shortcut')!;
  const form = host.querySelector<HTMLFormElement>('form')!;
  const save = host.querySelector<HTMLButtonElement>('button[type=submit]')!;
  const open = host.querySelector<HTMLButtonElement>('[data-overlay-preview]')!;
  const status = host.querySelector<HTMLElement>('[role=status]')!;
  const record = host.querySelector<HTMLButtonElement>('[data-overlay-record]')!;
  let disposed = false, busy = false, recording = false, preparing = false, suspended = false, preferences: OverlayPreferences | null = null;
  let recordingTimeout: number | undefined;
  const message = (value: string, error = false) => { status.textContent = value; status.hidden = !value; status.classList.toggle('error', error); };
  function update(value: OverlayPreferences): void { preferences = value; enabled.checked = value.enabled; input.value = value.shortcut; message(value.error || '', Boolean(value.error)); }
  function controls(): void {
    enabled.disabled = busy || recording || preparing || !preferences;
    input.disabled = busy || preparing || !preferences; input.readOnly = recording;
    save.disabled = busy || recording || preparing || !preferences; open.disabled = save.disabled;
    record.disabled = busy || preparing || !preferences; record.textContent = recording ? tr('modules.common.cancel') : tr('modules.common.record');
  }
  async function endRecording(): Promise<void> {
    recording = false; clearTimeout(recordingTimeout); controls();
    if (suspended) { suspended = false; await overlayCall('overlay_recording',{active:false}); }
  }
  async function beginRecording(): Promise<void> {
    if (recording) { await endRecording(); message(''); return; }
    preparing = true; controls(); message(tr('modules.launcher.preparing'));
    try {
      await overlayCall('overlay_recording',{active:true}); suspended = true;
      if (disposed) { await endRecording(); return; }
      recording = true; preparing = false; controls(); input.focus(); message(tr('modules.launcher.pressShortcut'));
      recordingTimeout = window.setTimeout(() => { void endRecording().catch(error => message(String(error),true)); message(tr('modules.launcher.recordingTimeout')); }, 28000);
    } catch (error) { if (!disposed) message(String(error),true); }
    finally { preparing = false; if (!disposed) controls(); }
  }
  function keydown(event: KeyboardEvent): void {
    if (!recording) return;
    if (event.key === 'Tab' || event.key === 'Escape') {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); }
      void endRecording().catch(error => message(String(error),true)); message(''); return;
    }
    event.preventDefault(); event.stopPropagation();
    if (!event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey) { message(isMac ? tr('modules.launcher.modifiersMac') : tr('modules.launcher.modifiers', { key: isWindows ? 'Windows' : 'Super' })); return; }
    if (!/^(Key[A-Z]|Digit[0-9]|Space|F[1-9][0-9]?|Arrow(?:Up|Down|Left|Right)|Enter|Backspace|Delete|Home|End|PageUp|PageDown)$/.test(event.code)) return;
    const modifiers = [event.metaKey ? isMac ? 'Command' : 'Super' : '',event.ctrlKey ? 'Control' : '',event.altKey ? 'Alt' : '',event.shiftKey ? 'Shift' : ''].filter(Boolean);
    input.value = [...modifiers,event.code].join('+');
    void endRecording().then(() => { if (!disposed) { message(tr('modules.launcher.captured')); save.focus(); } }).catch(error => message(String(error),true));
  }
  function blur(): void { if (recording) void endRecording().catch(error => message(String(error),true)); }

  async function persist(event?: Event): Promise<void> {
    event?.preventDefault(); event?.stopPropagation(); if (busy || recording || !preferences) return;
    busy = true; controls();
    try {
      const next = await overlayCall<OverlayPreferences>('overlay_save_preferences',{enabled:enabled.checked,shortcut:input.value});
      if (!disposed) { update(next); if (!next.error) message(tr('modules.launcher.saved')); }
    } catch (error) { if (!disposed) { enabled.checked = preferences.enabled; message(String(error instanceof Error ? error.message : error), true); } }
    finally { busy = false; if (!disposed) controls(); }
  }
  async function openLauncher(): Promise<void> { try { await overlayCall('overlay_toggle'); } catch (error) { if (!disposed) message(String(error), true); } }
  record.addEventListener('click', beginRecording); input.addEventListener('keydown',keydown); window.addEventListener('blur',blur);
  form.addEventListener('submit', persist); enabled.addEventListener('change', persist); open.addEventListener('click', openLauncher);
  void overlayCall<OverlayPreferences>('overlay_preferences').then(value => { if (!disposed) { update(value); controls(); } }).catch(error => { if (!disposed) message(String(error), true); });
  const disposeLocale = onLocaleChange(() => {
    const next = document.createElement('div'); next.innerHTML = markup();
    const selector = 'strong, .setting-row small, label, .info-mark, #overlay-shortcut-hint';
    const fresh = [...next.querySelectorAll(selector)];
    host.querySelectorAll(selector).forEach((node, index) => { const copy = fresh[index]; if (!copy) return; morph(node, copy.innerHTML, 20); for (const attr of ['aria-label', 'data-tip']) if (copy.hasAttribute(attr)) node.setAttribute(attr, copy.getAttribute(attr)!); });
    enabled.setAttribute('aria-label', tr('modules.common.enable_quick_launcher'));
    save.textContent = tr('modules.common.save'); open.textContent = tr('modules.common.open'); controls();
    if (recording) message(tr('modules.launcher.pressShortcut')); else if (preparing) message(tr('modules.launcher.preparing'));
  });
  return () => { disposed = true; disposeLocale(); void endRecording().catch(error => console.warn('Shortcut restore failed.',error)); record.removeEventListener('click',beginRecording); input.removeEventListener('keydown',keydown); window.removeEventListener('blur',blur); form.removeEventListener('submit', persist); enabled.removeEventListener('change', persist); open.removeEventListener('click', openLauncher); };
}
