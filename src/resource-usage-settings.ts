import { escape as escapeI18n } from './dom.ts';
import { t as tr, onLocaleChange, formatNumber } from './i18n.ts';
import { call, preview } from './bridge';
import { escape, icon, morph } from './dom';
import type { Metrics } from './types';

const megabytes = (value: number) => `${formatNumber(value / 1048576, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} MB`;

/** Settings → About: a snapshot of PandaCode's own resource use, refreshed on demand. */
export function resourceUsageHtml(): string {
  return `<div class="settings-group settings-resources" aria-labelledby="settings-resources-heading">
    <div class="setting-row"><div><strong id="settings-resources-heading">${escapeI18n(tr('modules.common.resource_usage'))}</strong><small>${preview ? tr('modules.resources.preview') : tr('modules.resources.core')}</small></div><button type="button" class="secondary-button settings-resources-refresh">${icon('refresh')}${escape(tr('modules.common.refresh'))}</button></div>
    <div class="setting-row"><div><strong>${escapeI18n(tr('modules.common.native_core_memory'))}</strong></div><span class="settings-metric" data-metric="coreRssBytes">…</span></div>
    <div class="setting-row"><div><strong>${escapeI18n(tr('modules.common.active_agents'))}</strong></div><span class="settings-metric" data-metric="activeAgents">…</span></div>
    <div class="setting-row"><div><strong>${escapeI18n(tr('modules.common.open_terminals'))}</strong></div><span class="settings-metric" data-metric="activeTerminals">…</span></div>
    <div class="setting-row"><div><strong>${escapeI18n(tr('modules.common.local_database'))}</strong></div><span class="settings-metric" data-metric="databaseBytes">…</span></div>
  </div>`;
}

function format(key: keyof Metrics, metrics: Metrics): string {
  if (key === 'coreRssBytes' || key === 'databaseBytes') return preview ? '—' : megabytes(metrics[key]);
  return String(metrics[key]);
}

export function mountResourceUsage(host: HTMLElement): () => void {
  const button = host.querySelector<HTMLButtonElement>('.settings-resources-refresh')!;
  const cells = [...host.querySelectorAll<HTMLElement>('[data-metric]')];
  let disposed = false;
  const refresh = async () => {
    button.disabled = true;
    try {
      const metrics = await call<Metrics>('get_metrics');
      if (disposed) return;
      for (const cell of cells) cell.textContent = format(cell.dataset.metric as keyof Metrics, metrics);
    } catch (cause) {
      console.error('Reading resource usage failed', cause);
      if (!disposed) for (const cell of cells) cell.innerHTML = `<span title="${escape(String(cause))}">${escapeI18n(tr('modules.common.unavailable'))}</span>`;
    } finally {
      if (!disposed) button.disabled = false;
    }
  };
  const disposeLocale = onLocaleChange(() => {
    const next = document.createElement('div'); next.innerHTML = resourceUsageHtml();
    const selector = 'strong, small, .settings-resources-refresh';
    const fresh = [...next.querySelectorAll(selector)];
    host.querySelectorAll(selector).forEach((element, index) => { if (fresh[index]) morph(element, fresh[index].innerHTML, 20); });
  });
  const click = () => { void refresh(); };
  button.addEventListener('click', click);
  void refresh();
  return () => { disposed = true; disposeLocale(); button.removeEventListener('click', click); };
}
