import { getLocale } from './i18n.ts';
import { escape as escapeI18n } from './dom.ts';
import { t as tr, onLocaleChange } from './i18n.ts';
/* Settings → Remote access: sign in with GitHub, allow this computer to be driven, and
 * manage the account's devices and what each may do (scoped pairing, remote/grants.rs).
 * Nothing reaches the network until the user signs in. */
import './remote-settings.css';
import { escape, icon } from './dom';
import { infoMark } from './tooltip';
import { APPROVE_SCOPES, SCOPE_HELP, SCOPE_LABELS, groupFingerprint, type DeviceGrant, type GrantScope, type PairCode } from './remote-pairing-prompt';
import type { RemoteDevice, RemoteHost, RemoteSignIn, RemoteStatus } from './remote-types';

const FULL_TIP = () => tr('modules.remote.full_tip');
const ALLOW_TIP = () => tr('modules.remote.allow_tip');
const NOTIFY_TIP = () => tr('modules.remote.notify_tip');
const KEY_TIP = () => tr('modules.remote.key_tip');
const CODE_TIP = () => tr('modules.remote.code_tip');
const PAIR_TIP = () => tr('modules.remote.pair_tip');

const scopeOptions = (selected: GrantScope, waiting: string) => [...(selected === 'pending' ? [{ id: 'pending', label: waiting }] : []), ...APPROVE_SCOPES, { id: 'blocked', label: tr('modules.common.blocked') }]
  .map(scope => `<option value="${scope.id}"${scope.id === selected ? ' selected' : ''}>${scope.label}</option>`).join('');
const pickOptions = (selected: string) => APPROVE_SCOPES.map(scope => `<option value="${scope.id}"${scope.id === selected ? ' selected' : ''}>${scope.label}</option>`).join('');
const groupCode = (code: string) => code.length > 3 ? `${code.slice(0, 3)} ${code.slice(3)}` : code;

