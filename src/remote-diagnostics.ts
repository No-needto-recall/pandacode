import { getLocale } from './i18n.ts';
import { escape as escapeI18n } from './dom.ts';
import { t as tr } from './i18n.ts';
import './remote-diagnostics.css';
import { call } from './bridge';
import { escape } from './dom';
import { infoMark } from './tooltip';

interface Stage { name: string; ok: boolean; detail: string }
interface Route { device?: string; route?: string; state?: string; rttMs?: number | null; since?: number | null; lastError?: string | null }
interface Event { at: number; kind: string; detail: string }
interface Snapshot {
  relay?: { state?: string; url?: string; connectedSince?: number | null; lastError?: string | null; reconnects?: number };
  routes?: Route[] | Record<string, Route>;
  stages?: Stage[];
  events?: Event[];
}

const time = (ms?: number | null) => ms ? new Date(ms).toLocaleTimeString(getLocale(), { hour12: false }) : '—';
const ago = (ms?: number | null) => {
  if (!ms) return '—';
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  return s < 60 ? `${s}s` : s < 3600 ? `${Math.round(s / 60)}m` : `${Math.round(s / 3600)}h`;
};
const routeRows = (routes: Snapshot['routes']): Route[] => Array.isArray(routes) ? routes : routes ? Object.values(routes) : [];

function render(container: HTMLElement, data: Snapshot): void {
  const stages = data.stages ?? [], routes = routeRows(data.routes), events = data.events ?? [], relay = data.relay ?? {};
  const meta = [relay.url, relay.state, relay.connectedSince ? `up ${ago(relay.connectedSince)}` : '', relay.reconnects ? `${relay.reconnects} reconnects` : ''].filter(Boolean).join(' · ');
  container.querySelector<HTMLElement>('[data-diag="body"]')!.innerHTML = `
    <section><h4>Connection ${infoMark(tr('modules.common.each_stage_needs_the_one_before_it_the_first_failing_stage_is'), tr('modules.common.about_stages'))}</h4>
      <ul class="diag-stages">${stages.map(s => `<li data-ok="${s.ok}"><span class="diag-dot" aria-hidden="true"></span><strong>${escape(s.name)}</strong><span class="diag-state">${s.ok ? 'OK' : 'Failed'}</span><small title="${escape(s.detail)}">${escape(s.detail)}</small></li>`).join('')}</ul>
      ${meta ? `<p class="diag-meta" title="${escape(meta)}">${escape(meta)}</p>` : ''}${relay.lastError ? `<p class="diag-meta diag-error" title="${escape(relay.lastError)}">Last error: ${escape(relay.lastError)}</p>` : ''}</section>
    <section><h4>${escapeI18n(tr('modules.common.routes'))}</h4>
      <table class="diag-routes"><thead><tr><th>${escapeI18n(tr('modules.common.device'))}</th><th>${escapeI18n(tr('modules.common.route'))}</th><th>${escapeI18n(tr('modules.common.rtt'))}</th><th>${escapeI18n(tr('modules.common.since'))}</th><th>${escapeI18n(tr('modules.common.last_error'))}</th></tr></thead><tbody>${routes.length ? routes.map(r => `<tr><td>${escape(r.device ?? '')}</td><td>${escape(r.route ?? '')}${r.state ? ` <span class="diag-chip" data-state="${escape(r.state)}">${escape(r.state)}</span>` : ''}</td><td>${r.rttMs == null ? '—' : `${Math.round(r.rttMs)} ms`}</td><td>${ago(r.since)}</td><td title="${escape(r.lastError ?? '')}">${escape(r.lastError ?? '—')}</td></tr>`).join('') : `<tr><td colspan="5" class="diag-empty">${escapeI18n(tr('modules.common.no_routes_yet'))}</td></tr>`}</tbody></table></section>
    <section><h4>${escapeI18n(tr('modules.common.events'))}</h4>
      <div class="diag-events" role="log" tabindex="0" aria-label="${escapeI18n(tr('modules.common.connection_events_latest_first'))}">${events.length ? events.map(e => `<div class="diag-event" title="${escape(e.detail)}"><time>${time(e.at)}</time><b>${escape(e.kind)}</b><span>${escape(e.detail)}</span></div>`).join('') : `<div class="diag-empty">${escapeI18n(tr('modules.common.no_events_yet'))}</div>`}</div></section>`;
}

/** Mounts the Connect diagnostics panel: stages, routes, event log and the Refresh / Reconnect / Copy buttons. */
export function mountRemoteDiagnostics(container: HTMLElement): void {
  container.classList.add('remote-diagnostics');
  container.innerHTML = `<div class="diag-actions"><button type="button" class="secondary-button" data-diag="refresh">${escapeI18n(tr('modules.common.refresh'))}</button><button type="button" class="secondary-button" data-diag="reconnect">${escapeI18n(tr('modules.common.reconnect_now'))}</button><button type="button" class="secondary-button" data-diag="copy">${escapeI18n(tr('modules.common.copy_report'))}</button><span class="diag-note" role="status" data-diag="note"></span></div><div data-diag="body"></div>`;
  const note = container.querySelector<HTMLElement>('[data-diag="note"]')!;
  const say = (text: string) => { note.textContent = text; window.setTimeout(() => { if (note.textContent === text) note.textContent = ''; }, 3000); };
  const toast = (text: string) => {
    const el = document.querySelector<HTMLElement>('#toast');
    if (el) { el.textContent = text; el.hidden = false; window.setTimeout(() => { if (el.textContent === text) el.hidden = true; }, 3000); }
    say(text);
  };
  const refresh = async () => {
    try { render(container, await call<Snapshot>('remote_diagnostics')); } catch (error) { say(`Could not load diagnostics: ${error}`); }
  };
  container.addEventListener('click', async event => {
    const action = (event.target as HTMLElement).closest<HTMLElement>('[data-diag]')?.dataset.diag;
    try {
      if (action === 'refresh') await refresh();
      else if (action === 'reconnect') { await call('remote_reconnect'); toast('Reconnecting'); window.setTimeout(() => void refresh(), 600); }
      else if (action === 'copy') { await navigator.clipboard.writeText(await call<string>('remote_diagnostics_export')); toast('Report copied'); }
    } catch (error) { say(`${error}`); }
  });
  void refresh();
}
