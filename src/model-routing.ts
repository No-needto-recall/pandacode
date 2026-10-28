import { escape as escapeI18n } from './dom.ts';
import { t as tr, onLocaleChange } from './i18n.ts';
/* Settings → Agents → Model routing: Panda Router picks each worker's model for a task. */
import './model-routing.css';
import { escape, icon, morph } from './dom';
import { providerLogo } from './provider-logos';
import { trackSegment } from './motion';
import { installedCatalog } from './team-catalog';
import { modelTiersHtml, mountModelTiers } from './model-tiers';
import { infoMark } from './tooltip';
import type { ProviderId, ProviderModel } from './types';

export type RoutingMode = 'balanced' | 'cheapest' | 'quality';
export interface RoutingStatus { enabled: boolean; mode: RoutingMode; minP: number; profiler: 'ready' | 'missing' | 'downloading' | 'failed' | 'unavailable'; error: string | null }
export interface RoutedModel { provider: ProviderId; model: string; name: string; cardId: string; pSuccess: number; estCostUsd: number; estLatencyMs: number }
export interface RouteResult { pick: RoutedModel | null; ranking: RoutedModel[]; unrated: { provider: ProviderId; model: string; name: string }[]; difficulty: number; category: string; profiler: 'onnx' | 'heuristic'; latencyMs: number }

export interface Unhealthy { provider: ProviderId; model: string; reason: string; until: number; failures: number; providerDown: boolean }

export interface Exclusions { providers: ProviderId[]; models: { provider: ProviderId; model: string }[] }

export interface ModelRoutingOptions {
  providers: { id: ProviderId; name: string; installed: boolean; models: ProviderModel[] }[];
  loadModels(provider: ProviderId): Promise<ProviderModel[]>;
  call<T>(command: string, args?: Record<string, unknown>): Promise<T>;
}

const routingModes = (): [RoutingMode, string][] => [['cheapest', tr('modules.routing.cheap')], ['balanced', tr('modules.routing.balanced')], ['quality', tr('modules.routing.best')]];
const MIN_P = 30, MAX_P = 90, DEFAULT_P = 50;
const HELP = () => tr('modules.routing.help');
const HEALTH_REFRESH_MS = 30_000;
const money = (usd: number) => usd < 0.01 ? `$${usd.toFixed(4)}` : `$${usd.toFixed(2)}`;
const percent = (p: number) => `${Math.round(p * 100)}%`;

