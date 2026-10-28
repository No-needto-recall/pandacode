import { escape as escapeI18n } from './dom.ts';
import { t as tr } from './i18n.ts';
import './coordination-message.css';
import type { Message } from './types';
import { icon } from './dom';

/** Only app-origin rows use this renderer; user JSON stays ordinary conversation. */
export function renderCoordination(message: Message): string {
  const label = message.coordinationKind === 'worker_review' ? 'Reviewing worker results'
    : message.coordinationKind === 'worker_update' ? 'Checking worker updates'
    : message.coordinationKind === 'continue' ? 'Continuing the plan'
    : message.coordinationKind === 'worker_failed' ? 'Handling a failed worker' : 'Coordinating team';
  return `<div class="coordination-status" role="note" aria-label="${escapeI18n(tr('modules.common.team_status'))}">${icon('worktree')}<strong>${escapeI18n(tr('modules.common.team'))}</strong><span>${label}</span></div>`;
}
