import { escape as escapeI18n } from './dom.ts';
import { t as tr } from './i18n.ts';
/* Scoped pairing (src-tauri/src/remote/grants.rs): the prompt shown when a device asks for
 * access to this computer for the first time, with the shared grant types. Mounted once by
 * main.ts; Settings → Remote access lists the same devices. */
import './remote-pairing-prompt.css';
import { escape } from './dom';
import type { RemoteHost } from './remote-types';

export type GrantScope = 'pending' | 'view' | 'control' | 'full' | 'blocked';
export interface DeviceGrant { deviceId: string; name: string; platform: string; fingerprint: string; scope: GrantScope; online: boolean; requested: boolean }
export interface PairCode { code: string; scope: GrantScope; expiresAt: number }
export interface DevicePending { deviceId: string; name: string; fingerprint: string }

export const APPROVE_SCOPES: { id: GrantScope; label: string }[] = [
  { id: 'view', get label() { return tr('modules.common.view_only'); } },
  { id: 'control', get label() { return tr('modules.common.control'); } },
  { id: 'full', get label() { return tr('modules.common.full_access'); } },
];
export const SCOPE_LABELS: Record<GrantScope, string> = { get pending() { return tr('modules.remote.waitingApproval'); }, get view() { return tr('modules.common.view_only'); }, get control() { return tr('modules.common.control'); }, get full() { return tr('modules.common.full_access'); }, get blocked() { return tr('modules.common.blocked'); } };
export const SCOPE_HELP = () => tr('modules.remote.scopeHelp');

/** The first 16 hex digits of a key fingerprint in groups of four, to compare by eye on both computers. */
export function groupFingerprint(fingerprint: string): string {
  return (fingerprint.slice(0, 16).match(/.{1,4}/g) ?? []).join(' ');
}

const options = (selected: GrantScope) => APPROVE_SCOPES.map(scope => `<option value="${scope.id}"${scope.id === selected ? ' selected' : ''}>${scope.label}</option>`).join('');

export function mountPairingPrompt(host: RemoteHost): () => void {
  const stack = document.createElement('div');
  stack.className = 'pairing-prompts';
  stack.setAttribute('aria-label', tr('modules.common.devices_asking_for_access'));
  document.body.append(stack);
  const card = (deviceId: string) => [...stack.children].find((child): child is HTMLElement => child instanceof HTMLElement && child.dataset.device === deviceId);
  const show = (pending: DevicePending) => {
    card(pending.deviceId)?.remove();
    const element = document.createElement('section');
    element.className = 'pairing-prompt';
    element.dataset.device = pending.deviceId;
    element.setAttribute('role', 'alert');
    element.innerHTML = `<div class="pairing-prompt-text"><strong>${escape(tr('modules.remote.accessRequest', { device: pending.name || tr('modules.remote.aDevice') }))}</strong><small>${escape(tr('modules.remote.verifyKey', { key: groupFingerprint(pending.fingerprint) }))}</small></div>
      <div class="pairing-prompt-actions"><select aria-label="${escape(tr('modules.remote.accessFor', { device: pending.name }))}">${options('control')}</select><button type="button" class="primary-button" data-approve>${escapeI18n(tr('modules.common.approve'))}</button><button type="button" class="secondary-button" data-block>${escapeI18n(tr('modules.common.block'))}</button><button type="button" class="secondary-button" data-later aria-label="${escapeI18n(tr('modules.common.decide_later'))}">${escapeI18n(tr('modules.common.later'))}</button></div>`;
    stack.append(element);
  };
  stack.addEventListener('click', event => {
    const target = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
    const element = target?.closest<HTMLElement>('.pairing-prompt');
    const deviceId = element?.dataset.device;
    if (!target || !element || !deviceId) return;
    if (target.hasAttribute('data-later')) { element.remove(); return; }
    const scope = target.hasAttribute('data-block') ? 'blocked' : element.querySelector('select')!.value;
    target.disabled = true;
    void host.call('remote_set_device_grant', { deviceId, scope }).then(() => element.remove(), error => { target.disabled = false; host.notify(error instanceof Error ? error.message : String(error)); });
  });
  const unlisten: Promise<() => void>[] = [
    host.listen('remote://device-pending', (pending: DevicePending) => { if (pending?.deviceId) show(pending); }),
    host.listen('remote://device-grants', (grants: DeviceGrant[]) => {
      if (Array.isArray(grants)) for (const element of [...stack.children]) if (grants.some(grant => grant.deviceId === (element as HTMLElement).dataset.device && grant.scope !== 'pending')) element.remove();
    }),
  ];
  return () => { for (const u of unlisten) void u.then(fn => fn(), () => undefined); stack.remove(); };
}