export function mountRemoteSettings(root: HTMLElement, host: RemoteHost): () => void {
  let status: RemoteStatus | undefined, devices: RemoteDevice[] = [], grants: DeviceGrant[] = [], error = '', statusError = '', devicesError = '', grantsError = '', devicesLoaded = false, loading = true, code: RemoteSignIn | undefined, expires = 0, signingIn = false, disposed = false, attempt = 0;
  let pairCode: PairCode | undefined, codeScope: GrantScope = 'control', pairTarget = '', pairInput = '', pairing = false, expiry: number | undefined;
  const picks: Record<string, string> = {};
  const message = (e: unknown) => e instanceof Error ? e.message : String(e);
  const fail = (e: unknown) => { error = message(e); render(); };
  const failure = (title: string, detail: string) => `<div class="remote-load-error" role="alert">${icon('alert')}<span><strong>${escape(title)}</strong><small>${escape(detail)}</small></span><button type="button" class="secondary-button" data-retry>${escapeI18n(tr('modules.common.retry'))}</button></div>`;
  const grantOf = (id: string) => grants.find(grant => grant.deviceId === id);

  function deviceRow(device: RemoteDevice): string {
    const grant = device.current ? undefined : grantOf(device.id);
    const waiting = grant?.scope === 'pending' && grant.requested;
    const revoke = device.current ? '' : `<button type="button" class="secondary-button" data-revoke="${escape(device.id)}" aria-label="${escape(tr('modules.remote.revoke', { name: device.name }))}">${escapeI18n(tr('modules.common.revoke'))}</button>`;
    const access = !grant ? '' : waiting
      ? `<select data-pick="${escape(device.id)}" aria-label="${escape(tr('modules.remote.approveAs', { name: device.name }))}">${pickOptions(picks[device.id] ?? 'control')}</select><button type="button" class="primary-button" data-approve="${escape(device.id)}" aria-label="${escape(tr('modules.remote.approve', { name: device.name }))}">${escapeI18n(tr('modules.common.approve'))}</button><button type="button" class="secondary-button" data-block="${escape(device.id)}" aria-label="${escape(tr('modules.remote.block', { name: device.name }))}">${escapeI18n(tr('modules.common.block'))}</button>`
      : `<select data-grant="${escape(device.id)}" aria-label="${escape(tr('modules.remote.access', { name: device.name }))}">${scopeOptions(grant.scope, tr('modules.remote.notApproved'))}</select>`;
    const detail = waiting ? escape(tr('modules.remote.pendingDevice', { platform: device.platform, key: groupFingerprint(device.fingerprint) })) : escape(device.host ? tr('modules.remote.deviceEnabled', { platform: device.platform, key: device.fingerprint }) : tr('modules.remote.deviceDisabled', { platform: device.platform, key: device.fingerprint }));
    return `<div class="setting-row remote-device${waiting ? ' remote-pending' : ''}" data-device="${escape(device.id)}"><div><strong><span class="remote-dot" data-online="${device.online}" role="img" aria-label="${device.online ? tr('modules.remote.online') : tr('modules.remote.offline')}"></span>${escape(device.name)}${device.current ? ` <span class="remote-badge">${escapeI18n(tr('modules.common.this_computer'))}</span>` : ''}</strong><small>${detail}</small></div><span class="remote-device-actions">${access}${revoke}</span></div>`;
  }
  function deviceList(): string {
    if (devicesError) return failure(tr('modules.remote.devicesError'), devicesError);
    if (!devicesLoaded) return `<p class="dialog-loading" role="status">${escapeI18n(tr('modules.common.loading_devices'))}</p>`;
    if (!devices.length) return `<p class="remote-note">${escapeI18n(tr('modules.common.no_devices_yet'))}</p>`;
    const waiting = (device: RemoteDevice) => { const grant = grantOf(device.id); return !device.current && grant?.scope === 'pending' && grant.requested; };
    return [...devices.filter(waiting), ...devices.filter(device => !waiting(device))].map(deviceRow).join('');
  }
  function hosts(): RemoteDevice[] { return devices.filter(device => !device.current && device.host); }
  function pairRow(): string {
    const list = hosts();
    if (!pairTarget || !list.some(device => device.id === pairTarget)) pairTarget = list.find(device => device.online)?.id ?? list[0]?.id ?? '';
    const select = `<select id="remote-pair-host" aria-label="${escapeI18n(tr('modules.common.computer_to_pair_with'))}" ${list.length ? '' : 'disabled'}>${list.length ? list.map(device => `<option value="${escape(device.id)}"${device.id === pairTarget ? ' selected' : ''}>${escape(device.name)}</option>`).join('') : `<option>${escapeI18n(tr('modules.common.no_computers_with_remote_control_on'))}</option>`}</select>`;
    return `<div class="setting-row"><div><strong>${escape(tr('modules.remote.pairCode'))} ${infoMark(PAIR_TIP(), tr('modules.common.about_pairing_with_a_code'))}</strong><small>${escapeI18n(tr('modules.common.enter_the_code_shown_on_the_other_computer'))}</small></div><span class="remote-device-actions">${select}<input type="text" id="remote-pair-input" class="remote-pair-input" inputmode="numeric" autocomplete="off" maxlength="7" placeholder="000 000" aria-label="${escapeI18n(tr('modules.common.pairing_code_from_the_other_computer'))}" value="${escape(groupCode(pairInput))}"><button type="button" class="secondary-button" data-pair ${pairing || !list.length ? 'disabled' : ''}>${escapeI18n(tr('modules.common.pair'))}</button></span></div>`;
  }
  function codeRow(): string {
    const shown = pairCode ? `<div class="remote-code"><div class="remote-code-row"><output class="remote-user-code" aria-label="${escapeI18n(tr('modules.common.pairing_code'))}">${escape(groupCode(pairCode.code))}</output><button type="button" class="secondary-button" data-code-cancel>${escapeI18n(tr('modules.common.cancel'))}</button></div><p class="remote-note" role="status">${escape(tr('modules.remote.codeScope', { scope: SCOPE_LABELS[pairCode.scope].toLowerCase(), time: new Date(pairCode.expiresAt).toLocaleTimeString(getLocale(), { hour: 'numeric', minute: '2-digit' }) }))}</p></div>` : '';
    return `<div class="setting-row"><div><strong>${escape(tr('modules.common.pairing_code'))} ${infoMark(CODE_TIP(), tr('modules.common.about_pairing_codes'))}</strong><small>${escapeI18n(tr('modules.common.add_a_device_without_the_approval_prompt'))}</small></div><span class="remote-device-actions"><select id="remote-code-scope" aria-label="${escapeI18n(tr('modules.common.access_the_pairing_code_gives'))}">${pickOptions(codeScope)}</select><button type="button" class="secondary-button" data-code-new>${escapeI18n(tr('modules.common.show_pairing_code'))}</button></span></div>${shown}`;
  }
  function body(): string {
    if (!status) {
      if (statusError) return failure(tr('modules.remote.statusError'), statusError);
      if (loading) return `<p class="dialog-loading" role="status">${escapeI18n(tr('modules.common.loading'))}</p>`;
    }
    if (!status) return failure(tr('modules.remote.statusError'), tr('modules.remote.retry'));
    if (!status.configured) return `<p class="remote-note" role="status">${escapeI18n(tr('modules.common.remote_access_is_not_configured_in_this_build'))}</p>`;
    if (!status.signedIn) {
      const flow = code ? `<div class="remote-code"><p>${escape(tr('modules.remote.enterCodeAt', { url: code.verificationUri }))}</p><div class="remote-code-row"><output class="remote-user-code" aria-label="${escapeI18n(tr('modules.common.device_code'))}">${escape(code.userCode)}</output><button type="button" class="secondary-button" data-copy>${icon('copy')}${escape(tr('modules.remote.copyCode'))}</button></div><p class="remote-note" role="status">${escape(tr('modules.remote.waitApproval', { time: new Date(expires).toLocaleTimeString(getLocale(), { hour: 'numeric', minute: '2-digit' }) }))}</p><button type="button" class="secondary-button" data-cancel>${escapeI18n(tr('modules.common.cancel'))}</button></div>` : '';
      return `<div class="setting-row"><div><strong>PandaCode Connect</strong><small>${escapeI18n(tr('modules.common.sign_in_with_github_to_reach_your_other_computers_task_content_is'))}</small></div><button type="button" class="secondary-button" data-sign-in ${signingIn ? 'disabled' : ''}>${icon('github')}${escape(tr('modules.remote.signIn'))}</button></div>${flow}`;
    }
    return `<div class="setting-row"><div><strong>${escape(status.account?.login ?? tr('modules.remote.signedIn'))}</strong><small>${escape(status.connected ? tr('modules.remote.connected') : tr('modules.remote.connecting'))}</small></div><button type="button" class="secondary-button" data-sign-out>${escapeI18n(tr('modules.common.sign_out'))}</button></div>
      <div class="setting-row"><div><strong>${escape(tr('modules.common.allow_remote_control_of_this_computer'))} ${infoMark(ALLOW_TIP(), tr('modules.common.about_remote_control'))}</strong><small>${escapeI18n(tr('modules.common.your_other_signed_in_computers_can_see_and_drive_tasks_here'))}</small></div><input type="checkbox" class="settings-switch" id="remote-host" aria-label="${escapeI18n(tr('modules.common.allow_remote_control_of_this_computer'))}" ${status.hostEnabled ? 'checked' : ''}></div>
      <div class="setting-row"><div><strong>${escape(tr('modules.common.notify_my_phone'))} ${infoMark(NOTIFY_TIP(), tr('modules.common.about_phone_notifications'))}</strong><small>${escapeI18n(tr('modules.common.pushes_a_generic_notice_when_a_hosted_task_needs_approval_or_finishes'))}</small></div><input type="checkbox" class="settings-switch" id="remote-notify" aria-label="${escapeI18n(tr('modules.common.notify_my_phone'))}" ${status.notifyEnabled ? 'checked' : ''}></div>
      <div class="setting-row"><div><strong>${escape(tr('modules.common.full_access_for_remote_tasks'))} ${infoMark(FULL_TIP(), tr('modules.common.about_full_access_for_remote_tasks'))}</strong><small>${escapeI18n(tr('modules.common.off_remote_tasks_always_ask_before_acting'))}</small></div><input type="checkbox" class="settings-switch" id="remote-full-access" aria-label="${escapeI18n(tr('modules.common.full_access_for_remote_tasks'))}" ${status.remoteFullAccess ? 'checked' : ''}></div>
      <div class="setting-row"><div><strong>${escape(tr('modules.remote.computerKey'))} ${infoMark(KEY_TIP(), tr('modules.common.about_this_computer_s_key'))}</strong><small><code class="remote-key">${escape(groupFingerprint(status.device.fingerprint))}</code></small></div></div>
      ${status.hostEnabled ? codeRow() : ''}${pairRow()}
      <h3 class="settings-heading">${escape(tr('modules.remote.devices'))} ${infoMark(SCOPE_HELP(), tr('modules.common.about_device_access'))}</h3>${grantsError ? `<p class="remote-note" role="status">${escape(tr('modules.remote.grantsError', { error: grantsError }))}</p>` : ''}<div class="settings-group remote-devices">${deviceList()}</div>`;
  }
  function render(): void {
    if (disposed) return;
    const active = document.activeElement instanceof HTMLElement && root.contains(document.activeElement) ? document.activeElement : undefined;
    const keep = active?.id, caret = active instanceof HTMLInputElement ? active.selectionStart : null;
    main.innerHTML = `<div class="settings-group remote-settings">${body()}</div>${error ? `<p class="remote-error" role="alert">${escape(error)}</p>` : ''}`;
    if (keep) { const again = main.querySelector<HTMLElement>(`#${CSS.escape(keep)}`); again?.focus(); if (again instanceof HTMLInputElement && caret !== null) again.setSelectionRange(caret, caret); }
  }
  const disposeLocale = onLocaleChange(render);
  const apply = (next: RemoteStatus) => { status = next; if (next.signedIn) { code = undefined; signingIn = false; } else { pairCode = undefined; grants = []; } };
  async function loadGrants(): Promise<void> {
    grantsError = '';
    if (!status?.signedIn) { grants = []; return; }
    try { grants = await host.call<DeviceGrant[]>('remote_device_grants'); }
    catch (e) { grants = []; grantsError = message(e); }
  }
  async function loadDevices(): Promise<void> {
    devicesLoaded = false; devicesError = '';
    if (!status?.signedIn) { devices = []; devicesLoaded = true; return; }
    try { devices = await host.call<RemoteDevice[]>('remote_devices'); devicesLoaded = true; }
    catch (e) { devicesError = message(e); }
    await loadGrants();
  }
  async function load(): Promise<void> {
    loading = true; statusError = ''; devicesError = ''; error = ''; render();
    try { apply(await host.call<RemoteStatus>('remote_status')); }
    catch (e) { status = undefined; statusError = message(e); }
    if (status) await loadDevices();
    loading = false; render();
  }
  async function signIn(): Promise<void> {
    if (signingIn) return;
    error = ''; devicesError = ''; signingIn = true;
    const mine = ++attempt;
    try {
      code = await host.call<RemoteSignIn>('remote_sign_in_start'); expires = Date.now() + code.expiresIn * 1000; render();
      void host.openUrl(code.verificationUri).catch(() => undefined);
      apply(await host.call<RemoteStatus>('remote_sign_in_finish'));
      await loadDevices();
    } catch (e) {
      if (mine !== attempt) return;
      code = undefined; signingIn = false; error = message(e);
    }
    render();
  }
  function cancelSignIn(): void {
    attempt++; code = undefined; signingIn = false; error = ''; render();
    void host.call('remote_sign_in_cancel').catch(fail);
  }
  function setGrant(deviceId: string, scope: string): void {
    error = '';
    void host.call('remote_set_device_grant', { deviceId, scope }).then(() => loadGrants()).then(() => render(), e => { error = message(e); void loadGrants().then(render); });
  }
  function showCode(next: PairCode | undefined): void {
    pairCode = next; window.clearTimeout(expiry);
    if (next) expiry = window.setTimeout(() => { if (pairCode === next) { pairCode = undefined; render(); } }, Math.max(0, next.expiresAt - Date.now()));
    render();
  }
  root.addEventListener('click', event => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('button');
    if (!target) return;
    const row = target.closest<HTMLElement>('.remote-device');
    if (target.hasAttribute('data-retry')) void load();
    else if (target.hasAttribute('data-sign-in')) void signIn();
    else if (target.hasAttribute('data-cancel')) cancelSignIn();
    else if (target.hasAttribute('data-copy') && code) void navigator.clipboard.writeText(code.userCode).then(() => host.notify(tr('modules.common.code_copied')), () => host.notify(tr('modules.common.couldn_t_copy_select_the_code_instead')));
    else if (target.hasAttribute('data-sign-out')) void host.call<RemoteStatus>('remote_sign_out').then(next => { apply(next); devices = []; devicesLoaded = true; devicesError = ''; error = ''; render(); }, fail);
    else if (target.dataset.revoke) void host.call('remote_revoke_device', { deviceId: target.dataset.revoke }).then(() => { devices = devices.filter(d => d.id !== target.dataset.revoke); render(); }, fail);
    else if (target.dataset.approve) setGrant(target.dataset.approve, row?.querySelector<HTMLSelectElement>('select[data-pick]')?.value ?? 'control');
    else if (target.dataset.block) setGrant(target.dataset.block, 'blocked');
    else if (target.hasAttribute('data-code-new')) void host.call<PairCode>('remote_pair_code', { scope: codeScope }).then(showCode, fail);
    else if (target.hasAttribute('data-code-cancel')) { showCode(undefined); void host.call('remote_pair_code_cancel').catch(fail); }
    else if (target.hasAttribute('data-pair') && !pairing) {
      const name = devices.find(device => device.id === pairTarget)?.name ?? 'that computer';
      error = ''; pairing = true; render();
      void host.call<{ scope: GrantScope }>('remote_pair_redeem', { deviceId: pairTarget, code: pairInput }).then(result => { pairInput = ''; host.notify(tr('modules.dynamic.paired', { name: String(name), scope: String((SCOPE_LABELS[result.scope] ?? result.scope).toLowerCase()) })); }, e => { error = message(e); }).finally(() => { pairing = false; render(); });
    }
  });
  root.addEventListener('input', event => {
    const input = event.target as HTMLInputElement;
    if (input.id !== 'remote-pair-input') return;
    const digits = input.value.replace(/\D/g, '').slice(0, 6);
    pairInput = digits; input.value = groupCode(digits);
  });
  root.addEventListener('change', event => {
    const input = event.target as HTMLInputElement | HTMLSelectElement;
    if (input.id === 'remote-pair-host') { pairTarget = input.value; return; }
    if (input.id === 'remote-code-scope') { codeScope = input.value as GrantScope; return; }
    if (input instanceof HTMLSelectElement && input.dataset.pick) { picks[input.dataset.pick] = input.value; return; }
    if (input instanceof HTMLSelectElement && input.dataset.grant) { setGrant(input.dataset.grant, input.value); return; }
    const args = input.id === 'remote-host' ? { enabled: (input as HTMLInputElement).checked } : input.id === 'remote-full-access' ? { fullAccess: (input as HTMLInputElement).checked } : undefined;
    if (args) void host.call<RemoteStatus>('remote_set_host_enabled', args).then(next => { apply(next); render(); }, e => { (input as HTMLInputElement).checked = !(input as HTMLInputElement).checked; fail(e); });
    if (input.id === 'remote-notify') void host.call<RemoteStatus>('remote_set_notify_enabled', { enabled: (input as HTMLInputElement).checked }).then(next => { apply(next); render(); }, e => { (input as HTMLInputElement).checked = !(input as HTMLInputElement).checked; fail(e); });
  });
  const unlisten: Promise<() => void>[] = [
    host.listen('remote://status', next => { if (!signingIn || next.signedIn) { apply(next); render(); } }),
    host.listen('remote://presence', next => { if (Array.isArray(next)) { devices = next; devicesLoaded = true; devicesError = ''; void loadGrants().then(render); } }),
    host.listen('remote://device-grants', next => { if (Array.isArray(next)) { grants = next; grantsError = ''; render(); } }),
    host.listen('remote://pair-code-used', () => { if (pairCode) { host.notify(tr('modules.common.pairing_code_used')); showCode(undefined); } }),
  ];
  root.innerHTML = `<div class="remote-main"></div><section class="remote-diagnostics-section" hidden><h3 class="settings-heading">${escapeI18n(tr('modules.common.diagnostics'))}</h3><div class="settings-group remote-diagnostics-body"></div></section>`;
  const main = root.querySelector<HTMLElement>('.remote-main')!;
  const section = root.querySelector<HTMLElement>('.remote-diagnostics-section')!;
  void import('./remote-diagnostics').then(module => {
    const mount = (module as { mountRemoteDiagnostics?: (container: HTMLElement) => void }).mountRemoteDiagnostics;
    if (disposed || typeof mount !== 'function') return;
    mount(section.querySelector<HTMLElement>('.remote-diagnostics-body')!);
    section.hidden = false;
  }).catch(() => undefined);
  void load();
  return () => { disposed = true; disposeLocale(); window.clearTimeout(expiry); for (const u of unlisten) void u.then(fn => fn(), () => undefined); };
}
