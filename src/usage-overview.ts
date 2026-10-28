import { getLocale } from './i18n.ts';
import { escape as escapeI18n } from './dom.ts';
import { t as tr } from './i18n.ts';
import { escape, icon } from './dom';
import { providerLogo } from './provider-logos';
import { infoMark } from './tooltip';
import type { ProviderId } from './types';
import { costChart } from './usage-cost-chart';
import { formatShare, formatTokens, formatUsd, RANGE_LABEL, type Summary } from './usage-ledger';

export interface AgentLimit { provider: ProviderId; name: string; peak: number | null; state: string; }
export type CostState = { kind: 'pending' } | { kind: 'error'; message: string } | { kind: 'ready'; summary: Summary; tracked: ProviderId[]; pricing: string };

const percent = { format: (value: number) => new Intl.NumberFormat(getLocale(), { maximumFractionDigits: 0 }).format(value) };
const TRACKED_LOGS = 'Claude Code and Codex';

export function tone(value: number): 'exhausted' | 'high' | 'normal' { return value >= 95 ? 'exhausted' : value >= 80 ? 'high' : 'normal'; }

/** A ring for the average of each agent's most-used limit window. */
export function renderLimitHero(host: HTMLElement, limits: readonly AgentLimit[], average: number | null, pending: number): void {
  const reporting = limits.filter(limit => limit.peak !== null).length;
  const value = average ?? 0;
  const circumference = 2 * Math.PI * 26;
  const caption = average === null
    ? pending ? tr('modules.usage.checking') : tr('modules.usage.noAgentLimits')
    : (reporting === 1 ? tr('modules.usage.acrossOne', { count: reporting }) : tr('modules.usage.acrossMany', { count: reporting })) + (pending ? tr('modules.usage.stillChecking', { count: pending }) : '');
  host.dataset.tone = tone(value);
  host.innerHTML = `<svg class="usage-ring" viewBox="0 0 64 64" role="img" aria-label="${average === null ? tr('modules.usage.averageUnavailable') : tr('modules.usage.averagePercent', { percent: percent.format(value) })}">
      <circle cx="32" cy="32" r="26" class="usage-ring-track"/>
      <circle cx="32" cy="32" r="26" class="usage-ring-value" stroke-dasharray="${((Math.min(100, value) / 100) * circumference).toFixed(2)} ${circumference.toFixed(2)}" transform="rotate(-90 32 32)"/>
    </svg>
    <div class="usage-hero-copy"><span class="usage-hero-label">${escape(tr('modules.usage.averageLabel'))} ${infoMark(tr('modules.common.the_average_of_each_agent_s_most_used_limit_window_such_as'), tr('modules.common.about_average_limit_use'))}</span>
      <strong class="usage-hero-value">${average === null ? '—' : `${percent.format(value)}%`}</strong><small>${escape(caption)}</small></div>`;
}

/** Agents in one list: color key for the chart, limit, and estimated cost. Each row opens that agent's tab. */
export function renderAgents(host: HTMLElement, limits: readonly AgentLimit[], cost: CostState): void {
  const summary = cost.kind === 'ready' ? cost.summary : null;
  const total = summary?.totals.cost ?? 0;
  const byProvider = new Map(summary?.agents.map(agent => [agent.provider, agent]));
  const order = [...limits].sort((a, b) => (byProvider.get(b.provider)?.cost ?? -1) - (byProvider.get(a.provider)?.cost ?? -1));
  host.innerHTML = order.map(limit => {
    const agent = byProvider.get(limit.provider);
    const tracked = cost.kind === 'ready' && cost.tracked.includes(limit.provider);
    const amount = agent ? formatUsd(agent.cost) : tracked ? '$0.00' : '';
    const detail = agent
      ? tr('finish.usage.detail', { share: formatShare(agent.cost, total), tokens: formatTokens(agent.tokens), sessions: agent.sessions ? tr(agent.sessions === 1 ? 'finish.usage.sessionOne' : 'finish.usage.sessionMany', { count: agent.sessions }) : '' })
      : tracked ? tr('modules.usage.noUsage') : tr('modules.usage.notTracked');
    const peak = limit.peak === null ? `<span class="usage-agent-limit" data-state="none">${escape(limit.state)}</span>`
      : `<span class="usage-agent-limit" data-tone="${tone(limit.peak)}"><span class="usage-mini-track"><span style="width:${Math.min(100, limit.peak)}%"></span></span>${percent.format(limit.peak)}%</span>`;
    return `<button type="button" class="usage-agent-row" data-provider="${limit.provider}" aria-label="${escape(tr('modules.dynamic.agentUsageDetails', { name: String(limit.name), estimate: String(amount ? tr('finish.usage.estimated', { amount }) : ''), details: String(detail), limit: String(limit.peak === null ? limit.state : tr('finish.usage.limit', { percent: percent.format(limit.peak) })) }))}">
      <span class="usage-agent-dot" data-provider="${limit.provider}" aria-hidden="true"></span>${providerLogo(limit.provider)}
      <span class="usage-agent-copy"><strong>${escape(limit.name)}</strong><small>${escape(detail)}</small></span>
      ${peak}<span class="usage-agent-cost">${escape(amount)}</span>${icon('chevron', 'usage-agent-chevron')}</button>`;
  }).join('');
}