export function mountModelRouting(host: HTMLElement, options: ModelRoutingOptions): () => void {
  const markup = () => `<div class="settings-group model-routing">
    <div class="setting-row"><div><strong>${escape(tr('modules.routing.title'))} ${infoMark(HELP(), tr('modules.common.about_model_routing'))}</strong></div></div>
    <div class="setting-row"><div><strong>${escapeI18n(tr('modules.common.pick_worker_models_with_panda_router'))}</strong></div><input type="checkbox" class="settings-switch routing-enabled" aria-label="${escapeI18n(tr('modules.common.pick_worker_models_with_panda_router'))}"></div>
    <div class="setting-row"><div><strong>${escapeI18n(tr('modules.common.mode'))}</strong></div><div class="routing-modes" role="radiogroup" aria-label="${escapeI18n(tr('modules.common.routing_mode'))}">${routingModes().map(([id, label]) => `<button type="button" role="radio" aria-checked="false" tabindex="-1" data-mode="${id}">${label}</button>`).join('')}</div></div>
    <div class="setting-row routing-minp-row" hidden><div><strong>${escapeI18n(tr('modules.common.minimum_chance_of_success'))}</strong></div><input type="number" class="routing-minp" aria-label="${escapeI18n(tr('modules.common.minimum_chance_of_success_in_percent'))}" min="${MIN_P}" max="${MAX_P}" step="1"></div>
    <div class="setting-row"><div><strong>${escapeI18n(tr('modules.common.profiler'))}</strong><small class="routing-status" role="status"></small></div><button type="button" class="secondary-button routing-prepare" hidden></button></div>
    <div class="routing-try"><p class="routing-off" hidden>${escapeI18n(tr('modules.common.routing_is_off_turn_it_on_to_try_it'))}</p><textarea class="routing-text" aria-label="${escapeI18n(tr('modules.common.task_to_route'))}" rows="3" spellcheck="false" placeholder="${escapeI18n(tr('modules.common.describe_a_task_to_see_which_model_panda_router_would_pick'))}"></textarea>
      <div class="routing-try-actions"><button type="button" class="secondary-button routing-route">${escapeI18n(tr('modules.common.route'))}</button></div>
      <div class="routing-result" role="status" aria-live="polite" hidden></div></div>
  </div>
  <div class="settings-group routing-health" role="group" aria-label="${escapeI18n(tr('modules.common.unavailable_models'))}" hidden>
    <div class="setting-row"><div><strong>${escape(tr('modules.common.unavailable_models'))} ${infoMark(tr('modules.common.panda_router_skips_these_models_until_their_cooldown_ends_because_their_runs'), tr('modules.common.about_unavailable_models'))}</strong></div><button type="button" class="secondary-button routing-health-clear" aria-label="${escapeI18n(tr('modules.common.allow_all_unavailable_models_now'))}">${escapeI18n(tr('modules.common.allow_all'))}</button></div>
    <div class="routing-health-rows"></div>
  </div>
  <div class="settings-group routing-pool" role="group" aria-label="${escapeI18n(tr('modules.common.models_for_teams'))}">
    <div class="setting-row"><div><strong>${escape(tr('modules.common.models_for_teams'))} ${infoMark(tr('modules.common.turned_off_harnesses_and_models_are_never_picked_for_team_workers_panda'), tr('modules.common.about_models_for_teams'))}</strong><small class="routing-pool-note" role="status" data-live></small></div></div>
    <p class="routing-pool-warning" role="alert" hidden>${escapeI18n(tr('modules.common.no_model_is_on_for_teams_workers_will_use_the_lead_s'))}</p>
    <div class="routing-pool-rows"></div>
  </div>
  ${modelTiersHtml()}`;
  host.innerHTML = markup();
  const $ = <T extends HTMLElement>(selector: string) => host.querySelector<T>(selector)!;
  const enabled = $<HTMLInputElement>('.routing-enabled'), minP = $<HTMLInputElement>('.routing-minp'), minRow = $('.routing-minp-row');
  const statusText = $('.routing-status'), prepare = $<HTMLButtonElement>('.routing-prepare');
  const text = $<HTMLTextAreaElement>('.routing-text'), routeButton = $<HTMLButtonElement>('.routing-route'), result = $('.routing-result');
  const modes = $('.routing-modes'), off = $('.routing-off');
  const health = $('.routing-health'), healthRows = $('.routing-health-rows');
  let disposed = false, status: RoutingStatus | null = null, polling = 0, latest = 0, writing = 0;
  // Only the reply to the newest request renders, so an older one never undoes a later change; a read
  // (status poll) also yields to a change still in flight, and a replaced request's failure stays quiet.
  const request = (command: string, args?: Record<string, unknown>, write = false) => {
    const ticket = write ? ++latest : latest;
    if (write) writing++;
    return options.call<RoutingStatus>(command, args).then(
      next => { if (!disposed && ticket === latest && (write || !writing)) render(next); },
      cause => { if (ticket === latest) throw cause; },
    ).finally(() => { if (write) writing--; });
  };
  // A download started elsewhere (a team turning on) finishes on its own; follow it.
  const poll = () => {
    if (polling || disposed) return;
    polling = window.setTimeout(() => {
      polling = 0;
      request('model_routing_status').catch(() => { if (!disposed) poll(); });
    }, 1000);
  };

  let healthTicket = 0, lastHealth: Unhealthy[] | null = null;
  // Rows are keyed by provider and model: a refresh updates the countdown in place, adds and removes rows,
  // and never replaces a row that stays, so keyboard focus on its button or info mark survives.
  const renderHealth = (list: Unhealthy[]) => {
    lastHealth = list;
    health.hidden = list.length === 0;
    // A newer failure (new count) gets a fresh row, so its reason is never stale.
    const keys = new Set(list.map(entry => `${entry.provider}\n${entry.model}\n${entry.failures}`));
    healthRows.querySelectorAll<HTMLElement>(':scope>[data-key]').forEach(row => { if (!keys.has(row.dataset.key!)) row.remove(); });
    for (const entry of list) {
      const key = `${entry.provider}\n${entry.model}\n${entry.failures}`;
      const provider = options.providers.find(p => p.id === entry.provider);
      const model = provider?.models.find(m => m.id === entry.model)?.name ?? entry.model;
      const providerName = provider?.name ?? entry.provider;
      const minutes = Math.max(1, Math.ceil((entry.until - Date.now()) / 60_000));
      const left = entry.providerDown ? `All ${providerName} models paused ${minutes} min` : `Paused ${minutes} min`;
      const existing = [...healthRows.children].find(row => (row as HTMLElement).dataset.key === key);
      if (existing) {
        const small = existing.querySelector('.routing-health-left')!;
        if (small.textContent !== left) small.textContent = left;
        continue;
      }
      const label = `${model} · ${providerName}`;
      const row = document.createElement('div');
      row.className = 'setting-row routing-health-row'; row.dataset.key = key;
      row.innerHTML = `<div>${providerLogo(entry.provider as ProviderId, 'routing-logo')}<strong>${escape(label)} ${infoMark(entry.reason, `Why ${label} is paused`)}</strong><small class="routing-health-left">${escape(left)}</small></div>`
        + `<button type="button" class="secondary-button routing-health-retry" data-provider="${escape(entry.provider)}" data-model="${escape(entry.model)}" aria-label="Allow ${escape(label)} now">${escapeI18n(tr('modules.common.allow_now'))}</button>`;
      healthRows.append(row);
    }
  };
  // Newest reply wins, so a slow list never undoes a clear.
  const loadHealth = (command = 'model_health_list', args?: Record<string, unknown>) => {
    const ticket = ++healthTicket;
    // Rank models hides the same paused models; until a list arrives it waits (a failed first read keeps it waiting).
    return options.call<Unhealthy[]>(command, args).then(list => {
      if (!disposed && ticket === healthTicket) { renderHealth(list); tiers.setHealth(list); }
    }).catch(cause => { if (!disposed && ticket === healthTicket && lastHealth) tiers.setHealth(lastHealth); fail(cause); });
  };
  const healthTimer = window.setInterval(() => void loadHealth(), HEALTH_REFRESH_MS);
  host.querySelector('.routing-health-clear')!.addEventListener('click', () => void loadHealth('model_health_clear'));
  healthRows.addEventListener('click', event => {
    const button = (event.target as Element).closest<HTMLElement>('.routing-health-retry');
    if (button) void loadHealth('model_health_clear', { provider: button.dataset.provider, model: button.dataset.model });
  });

  const profilerLabel = (next: RoutingStatus): string => {
    switch (next.profiler) {
      case 'ready': return tr('modules.common.ready');
      case 'downloading': return tr('modules.routing.downloading');
      case 'missing': return tr('modules.routing.notDownloaded');
      case 'failed': return tr('modules.routing.failed', { error: next.error ?? tr('modules.routing.unknownError') });
      default: return tr('modules.routing.heuristic', { reason: next.error ?? tr('modules.routing.profilerUnavailable') });
    }
  };
  const render = (next: RoutingStatus) => {
    status = next;
    void loadHealth();
    // The composer's Team button follows every status shown here.
    window.dispatchEvent(new CustomEvent('pandacode:routing', { detail: next }));
    enabled.checked = next.enabled;
    modes.querySelectorAll<HTMLButtonElement>('button').forEach(b => {
      const on = b.dataset.mode === next.mode;
      b.setAttribute('aria-checked', String(on)); b.classList.toggle('selected', on); b.tabIndex = on ? 0 : -1;
    });
    trackSegment(modes, modes.querySelector<HTMLElement>('.selected'));
    minRow.hidden = next.mode !== 'cheapest';
    if (document.activeElement !== minP) minP.value = String(Math.round(next.minP * 100));
    off.hidden = next.enabled; text.disabled = routeButton.disabled = !next.enabled;
    if (next.profiler === 'downloading') poll();
    statusText.textContent = profilerLabel(next);
    prepare.hidden = next.profiler === 'ready' || next.profiler === 'downloading' || next.profiler === 'unavailable';
    prepare.textContent = next.profiler === 'failed' ? tr('modules.common.retry') : tr('modules.common.download');
  };
  const fail = (cause: unknown) => { if (!disposed) { result.hidden = false; result.textContent = cause instanceof Error ? cause.message : String(cause); } };
  const configure = (patch: Record<string, unknown>) => request('model_routing_configure', patch, true).catch(fail);

  enabled.addEventListener('change', () => void configure({ enabled: enabled.checked }));
  modes.addEventListener('click', event => {
    const mode = (event.target as Element).closest<HTMLElement>('[data-mode]')?.dataset.mode;
    if (mode) void configure({ mode });
  });
  modes.addEventListener('keydown', event => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const buttons = [...modes.querySelectorAll<HTMLButtonElement>('button')];
    const next = buttons[(buttons.findIndex(b => b.classList.contains('selected')) + step + buttons.length) % buttons.length];
    next.focus(); void configure({ mode: next.dataset.mode });
  });
  minP.addEventListener('change', () => {
    const value = Math.min(MAX_P, Math.max(MIN_P, Math.round(Number(minP.value)) || DEFAULT_P));
    minP.value = String(value);
    void configure({ minP: value / 100 });
  });
  prepare.addEventListener('click', () => {
    prepare.disabled = true;
    if (status) render({ ...status, profiler: 'downloading', error: null });
    request('model_routing_prepare').catch(fail).finally(() => { prepare.disabled = false; });
  });
  routeButton.addEventListener('click', async () => {
    const task = text.value.trim();
    if (!task || routeButton.disabled) return;
    routeButton.disabled = true; result.hidden = false; result.textContent = tr('modules.common.routing');
    try {
      const { catalog: pool } = await installedCatalog(options.providers, options.loadModels);
      const route = await options.call<RouteResult>('model_routing_route', { text: task, pool });
      if (disposed) return;
      const row = (m: RoutedModel, label: string) => `<li><span class="routing-label">${label}</span><span class="routing-name">${escape(m.name)}</span><span>${percent(m.pSuccess)}</span><span>${money(m.estCostUsd)}</span></li>`;
      const alternatives = route.ranking.filter(m => !route.pick || m.cardId !== route.pick.cardId).slice(0, 4);
      result.innerHTML = `<p class="routing-summary">Difficulty ${route.difficulty}/10 · ${escape(route.category)} · ${route.profiler === 'onnx' ? 'ONNX profiler' : 'keyword heuristic'} · ${Math.round(route.latencyMs)} ms</p>`
        + (route.pick ? `<ul class="routing-ranking" aria-label="${escapeI18n(tr('modules.common.routed_models'))}">${row(route.pick, 'Pick')}${alternatives.map(m => row(m, 'Also')).join('')}</ul>` : `<p>${escapeI18n(tr('modules.common.no_rated_model_fits_the_lead_will_choose'))}</p>`);
    } catch (cause) { fail(cause); }
    finally { routeButton.disabled = !status?.enabled; }
  });

  void request('model_routing_status').catch(fail);
  const tiers = mountModelTiers($('.model-tiers'), { ...options, fail });
  void loadHealth();
  const disposePool = mountPool($('.routing-pool'), options, fail, () => disposed, tiers.setExclusions);
  const disposeLocale = onLocaleChange(() => {
    const next = document.createElement('div'); next.innerHTML = markup();
    const selector = ':scope > .settings-group > .setting-row > div > strong, .routing-off, .routing-pool-warning, .routing-route, .routing-health-clear';
    const fresh = [...next.querySelectorAll(selector)];
    host.querySelectorAll(selector).forEach((node, index) => { if (fresh[index]) morph(node, fresh[index].innerHTML, 20); });
    for (const [id, label] of routingModes()) modes.querySelector('[data-mode="' + id + '"]')!.textContent = label;
    for (const selector of ['.routing-enabled', '.routing-modes', '.routing-minp', '.routing-text', '.routing-health', '.routing-health-clear', '.routing-pool']) { const node = host.querySelector(selector), copy = next.querySelector(selector); if (node && copy) for (const attr of ['aria-label', 'placeholder']) if (copy.hasAttribute(attr)) node.setAttribute(attr, copy.getAttribute(attr)!); }
    if (status) { statusText.textContent = profilerLabel(status); prepare.textContent = status.profiler === 'failed' ? tr('modules.common.retry') : tr('modules.common.download'); }
    healthRows.querySelectorAll('button').forEach(button => { button.textContent = tr('modules.common.allow_now'); });
  });
  return () => { disposed = true; disposeLocale(); disposePool(); tiers.dispose(); clearTimeout(polling); clearInterval(healthTimer); };
}

