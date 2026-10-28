import { escape as escapeI18n } from './dom.ts';
import { t as tr } from './i18n.ts';
// Jujutsu (jj) in the Changes tab: the working-copy change, its files, Describe/New/Commit,
// and a short log. A non-colocated jj repo gets this panel instead of the Git one; a
// colocated repo keeps the Git UI and shows `jjChip()` beside the branch. Native side: jj.rs.
import { escape, icon } from './dom';

export interface JjChange { changeId: string; commitId: string; description: string; bookmarks: string[]; author: string; when: string; conflict: boolean; empty: boolean; current: boolean; }
export interface JjFile { status: string; path: string; }
export interface JjStatus { isRepo: boolean; colocated: boolean; change: JjChange | null; files: JjFile[]; }
export type JjContext = { projectId: string; sessionId?: string };
export interface JjCallbacks {
  call<T>(command: string, args: Record<string, unknown>): Promise<T>;
  context(): JjContext;
  /** Show a file's patch (git format) in the inspector's diff viewer. */
  openDiff(path: string, patch: string): void;
  notify(message: string): void;
  /** The status after an action, so the caller's copy stays current. */
  changed?(status: JjStatus): void;
}

const LOG_LIMIT = 20;
/** The last log read, so the inspector's frequent redraws don't rerun `jj log` for the same change. */
let cachedLog: { key: string; log: JjChange[] } | null = null;

const title = (change: JjChange) => change.description.split('\n')[0] || tr('finish.jj.noDescription');
const bookmarks = (change: JjChange) => change.bookmarks.map(name => `<span class="jj-bookmark">${escape(name)}</span>`).join(' ');

/** A small label for colocated repos, placed inside the Git branch card. */
export function jjChip(status: JjStatus | null): string {
  if (!status?.isRepo || !status.change) return '';
  const change = status.change;
  return `<span class="jj-chip" title="${escape(tr('modules.dynamic.jjChange', { id: String(change.changeId), description: String(title(change)) }))}">jj ${escape(change.changeId.slice(0, 8))}${change.conflict ? tr('finish.jj.conflict') : ''}</span>`;
}

export function jjPanelHtml(status: JjStatus, log: JjChange[] | null, busy = false): string {
  const change = status.change;
  const files = status.files.map(file => `<div class="change-row"><button class="change-file" data-jj="diff" data-path="${escape(file.path)}">${icon('file')}<span><strong>${escape(file.path.split('/').pop())}</strong><small>${escape(file.path.includes('/') ? file.path.slice(0, file.path.lastIndexOf('/')) : tr('finish.jj.root'))}</small></span><span class="file-status ${file.status === 'A' ? 'new' : ''}">${escape(file.status)}</span></button></div>`).join('');
  const rows = (log ?? []).map(item => `<div class="change-row jj-log-row${item.current ? ' current' : ''}"><span class="change-file"><span><strong>${escape(title(item))}</strong><small>${escape(item.changeId.slice(0, 8))} · ${escape(item.author || tr('finish.jj.unknown'))} · ${escape(item.when)}${item.conflict ? tr('finish.jj.conflict') : ''}</small></span>${bookmarks(item)}</span></div>`).join('');
  const disabled = busy ? 'disabled' : '';
  return `<div class="jj-panel" aria-busy="${busy}">
<div class="branch-card"><span>${icon('branch')}<span><code>${escape(change?.changeId.slice(0, 8) ?? '')}</code> ${escape(change ? title(change) : tr('finish.jj.noWorkingCopy'))}</span></span>${change ? bookmarks(change) : ''}</div>
${change?.conflict ? `<p class="inspector-hint" role="alert">${icon('alert')}${tr('finish.jj.resolve', { command: 'jj resolve' }).split('jj resolve').map(escape).join('<code>jj resolve</code>')}</p>` : ''}
<div class="change-summary"><span>${status.files.length ? tr('finish.jj.changedFiles', { count: status.files.length }) : tr('finish.jj.empty')}</span>${status.files.length ? '' : icon('check')}</div>
${files ? `<section class="change-group"><div class="change-group-title"><span>${escapeI18n(tr('modules.common.changes'))} <small>${status.files.length}</small></span></div>${files}</section>` : ''}
<form class="commit-form jj-form"><label for="jj-message">${escapeI18n(tr('modules.common.description'))}</label><textarea id="jj-message" rows="3" placeholder="${escapeI18n(tr('modules.common.describe_this_change'))}" aria-label="${escapeI18n(tr('modules.common.change_description'))}">${escape(change?.description ?? '')}</textarea>
<div class="jj-actions"><button type="button" class="secondary-button" data-jj="describe" ${disabled}>${escapeI18n(tr('modules.common.describe'))}</button><button type="button" class="secondary-button" data-jj="new" ${disabled}>${icon('plus')}${escape(tr('finish.jj.new'))}</button><button class="commit-button" data-jj="commit" ${disabled}>${icon('check')}${escape(tr('finish.jj.commit'))}</button></div></form>
<section class="change-group jj-log"><div class="change-group-title"><span>${escape(tr('finish.jj.log'))}${log ? ` <small>${log.length}</small>` : ''}</span></div>${log ? rows || `<p class="inspector-hint">${escapeI18n(tr('modules.common.no_changes_yet'))}</p>` : `<p class="inspector-hint" role="status">${escapeI18n(tr('modules.common.loading_log'))}</p>`}</section>
</div>`;
}