function totalsGrid(summary: Summary): string {
  const t = summary.totals;
  const cells = [
    [tr('modules.usage.processed'), formatTokens(t.tokens)], [tr('modules.usage.cachedInput'), formatTokens(t.cacheRead)], [tr('modules.usage.uncachedInput'), formatTokens(t.input + t.cacheWrite)],
    [tr('modules.usage.output'), formatTokens(t.output)], [tr('modules.usage.cacheSavings'), formatUsd(t.savings)],
  ];
  return `<dl class="usage-totals">${cells.map(([label, value]) => `<div><dt>${label}</dt><dd>${escape(value)}</dd></div>`).join('')}</dl>`;
}

function breakdownTable(summary: Summary, by: 'model' | 'day'): string {
  const total = summary.totals.cost;
  const date = new Intl.DateTimeFormat(getLocale(), { weekday: 'short', month: 'short', day: 'numeric' });
  const rows = by === 'model'
    ? summary.models.map(row => `<tr><th scope="row">${providerLogo(row.provider)}<span>${escape(row.model)}</span>${row.priced ? '' : `<small>${escapeI18n(tr('modules.common.unpriced'))}</small>`}</th><td>${row.priced ? formatUsd(row.cost) : '—'}</td><td>${formatShare(row.cost, total)}</td><td>${formatTokens(row.tokens)}</td></tr>`)
    : [...summary.dailyCost].reverse().filter(day => day.tokens > 0).map(day => {
      const [y, m, d] = day.date.split('-').map(Number);
      return `<tr><th scope="row"><span>${escape(date.format(new Date(y, m - 1, d)))}</span></th><td>${formatUsd(day.cost)}</td><td>${formatShare(day.cost, total)}</td><td>${formatTokens(day.tokens)}</td></tr>`;
    });
  return `<table class="usage-breakdown"><thead><tr><th scope="col">${by === 'model' ? tr('modules.common.model') : tr('modules.common.day')}</th><th scope="col">${escapeI18n(tr('modules.common.cost'))}</th><th scope="col">${escapeI18n(tr('modules.common.share'))}</th><th scope="col">${escapeI18n(tr('modules.common.tokens'))}</th></tr></thead>
    <tbody>${rows.join('') || `<tr><td colspan="4" class="usage-breakdown-empty">${escapeI18n(tr('modules.common.no_usage_in_this_period'))}</td></tr>`}</tbody></table>`;
}

