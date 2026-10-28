import { getLocale } from './i18n.ts';
import { escape as escapeI18n } from './dom.ts';
import { t as tr, onLocaleChange } from './i18n.ts';
import './capabilities-panel.css';
import { preview } from './bridge';
import { escape, icon } from './dom';

export type CapabilityHarness = { id: string; name: string };
export type CapabilityEntry = { harness: string; kind: string; name: string; state: string; source: string; command: string | null };
export type CapabilityMatrixRow = { kind: string; name: string; states: { harness: string; state: string }[] };
export type CapabilityInventory = { harnesses: CapabilityHarness[]; entries: CapabilityEntry[]; matrix: CapabilityMatrixRow[]; warnings: string[] };
export type CacheAlignment = {
  taskProvider: string | null;
  harnesses: {
    id: string; name: string; instructionDelivery: string; state: string; cacheTokens: string;
    cacheReadTokens: number | null; cacheCreationTokens: number | null; cacheTokenSource: string;
  }[];
};
export type CapabilityCall = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

const tokenCount = (value: number | null) => value == null ? '—' : new Intl.NumberFormat(getLocale()).format(value);
const deliveryLabel = (value: string) => value === 'cachedSystemPrompt'
  ? tr('modules.capabilities.cachedPrompt')
  : value === 'messageInjection'
    ? tr('modules.capabilities.injection')
    : value;

function inventoryTable(data: CapabilityInventory | null, loading: boolean, failed: boolean): string {
  if (loading) return `<p class="capabilities-table-status" role="status">${escapeI18n(tr('modules.common.reading_local_harness_metadata'))}</p>`;
  if (failed) return `<p class="capabilities-table-status" role="alert">${escapeI18n(tr('modules.common.could_not_read_the_capability_inventory_try_refreshing'))}</p>`;
  if (!data?.harnesses.length) return `<p class="capabilities-table-status">${escapeI18n(tr('modules.common.no_installed_harnesses_were_found'))}</p>`;
  if (!data.matrix.length) return `<p class="capabilities-table-status">${escapeI18n(tr('modules.common.no_commands_integrations_hooks_plugins_or_skills_were_discovered'))}</p>`;

  const entryByKey = new Map(data.entries.map(entry => [entry.harness + '\u0000' + entry.kind + '\u0000' + entry.name, entry]));
  const headings = data.harnesses.map(harness => `<th scope="col">${escape(harness.name)}</th>`).join('');
  const rows = data.matrix.map(row => {
    const states = row.states.map(cell => {
      const entry = entryByKey.get(cell.harness + '\u0000' + row.kind + '\u0000' + row.name);
      const command = entry?.command ? `<small class="capabilities-command">${escape(entry.command)}</small>` : '';
      const source = entry ? `<small class="capabilities-source">${escape(entry.source)}</small>` : '';
      const label = cell.state === 'native' ? tr('modules.capabilities.native') : cell.state === 'discovered' ? tr('modules.capabilities.discovered') : tr('modules.capabilities.missing');
      return `<td><span class="capabilities-state" data-state="${escape(cell.state)}">${label}</span>${command}${source}</td>`;
    }).join('');
    return `<tr><th scope="row"><span>${escape(row.name)}</span><small>${escape(row.kind)}</small></th>${states}</tr>`;
  }).join('');
  return `<div class="capabilities-table-scroll"><table class="capabilities-table" aria-label="${escapeI18n(tr('modules.common.capability_alignment'))}">
    <thead><tr><th scope="col">${escapeI18n(tr('modules.common.capability'))}</th>${headings}</tr></thead><tbody>${rows}</tbody>
  </table></div>${data.warnings.length ? `<p class="capabilities-table-status" role="status">${escape(data.warnings.join(' '))}</p>` : ''}`;
}