/** Renders the panel into `target`, loads the log, and handles its actions. */
export function showJjPanel(container: HTMLElement, initial: JjStatus, callbacks: JjCallbacks): void {
  // Handlers live on our own element, so nothing stays bound when the inspector redraws.
  const target = document.createElement('div');
  container.replaceChildren(target);
  const context = callbacks.context();
  const keyOf = (s: JjStatus) => `${context.projectId}\0${context.sessionId ?? ''}\0${s.change?.commitId ?? ''}`;
  let status = initial, busy = false;
  let log: JjChange[] | null = cachedLog?.key === keyOf(initial) ? cachedLog.log : null;
  const draw = () => {
    // Keep a description being typed across redraws.
    const typed = target.querySelector<HTMLTextAreaElement>('#jj-message')?.value;
    target.innerHTML = jjPanelHtml(status, log, busy);
    if (typed !== undefined && !busy) target.querySelector<HTMLTextAreaElement>('#jj-message')!.value = typed;
  };
  const loadLog = async () => {
    const key = keyOf(status);
    try { log = await callbacks.call<JjChange[]>('jj_log', { ...context, limit: LOG_LIMIT }); cachedLog = { key, log }; } catch (error) { log = []; callbacks.notify(text(error)); }
    if (target.isConnected) draw();
  };
  const act = async (command: 'jj_describe' | 'jj_new' | 'jj_commit', message?: string) => {
    busy = true; draw();
    try {
      status = await callbacks.call<JjStatus>(command, message === undefined ? context : { ...context, message });
      busy = false; log = null;
      // A new change starts with an empty description.
      target.innerHTML = jjPanelHtml(status, log); callbacks.changed?.(status); void loadLog();
    } catch (error) { busy = false; draw(); callbacks.notify(text(error)); }
  };
  target.onclick = event => {
    const button = (event.target as Element).closest<HTMLElement>('[data-jj]');
    if (!button || busy) return;
    event.preventDefault();
    const message = target.querySelector<HTMLTextAreaElement>('#jj-message')?.value ?? '';
    switch (button.dataset.jj) {
      case 'describe': void act('jj_describe', message); break;
      case 'new': void act('jj_new'); break;
      case 'commit':
        if (!message.trim()) { callbacks.notify(tr('modules.common.write_a_description_before_committing')); return; }
        void act('jj_commit', message); break;
      case 'diff': {
        const path = button.dataset.path ?? '';
        callbacks.call<string>('jj_diff', { ...context, path }).then(patch => callbacks.openDiff(path, patch), error => callbacks.notify(text(error)));
        break;
      }
    }
  };
  target.onsubmit = event => event.preventDefault();
  draw();
  if (!log) void loadLog();
}

function text(error: unknown): string { return error instanceof Error ? error.message : String(error); }
