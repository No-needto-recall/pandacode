import { t as msg } from '../i18n.ts';
import type { TaskStatus } from '../connect/types.ts';

export const isActive = (status: TaskStatus) => status === 'running' || status === 'waiting';

export function ago(ms: number): string {
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 60) return msg('mobile.time.now');
  if (s < 3600) return msg('mobile.time.minutes', { count: Math.floor(s / 60) });
  if (s < 86400) return msg('mobile.time.hours', { count: Math.floor(s / 3600) });
  return msg('mobile.time.days', { count: Math.floor(s / 86400) });
}

export const MODES = [
  { id: 'ask', get label() { return msg("mobile.text.standard"); } },
  { id: 'auto', get label() { return msg("mobile.text.auto_approve_edits"); } },
  { id: 'plan', get label() { return msg("mobile.text.plan_only"); } },
  { id: 'full', get label() { return msg("mobile.text.full_access"); } },
];