/** The cost headline for the selected range; the chart, totals, and breakdown follow it. */
export function renderCostHero(host: HTMLElement, cost: CostState): void {
  const about = tr('modules.usage.costHelp', { logs: TRACKED_LOGS });
  const label = `<span class="usage-hero-label">${escape(tr('modules.usage.estimatedCost'))} ${infoMark(cost.kind === 'ready' ? `${about} ${cost.pricing}` : about, tr('modules.common.about_estimated_api_cost'))}</span>`;
  if (cost.kind === 'pending') { host.innerHTML = `${label}<strong class="usage-hero-value usage-hero-pending">$—</strong><small role="status">${escapeI18n(tr('modules.common.reading_local_agent_logs'))}</small>`; return; }
  if (cost.kind === 'error') { host.innerHTML = `${label}<strong class="usage-hero-value">—</strong><small role="alert">${escape(cost.message)}</small>`; return; }
  const { summary } = cost;
  const unpriced = summary.totals.unpricedTokens / (summary.totals.tokens || 1);
  const notes = [summary.sessions === 1 ? tr('modules.usage.sessionCountOne', { count: summary.sessions }) : tr('modules.usage.sessionCountMany', { count: summary.sessions }), RANGE_LABEL[summary.range].toLowerCase()];
  if (unpriced > 0) notes.push(tr('modules.usage.unpricedExcluded', { share: formatShare(summary.totals.unpricedTokens, summary.totals.tokens) }));
  host.innerHTML = `${label}<strong class="usage-hero-value">${formatUsd(summary.totals.cost)}</strong><small>${escape(notes.join(' · '))}</small>`;
}

export function renderCostDetails(host: HTMLElement, cost: CostState, names: (id: ProviderId) => string, breakdown: 'model' | 'day'): void {
  if (cost.kind !== 'ready') { host.replaceChildren(); return; }
  const { summary } = cost;
  if (!summary.totals.tokens) {
    host.innerHTML = `<p class="usage-cost-empty">${cost.tracked.length ? tr('modules.usage.noTrackedUsage', { logs: TRACKED_LOGS }) : tr('modules.usage.noTrackedLogs', { logs: TRACKED_LOGS })}</p>`;
    return;
  }
  const chart = document.createElement('section'); chart.className = 'usage-section usage-chart-section';
  chart.innerHTML = `<h3>${summary.range === 'year' ? tr('modules.usage.weeklyCost') : tr('modules.usage.dailyCost')}</h3>`;
  chart.append(costChart({ series: summary.series.map(line => ({ ...line, name: names(line.provider) })), buckets: summary.buckets }));
  const totals = document.createElement('section'); totals.className = 'usage-section';
  totals.innerHTML = `<h3>${escapeI18n(tr('modules.common.totals'))}</h3>${totalsGrid(summary)}`;
  const table = document.createElement('section'); table.className = 'usage-section usage-breakdown-section';
  table.innerHTML = `<header class="usage-section-heading"><h3>${escapeI18n(tr('modules.common.breakdown'))}</h3><div class="usage-segmented usage-breakdown-switch" role="group" aria-label="${escapeI18n(tr('modules.common.break_down_by'))}">
      <button type="button" data-breakdown="model" aria-pressed="${breakdown === 'model'}">${escapeI18n(tr('modules.common.model'))}</button><button type="button" data-breakdown="day" aria-pressed="${breakdown === 'day'}">${escapeI18n(tr('modules.common.day'))}</button></div></header>
    <div class="usage-breakdown-scroll">${breakdownTable(summary, breakdown)}</div>`;
  host.replaceChildren(chart, totals, table);
}

/** Per-agent cost strip inside an agent tab. */
export function agentCostStrip(provider: ProviderId, cost: CostState): string {
  if (cost.kind !== 'ready' || !cost.tracked.includes(provider)) return '';
  const agent = cost.summary.agents.find(entry => entry.provider === provider);
  const models = cost.summary.models.filter(model => model.provider === provider);
  const stats = agent
    ? [[formatUsd(agent.cost), tr('modules.usage.estimatedCost')], [formatTokens(agent.tokens), tr('modules.common.tokens')], [formatTokens(agent.cacheRead), tr('modules.usage.cachedInput')], [String(agent.sessions), agent.sessions === 1 ? tr('modules.usage.session') : tr('modules.usage.sessions')]]
    : [['$0.00', tr('modules.usage.estimatedCost')]];
  return `<section class="usage-section usage-agent-cost-section"><h3>${escape(RANGE_LABEL[cost.summary.range])}</h3>
    <dl class="usage-totals usage-totals-compact">${stats.map(([value, label]) => `<div><dt>${escape(label)}</dt><dd>${escape(value)}</dd></div>`).join('')}</dl>
    ${models.length ? `<ul class="usage-model-list">${models.map(model => `<li><span>${escape(model.model)}</span><span>${model.priced ? formatUsd(model.cost) : tr('modules.common.unpriced')}</span><span>${formatTokens(model.tokens)}</span></li>`).join('')}</ul>` : ''}</section>`;
}