// Models for teams: one switch per installed harness, its models behind a disclosure. The switches stay
// disabled until the saved set loads. Saves run one at a time, each sending the newest set; a failure of
// the newest save reverts to the last set native confirmed.
function mountPool(group: HTMLElement, options: ModelRoutingOptions, fail: (cause: unknown) => void, disposed: () => boolean, onChange: (shown: Exclusions) => void): () => void {
  const harnesses = options.providers.filter(p => p.installed);
  const models = new Map<ProviderId, ProviderModel[]>(harnesses.map(p => [p.id, p.models]));
  const rows = group.querySelector<HTMLElement>('.routing-pool-rows')!, note = group.querySelector<HTMLElement>('.routing-pool-note')!;
  const warning = group.querySelector<HTMLElement>('.routing-pool-warning')!;
  let saved: Exclusions = { providers: [], models: [] }, shown = saved, loaded = false;
  let version = 0, sent = 0, chain = Promise.resolve();
  const providerOff = (id: ProviderId) => shown.providers.includes(id);
  const modelOff = (id: ProviderId, model: string) => shown.models.some(m => m.provider === id && m.model === model);

  rows.innerHTML = harnesses.map(p => `<div class="routing-pool-harness" data-provider="${escape(p.id)}">
    <div class="setting-row routing-pool-row"><button type="button" class="routing-pool-expand" aria-expanded="false" aria-controls="routing-pool-${escape(p.id)}" aria-label="${escape(p.name)} models">${icon('chevron', 'routing-pool-chevron')}${providerLogo(p.id, 'routing-logo')}<strong>${escape(p.name)}</strong></button>
      <input type="checkbox" class="settings-switch routing-pool-provider" aria-label="Use ${escape(p.name)} for teams"></div>
    <div class="routing-pool-models" id="routing-pool-${escape(p.id)}" hidden></div></div>`).join('');

  const sync = (notify = true) => {
    group.setAttribute('aria-busy', String(!loaded));
    rows.querySelectorAll<HTMLElement>('.routing-pool-harness').forEach(row => {
      const id = row.dataset.provider as ProviderId;
      const harness = row.querySelector<HTMLInputElement>('.routing-pool-provider')!;
      harness.checked = !providerOff(id); harness.disabled = !loaded;
      row.querySelectorAll<HTMLInputElement>('.routing-pool-model').forEach(box => {
        box.checked = !providerOff(id) && !modelOff(id, box.dataset.model!);
        box.disabled = !loaded || providerOff(id);
      });
    });
    const counts = harnesses.filter(p => !providerOff(p.id)).map(p => {
      const list = models.get(p.id) ?? [];
      // A harness whose models are not listed still counts as one model on.
      return list.length ? list.filter(m => !modelOff(p.id, m.id)).length : 1;
    });
    const on = counts.reduce((sum, n) => sum + n, 0);
    note.textContent = tr((on === 1 ? '' : 's') === '' ? 'modules.dynamic.modelsOn.one' : 'modules.dynamic.modelsOn.many', { count: String(on) });
    warning.hidden = !loaded || on > 0;
    if (loaded && notify) onChange(shown);
  };
  const flush = async () => {
    if (sent === version || disposed()) return;
    const mine = sent = version;
    try {
      saved = await options.call<Exclusions>('model_routing_set_exclusions', { ...shown });
      if (mine === version && !disposed()) { shown = saved; sync(); }
    } catch (cause) {
      if (disposed()) return;
      if (mine === version) { shown = saved; sync(); }
      fail(cause);
    }
  };
  const save = (next: Exclusions) => {
    if (!loaded) return;
    shown = next; version++; sync();
    chain = chain.then(flush);
  };
  const expand = async (row: HTMLElement, button: HTMLElement) => {
    const id = row.dataset.provider as ProviderId, list = row.querySelector<HTMLElement>('.routing-pool-models')!;
    const open = button.getAttribute('aria-expanded') !== 'true';
    button.setAttribute('aria-expanded', String(open)); list.hidden = !open;
    if (!open || list.dataset.loaded) return;
    list.dataset.loaded = '1'; list.textContent = tr('modules.common.loading');
    const name = harnesses.find(p => p.id === id)!.name;
    const loaded = await options.loadModels(id).catch(() => [] as ProviderModel[]);
    const entries = loaded.length ? loaded : models.get(id) ?? [];
    if (disposed()) return;
    models.set(id, entries);
    list.innerHTML = entries.length ? entries.map(m => `<label class="setting-row routing-pool-model-row" title="${escape(m.id)}"><span>${escape(m.name)}</span>`
      + `<input type="checkbox" class="settings-switch routing-pool-model" data-model="${escape(m.id)}" aria-label="Use ${escape(m.name)} (${escape(name)}) for teams"></label>`).join('')
      : `<p class="routing-pool-empty">${escapeI18n(tr('modules.common.no_models_listed'))}</p>`;
    sync();
  };

  rows.addEventListener('click', event => {
    const button = (event.target as Element).closest<HTMLElement>('.routing-pool-expand');
    if (button) void expand(button.closest<HTMLElement>('.routing-pool-harness')!, button);
  });
  rows.addEventListener('change', event => {
    const box = event.target as HTMLInputElement, id = box.closest<HTMLElement>('.routing-pool-harness')!.dataset.provider as ProviderId;
    if (box.classList.contains('routing-pool-provider')) {
      save({ ...shown, providers: box.checked ? shown.providers.filter(p => p !== id) : [...shown.providers, id] });
    } else if (box.classList.contains('routing-pool-model')) {
      const model = box.dataset.model!, rest = shown.models.filter(m => m.provider !== id || m.model !== model);
      save({ ...shown, models: box.checked ? rest : [...rest, { provider: id, model }] });
    }
  });

  sync();
  options.call<Exclusions>('model_routing_exclusions').then(value => { if (!disposed()) { saved = shown = value; loaded = true; sync(); } }, fail);
  return onLocaleChange(() => { if (!disposed()) sync(false); });
}
