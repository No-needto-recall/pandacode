import { getLocale } from './i18n.ts';
import { t as tr } from './i18n.ts';
import type { ContextUsage, ProviderId, ProviderModel } from './types';

/** Unknown IDs stay literal; never infer a version from a moving alias. */
export function fallbackModel(provider: ProviderId, id = 'default'): ProviderModel {
  id ||= 'default';
  if (id === 'default' && provider === 'glm') return { id, name: 'GLM-5.3', description: tr('modules.common.default_z_ai_coding_plan_model_via_claude_code') };
  if (id === 'default' && provider === 'mimo') return { id, name: 'MiMo-V2.6-Pro', description: tr('modules.common.default_mimo_token_plan_model_via_claude_code') };
  if (id === 'default') return { id, name: tr('modules.common.default'), description: tr('modules.common.uses_the_model_selected_by_your_harness') };
  const alias = provider === 'claude' ? ({ sonnet: 'Claude Sonnet', opus: 'Claude Opus', haiku: 'Claude Haiku' } as Record<string, string>)[id] : '';
  return { id, name: alias || id, description: alias ? tr('modules.common.version_resolved_by_claude_code') : '' };
}

/** Harnesses that accept only the model IDs they advertise: no custom IDs. */
export function advertisedModelsOnly(provider: ProviderId): boolean {
  return provider === 'github-copilot' || provider === 'devin';
}

export function modelChoices(provider: ProviderId, catalog: ProviderModel[], current = ''): ProviderModel[] {
  const models = new Map<string, ProviderModel>([['default', fallbackModel(provider)]]);
  for (const model of catalog) if (model.id) models.set(model.id, model);
  if (current && !models.has(current)) models.set(current, fallbackModel(provider, current));
  return [...models.values()];
}

export function tokenCount(value: number): string {
  return new Intl.NumberFormat(getLocale(), { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

export function contextSummary(usage?: ContextUsage | null, capacity?: number | null): { label: string; detail: string } | null {
  const window = usage?.contextWindow ?? capacity;
  if (usage) {
    const used = tokenCount(usage.usedTokens);
    return window
      ? { label: tr('modules.model.contextUsed', { used, capacity: tokenCount(window) }), detail: tr('modules.model.contextDetail', { used: usage.usedTokens.toLocaleString(getLocale()), capacity: window.toLocaleString(getLocale()), percent: Math.round(usage.usedTokens / window * 100) }) }
      : { label: tr('modules.model.contextTokens', { used }), detail: tr('modules.model.contextUnknown', { used: usage.usedTokens.toLocaleString(getLocale()) }) };
  }
  return window ? { label: tr('modules.model.contextCapacity', { capacity: tokenCount(window) }), detail: tr('modules.model.contextCapacityDetail', { capacity: window.toLocaleString(getLocale()) }) } : null;
}

export function parseContextUsage(value: unknown): ContextUsage | null {
  if (!value || typeof value !== 'object') return null;
  const { usedTokens, contextWindow } = value as Record<string, unknown>;
  if (typeof usedTokens !== 'number' || !Number.isSafeInteger(usedTokens) || usedTokens < 0 || usedTokens > 1_000_000_000) return null;
  if (contextWindow != null && (typeof contextWindow !== 'number' || !Number.isSafeInteger(contextWindow) || contextWindow <= 0 || contextWindow > 1_000_000_000)) return null;
  return { usedTokens, contextWindow: (contextWindow as number | null) ?? null };
}