function cacheTable(data: CacheAlignment | null, loading: boolean, failed: boolean): string {
  if (loading) return `<p class="capabilities-table-status" role="status">${escapeI18n(tr('modules.common.reading_cache_alignment'))}</p>`;
  if (failed) return `<p class="capabilities-table-status" role="alert">${escapeI18n(tr('modules.common.could_not_read_cache_alignment_try_refreshing'))}</p>`;
  if (!data?.harnesses.length) return `<p class="capabilities-table-status">${escapeI18n(tr('modules.common.no_installed_harnesses_were_found'))}</p>`;
  const rows = data.harnesses.map(harness => {
    const observed = harness.cacheTokens === 'observed';
    const stateLabel = harness.state === 'supported' ? tr('modules.capabilities.supported') : harness.state === 'partial' ? tr('modules.capabilities.partial') : harness.state;
    const read = observed ? tokenCount(harness.cacheReadTokens) : tr('modules.capabilities.notExposed');
    const created = observed ? tokenCount(harness.cacheCreationTokens) : tr('modules.capabilities.notExposed');
    return `<tr>
      <th scope="row">${escape(harness.name)}</th>
      <td>${escape(deliveryLabel(harness.instructionDelivery))}</td>
      <td><span class="capabilities-state" data-state="${escape(harness.state)}">${escape(stateLabel)}</span></td>
      <td><span class="capabilities-token-label" title="${escape(harness.cacheTokenSource)}">${observed ? tr('modules.capabilities.observed') : tr('modules.capabilities.notExposed')}</span><span class="capabilities-token-value">${escape(read)}</span></td>
      <td><span class="capabilities-token-label" title="${escape(harness.cacheTokenSource)}">${observed ? tr('modules.capabilities.observed') : tr('modules.capabilities.notExposed')}</span><span class="capabilities-token-value">${escape(created)}</span></td>
    </tr>`;
  }).join('');
  return `<div class="capabilities-table-scroll"><table class="capabilities-table capabilities-cache-table" aria-label="${escapeI18n(tr('modules.common.cache_alignment'))}">
    <thead><tr><th scope="col">${escapeI18n(tr('modules.common.harness'))}</th><th scope="col">${escapeI18n(tr('modules.common.stable_instructions'))}</th><th scope="col">${escapeI18n(tr('modules.common.alignment'))}</th><th scope="col">${escapeI18n(tr('modules.common.cache_reads'))}</th><th scope="col">${escapeI18n(tr('modules.common.cache_creation'))}</th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}

/** Read-only Settings panel for local CLI capabilities and prompt-cache alignment. */
export function mount(host: HTMLElement, call: CapabilityCall, taskId?: string): () => void {
  let inventory: CapabilityInventory | null = null;
  let cache: CacheAlignment | null = null;
  let loading = true;
  let inventoryFailed = false;
  let cacheFailed = false;
  let disposed = false;
  let request = 0;
  const args = taskId ? { taskId } : {};
  const draw = () => {
    if (disposed) return;
    host.innerHTML = `<div class="settings-group capabilities-panel" aria-labelledby="capabilities-heading">
      <div class="capabilities-panel-head"><div><strong id="capabilities-heading">${escapeI18n(tr('modules.common.capability_and_cache_alignment'))}</strong><small>${escapeI18n(tr('modules.common.read_only_metadata_from_local_harness_configs_and_recorded_usage'))}</small></div>
        <button type="button" class="secondary-button capabilities-refresh" ${loading ? 'disabled' : ''}>${icon('refresh')}${escape(tr('modules.common.refresh'))}</button>
      </div>
      <section class="capabilities-section" aria-labelledby="capabilities-inventory-heading">
        <h3 id="capabilities-inventory-heading">${escapeI18n(tr('modules.common.capability_inventory'))}</h3>
        ${inventoryTable(inventory, loading && !inventory, inventoryFailed)}
      </section>
      <section class="capabilities-section" aria-labelledby="capabilities-cache-heading">
        <h3 id="capabilities-cache-heading">${escapeI18n(tr('modules.common.cache_alignment'))}</h3>
        ${cacheTable(cache, loading && !cache, cacheFailed)}
        <p class="capabilities-note">${escape(preview ? tr('modules.capabilities.preview') : tr('modules.capabilities.observedCounts'))}</p>
      </section>
    </div>`;
  };
  const refresh = async () => {
    if (disposed || loading && (inventory || cache)) return;
    loading = true;
    inventoryFailed = false;
    cacheFailed = false;
    const current = ++request;
    draw();
    const results = await Promise.allSettled([
      call<CapabilityInventory>('capabilities_inventory', args),
      call<CacheAlignment>('cache_alignment', args),
    ]);
    if (disposed || current !== request) return;
    if (results[0].status === 'fulfilled') inventory = results[0].value;
    else inventoryFailed = true;
    if (results[1].status === 'fulfilled') cache = results[1].value;
    else cacheFailed = true;
    loading = false;
    draw();
  };
  const onClick = (event: MouseEvent) => {
    if ((event.target as Element | null)?.closest('.capabilities-refresh')) void refresh();
  };
  const disposeLocale = onLocaleChange(draw);
  host.addEventListener('click', onClick);
  draw();
  void refresh();
  return () => {
    disposed = true; disposeLocale();
    request++;
    host.removeEventListener('click', onClick);
  };
}

