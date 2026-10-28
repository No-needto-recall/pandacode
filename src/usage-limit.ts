import { getLocale } from './i18n.ts';
import { escape as escapeI18n } from './dom.ts';
import { t as tr } from './i18n.ts';
/** Usage limits hit by a task's run: the composer banner and when a limit counts as current. */
import { escape, icon } from './dom';
import type { Session } from './types';

const time = { format: (value: number | Date) => new Intl.DateTimeFormat(getLocale(), { hour: 'numeric', minute: '2-digit' }).format(value) };
const day = { format: (value: number | Date) => new Intl.DateTimeFormat(getLocale(), { weekday: 'short', hour: 'numeric', minute: '2-digit' }).format(value) };

/** A limit is current until its reset passes; one with an unknown reset stays until resolved. */
export function limitActive(task: Pick<Session, 'limitedAt' | 'limitedUntil'>, now = Date.now()): boolean {
  return Boolean(task.limitedAt) && (task.limitedUntil == null || task.limitedUntil > now);
}

export function resetLabel(until: number | null | undefined, now = Date.now()): string {
  if (!until) return tr('modules.usage.resetUnknown');
  const sameDay = new Date(until).toDateString() === new Date(now).toDateString();
  return tr('modules.usage.resets', { time: (sameDay ? time : day).format(until) });
}

/** Banner above the composer for a limited task that is not running. `alternatives` are the
 *  harness's other named connections, offered as Continue on <name> (never automatic). */
export function limitBanner(task: Session, now = Date.now(), alternatives: { id: string; name: string }[] = []): string {
  if (!task.limitedAt) return '';
  const passed = task.limitedUntil != null && task.limitedUntil <= now;
  const status = passed ? tr('modules.usage.reset') : tr('modules.usage.reached', { reset: resetLabel(task.limitedUntil, now) });
  const toggle = task.limitedUntil && !passed
    ? `<label class="limit-resume"><input type="checkbox" class="limit-resume-switch" ${task.resumeAtReset ? 'checked' : ''}><span>${escapeI18n(tr('modules.common.resume_at_reset'))}</span></label>` : '';
  return `<section class="limit-banner" aria-label="${escapeI18n(tr('modules.common.usage_limit'))}" data-passed="${passed}">${icon('alert')}<span class="limit-status" role="status">${escape(status)}</span>${toggle}
    <button type="button" class="limit-continue" data-action="limit-continue">${escapeI18n(tr('modules.common.continue_now'))}</button>${passed ? '' : alternatives.map(c => `<button type="button" class="limit-continue" data-action="limit-switch" data-connection="${escape(c.id)}">${escape(tr('modules.usage.continueOn', { name: c.name }))}</button>`).join('')}<button type="button" class="icon-button" data-action="limit-dismiss" aria-label="${escapeI18n(tr('modules.common.dismiss_usage_limit'))}" title="${escapeI18n(tr('modules.common.dismiss'))}">${icon('close')}</button></section>`;
}
