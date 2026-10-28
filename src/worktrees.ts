import { escape as escapeI18n } from './dom.ts';
import { t as tr, type MessageKey } from './i18n.ts';
import './worktrees.css';
import { escape, icon } from './dom';
import { githubEnabled } from './github';
import type { BranchList, GitStatus, Project, Session, WorktreeMerge, WorktreeStatus, WorktreeRemoval } from './types';

/* One branch control for every task. The chip above the prompt names the checkout
 * and opens the only worktree menu; dialogs convert an unstarted task in place,
 * spawn a sibling task for a started one, and never remove work without consent. */

type ChoiceItem = { id: string; label: string; description?: string; icon?: string; disabled?: boolean };
export type WorktreeHost = {
  call<T>(command: string, args?: Record<string, unknown>): Promise<T>;
  modal(title: string, body: string, cls?: string): HTMLDialogElement;
  closeModal(): void;
  notify(text: string): void;
  showChoices(anchor: HTMLElement, options: { title: string; items: ChoiceItem[]; actions?: boolean; width?: number; onSelect: (id: string) => void | Promise<void> }): Promise<void>;
  session(): Session | undefined;
  project(): Project | undefined;
  git(): GitStatus | null;
  gitError(): string;
  draft(): string;
  /** The task has no history, so a worktree can be attached to it in place. */
  attachable(): boolean;
  running(): boolean;
  /** `live` is false when the dialog was dismissed before the request finished;
   *  `current` says whether the source task is still the selected one. */
  afterAttach(session: Session, live: boolean): Promise<void>;
  afterCreate(session: Session, live: boolean, current: boolean): Promise<void>;
  /** The checkout moved to another branch; reload its status. */
  branchChanged(): Promise<void>;
  /** Settle the task (stage completed) without asking about its checkout again. */
  settle(session: Session): Promise<void>;
  /** Extra menu rows from integrations, with their own handler. */
  extraItems(session: Session): ChoiceItem[];
  /** The computer control (PandaCode Connect) for the context bar; empty when there is none. */
  computer(session: Session, fresh: boolean): string;
  onExtra(id: string, session: Session, anchor: HTMLElement): Promise<void> | void;
};
export type CleanupIntent = 'complete' | 'remove';
export type CleanupDecision = { proceed: boolean; remove: boolean };

export function worktreeMissing(session: Session | undefined, gitError: string): boolean {
  return Boolean(session?.worktreePath) && /worktree/i.test(gitError);
}

/** A branch-safe suggestion from a title, draft, or linked issue. */
export function suggestBranch(session: Session | undefined, draft: string): string {
  const source = session?.issue ? `${session.issue.number} ${session.issue.title}` : session && session.title !== 'New conversation' ? session.title : draft;
  // Whole words only, up to 40 characters, so a suggestion never ends mid-word.
  const words = source.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
  let slug = '';
  for (const word of words) { if (slug && slug.length + 1 + word.length > 40) break; slug = slug ? `${slug}-${word}` : word.slice(0, 40); }
  return slug;
}
export function finalBranchName(name: string): string {
  const trimmed = name.trim();
  return /^(pandacode|kingcode|codex)\//.test(trimmed) ? trimmed : trimmed ? `pandacode/${trimmed}` : '';
}
const BRANCH_PATTERN = /^(?!.*\.\.)[A-Za-z0-9_/-]+$/;

function codeMessage(key: MessageKey, code: Record<string, string>, params?: Record<string, string | number>, tag: 'code' | 'strong' = 'code'): string {
  return tr(key, params).split(/(\{[A-Za-z][A-Za-z0-9_]*\})/g).map(part => {
    const name = part.slice(1, -1);
    return part.startsWith('{') && part.endsWith('}') && Object.hasOwn(code, name) ? `<${tag}>${escape(code[name])}</${tag}>` : escape(part);
  }).join('');
}

function linkState(state = 'open'): string {
  switch (state) {
    case 'open': return tr('finish.worktree.open');
    case 'closed': return tr('finish.worktree.closed');
    case 'merged': return tr('finish.worktree.merged');
    default: return state;
  }
}

export function createWorktrees(host: WorktreeHost) {
  let cleanup: { resolve: (decision: CleanupDecision) => void; dialog: HTMLDialogElement } | undefined;

  function checkoutLabel(session: Session): string {
    return session.worktreePath ? tr('finish.worktree.checkout') : tr('finish.worktree.local');
  }

  /** The context bar for the prompt: project, checkout kind, branch chip, and linked work. */
  function contextBar(session: Session, fresh: boolean): string {
    const project = host.project(), git = host.git(), missing = worktreeMissing(session, host.gitError());
    const branch = session.worktreePath && (missing || !git?.branch) ? session.worktreeBranch || '' : git?.branch || '';
    const path = session.worktreePath ?? project?.path ?? '';
    const projectControl = fresh
      ? `<button type="button" id="composer-project" class="composer-project" data-action="change-task-project" aria-label="${escapeI18n(tr('modules.common.change_task_project'))}" aria-haspopup="dialog" aria-expanded="false" title="${escape(project?.path)}" ${session.worktreePath ? 'disabled' : ''}>${icon('folder')}<span>${escape(project?.name)}</span>${icon('down')}</button>`
      : `<span class="composer-project composer-project-fixed" title="${escape(project?.path)}">${icon('folder')}<span>${escape(project?.name)}</span></span>`;
    // A task on another computer has its checkout there: name the branch, offer no local actions.
    const chip = session.remoteDevice
      ? `<span class="branch-chip branch-chip-fixed" title="${escape(tr('finish.worktree.remoteActions', { computer: session.remoteDevice.name }))}">${icon(session.worktreePath ? 'worktree' : 'branch')}<span class="branch-chip-name">${escape(session.worktreeBranch || tr('finish.worktree.remote'))}</span></span>`
      : git?.isRepo || session.worktreePath
      ? `<button type="button" id="branch-chip" class="branch-chip ${missing ? 'branch-chip-missing' : ''}" data-action="branch-menu" aria-label="${escapeI18n(tr('modules.common.branch_and_worktree_actions'))}" aria-haspopup="dialog" aria-expanded="false" title="${escape(path)}">${icon(missing ? 'alert' : 'branch')}<span class="branch-chip-name">${escape(missing ? tr('finish.worktree.missing') : branch || tr('finish.worktree.detached'))}</span>${icon('down')}</button>`
      : '';
    const links = [session.issue, session.pullRequest].filter(Boolean).map(link => linkChip(link!, session.id)).join('');
    return `<div class="composer-context ${fresh ? '' : 'composer-context-compact'}">${projectControl}${host.computer(session, fresh)}<span class="composer-local" title="${escape(path)}">${icon(session.worktreePath ? 'worktree' : 'terminal')}${checkoutLabel(session)}</span>${chip}${links}</div>`;
  }

  async function showMenu(anchor: HTMLElement): Promise<void> {
    const session = host.session(); if (!session || session.remoteDevice) return;
    const project = host.project(), git = host.git(), missing = worktreeMissing(session, host.gitError());
    const path = session.worktreePath ?? project?.path ?? '';
    const branch = missing ? session.worktreeBranch || tr('finish.worktree.unknownBranch') : git?.branch || session.worktreeBranch || tr('finish.worktree.detached');
    const items: ChoiceItem[] = [{ id: 'checkout', label: branch, description: `${checkoutLabel(session)} · ${path}`, icon: session.worktreePath ? 'worktree' : 'branch', disabled: true }];
    if (missing) {
      items.push({ id: 'worktree-recreate', label: tr('modules.common.recreate_worktree'), description: tr('modules.common.check_the_branch_out_again_at_the_same_path'), icon: 'refresh' });
      items.push({ id: 'settle-task', label: tr('modules.common.settle_task'), description: tr('modules.common.keep_the_history_forget_the_checkout'), icon: 'check' });
    } else if (session.worktreePath) {
      const target = (await host.call<BranchList>('git_branches', { projectId: session.projectId, sessionId: session.id }).catch(() => null))?.defaultBranch || 'main';
      items.push({ id: 'worktree-merge', label: tr('modules.dynamic.mergeInto', { branch: String(target) }), description: host.running() ? tr('modules.common.wait_for_the_agent_to_finish') : tr('modules.common.locally_in_the_project_checkout_commit_first'), icon: 'merge', disabled: host.running() });
      items.push(...host.extraItems(session));
      items.push({ id: 'worktree-remove', label: tr('modules.common.remove_worktree'), description: tr('modules.common.settles_the_task_refuses_when_work_would_be_lost'), icon: 'close', disabled: host.running() });
      items.push({ id: 'copy-path', label: tr('modules.common.copy_worktree_path'), icon: 'copy' });
    } else {
      // The project's own checkout can move between branches; worktree tasks keep theirs.
      const list = await host.call<BranchList>('git_branches', { projectId: session.projectId, sessionId: session.id }).catch(() => null);
      if (list) {
        const busy = host.running(), others = list.branches.filter(name => name !== list.current);
        if (list.defaultBranch && list.defaultBranch !== list.current) items.push({ id: 'switch-default', label: tr('modules.dynamic.switchTo', { branch: String(list.defaultBranch) }), description: busy ? tr('modules.common.wait_for_the_agent_to_finish') : tr('modules.common.uncommitted_changes_come_along_when_they_don_t_conflict'), icon: 'branch', disabled: busy });
        if (others.length) items.push({ id: 'switch-other', label: tr('modules.common.other_branch'), description: busy ? tr('modules.common.wait_for_the_agent_to_finish') : `${others.length} local ${others.length === 1 ? 'branch' : 'branches'}`, icon: 'branch', disabled: busy });
      }
      if (host.attachable()) items.push({ id: 'worktree-attach', label: tr('modules.common.work_in_a_new_worktree'), description: tr('modules.common.keeps_this_draft_and_task_isolates_its_changes'), icon: 'worktree' });
      else items.push({ id: 'worktree-new', label: tr('modules.common.new_task_in_a_worktree'), description: tr('modules.common.same_harness_and_model_in_an_isolated_checkout'), icon: 'worktree' });
      items.push(...host.extraItems(session));
      items.push({ id: 'copy-path', label: tr('modules.common.copy_project_path'), icon: 'copy' });
    }
    await host.showChoices(anchor, { title: tr('modules.common.branch_and_worktree'), width: 320, actions: true, items, onSelect: async id => {
      const current = host.session(); if (!current || current.id !== session.id) return;
      switch (id) {
        case 'worktree-attach': openDialog('attach'); break;
        case 'worktree-new': openDialog('new'); break;
        case 'worktree-remove': await removeInteractive(current); break;
        case 'worktree-merge': await merge(current); break;
        case 'worktree-recreate': await recreate(current); break;
        case 'switch-default': await switchTo(current, ''); break;
        // The picker replaces this menu, so it opens once this one has closed.
        case 'switch-other': window.setTimeout(() => void pickBranch(current, anchor), 0); break;
        case 'settle-task': await host.settle(current); break;
        case 'copy-path': await navigator.clipboard.writeText(path); host.notify(current.worktreePath ? tr('modules.common.worktree_path_copied') : tr('modules.common.project_path_copied')); break;
        default: await host.onExtra(id, current, anchor);
      }
    } });
  }

  /** Check out `branch` (or the default branch when empty) in the task's own checkout. */
  async function switchTo(session: Session, branch: string): Promise<void> {
    try {
      const target = branch || (await host.call<BranchList>('git_branches', { projectId: session.projectId, sessionId: session.id })).defaultBranch;
      if (!target) { host.notify(tr('modules.common.this_repository_has_no_main_branch')); return; }
      const list = await host.call<BranchList>('git_switch_branch', { projectId: session.projectId, sessionId: session.id, branch: target });
      host.notify(tr('modules.dynamic.switched', { branch: String(list.current) }));
      // Refresh once the menu has closed: an open menu keeps the context bar from redrawing its chip.
      window.setTimeout(() => void host.branchChanged(), 0);
    } catch (cause) {
      host.notify(tr('modules.dynamic.switchFailed', { error: String(cause instanceof Error ? cause.message : String(cause)) }));
    }
  }

  async function pickBranch(session: Session, anchor: HTMLElement): Promise<void> {
    const list = await host.call<BranchList>('git_branches', { projectId: session.projectId, sessionId: session.id }).catch(() => null);
    const others = list?.branches.filter(name => name !== list.current) ?? [];
    if (!others.length) { host.notify(tr('modules.common.there_are_no_other_local_branches')); return; }
    // The context bar may have redrawn its chip meanwhile; anchor to the one on screen.
    const target = anchor.isConnected ? anchor : document.querySelector<HTMLElement>('#branch-chip');
    if (!target) return;
    await host.showChoices(target, { title: tr('modules.common.switch_branch'), width: 320, ...(others.length > 8 ? { searchPlaceholder: tr('finish.worktree.search') } : {}), items: others.map(name => ({ id: name, label: name, icon: 'branch', ...(name === list?.defaultBranch ? { description: tr('modules.common.main_branch') } : {}) })), onSelect: async name => {
      const current = host.session(); if (current?.id === session.id) await switchTo(current, name);
    } });
  }

  function openDialog(mode: 'attach' | 'new', initialBranch = ''): void {
    const session = host.session(); if (!session) { host.notify(tr('modules.common.start_a_task_before_creating_a_worktree')); return; }
    const project = host.project(), git = host.git();
    const suggested = initialBranch || suggestBranch(session, host.draft());
    const description = mode === 'attach'
      ? escape(tr('finish.worktree.attachDescription', { project: project?.name ?? '' }))
      : escape(tr('finish.worktree.newDescription', { project: project?.name ?? '' }));
    const dialog = host.modal(mode === 'attach' ? tr('finish.worktree.attachTitle') : tr('finish.worktree.newTitle'), `<form id="worktree-form" data-mode="${mode}" data-session-id="${escape(session.id)}"><p class="dialog-description">${description}</p><label class="field-label" for="branch-name">${escapeI18n(tr('modules.common.branch_name'))}</label><input id="branch-name" name="branch" value="${escape(suggested)}" placeholder="my-feature" required pattern="[A-Za-z0-9_\\/\\-]+" maxlength="120" autocomplete="off" spellcheck="false"><p class="field-help worktree-preview" id="branch-preview" data-live></p><label class="field-label" for="branch-base">${escapeI18n(tr('modules.common.start_from'))}</label><select id="branch-base" name="base" aria-describedby="branch-base-help"><option value="">${escape(git?.branch ? tr('finish.worktree.currentBranch', { branch: git.branch }) : tr('finish.worktree.currentHead'))}</option></select><p class="field-help" id="branch-base-help">${escape(tr(session.worktreePath ? 'finish.worktree.baseWorktree' : 'finish.worktree.baseProject'))}</p><label class="worktree-existing" hidden><input type="checkbox" name="existing"><span>${escapeI18n(tr('modules.common.use_the_existing_branch_instead_of_creating_one'))}</span></label><p class="worktree-error field-help" role="alert" hidden></p><div class="dialog-footer"><button type="button" class="secondary-button" data-action="close-dialog">${escapeI18n(tr('modules.common.cancel'))}</button><button class="primary-button">${mode === 'attach' ? tr('finish.worktree.use') : tr('finish.worktree.create')}</button></div></form>`, 'compact-dialog worktree-dialog');
    const input = dialog.querySelector<HTMLInputElement>('#branch-name')!, preview = dialog.querySelector<HTMLElement>('#branch-preview')!;
    const update = () => {
      const final = finalBranchName(input.value);
      preview.innerHTML = final ? codeMessage('finish.worktree.preview', { branch: final, path: `${(project?.path ?? '').replace(/\/[^/]*$/, '')}/${project?.name ?? ''}-worktrees/${final.replaceAll('/', '-')}` }) : escape(tr('finish.worktree.names'));
      preview.classList.toggle('worktree-preview-invalid', Boolean(input.value) && !BRANCH_PATTERN.test(input.value.trim()));
    };
    input.addEventListener('input', update); update();
    input.focus(); input.select();
    const select = dialog.querySelector<HTMLSelectElement>('#branch-base')!;
    void host.call<BranchList>('git_branches', { projectId: session.projectId, sessionId: session.id }).then(list => {
      if (!select.isConnected) return;
      for (const name of list.branches) if (name !== list.current) { const option = document.createElement('option'); option.value = name; option.textContent = name; select.append(option); }
    }).catch(() => { /* The current branch remains the start point. */ });
  }

  async function submit(form: HTMLFormElement, data: FormData): Promise<boolean> {
    if (form.id === 'worktree-cleanup-form') {
      const pending = cleanup; cleanup = undefined;
      if (pending) { pending.resolve({ proceed: true, remove: data.get('remove') === 'on' }); host.closeModal(); }
      return true;
    }
    if (form.id !== 'worktree-form') return false;
    const session = host.session();
    const mode = form.dataset.mode as 'attach' | 'new';
    if (!session || session.id !== form.dataset.sessionId) { host.closeModal(); return true; }
    const branch = String(data.get('branch') ?? '').trim(), base = String(data.get('base') ?? '').trim(), existing = data.get('existing') === 'on';
    const error = form.querySelector<HTMLElement>('.worktree-error')!, existingRow = form.querySelector<HTMLElement>('.worktree-existing')!;
    if (!BRANCH_PATTERN.test(branch)) { error.textContent = tr('modules.common.use_letters_numbers_hyphens_underscores_and_slashes'); error.hidden = false; return true; }
    try {
      const saved = await host.call<Session>(mode === 'attach' ? 'attach_worktree' : 'create_worktree', { sessionId: session.id, branch, ...(base ? { base } : {}), existing });
      // A dialog dismissed meanwhile must not steal navigation or close whatever replaced it.
      const live = form.isConnected && Boolean(form.closest('dialog[open]'));
      if (mode === 'attach') await host.afterAttach(saved, live); else await host.afterCreate(saved, live, host.session()?.id === session.id);
      host.notify(mode === 'attach' ? tr('finish.worktree.working', { branch: saved.worktreeBranch ?? finalBranchName(branch) }) : tr('modules.common.worktree_task_created'));
    } catch (cause) {
      if (!form.isConnected) return true;
      const message = cause instanceof Error ? cause.message : String(cause);
      error.textContent = message; error.hidden = false;
      if (/already exists/.test(message) && !existing) { existingRow.hidden = false; existingRow.querySelector('input')!.focus(); }
    }
    return true;
  }

  /** Ask before settling a worktree task or removing its checkout; nothing is removed here. */
  function cleanupOffer(session: Session, intent: CleanupIntent): Promise<CleanupDecision> {
    if (!session.worktreePath) return Promise.resolve({ proceed: true, remove: false });
    return host.call<WorktreeStatus>('worktree_status', { sessionId: session.id }).catch(() => undefined).then(status => new Promise<CleanupDecision>(resolve => {
      if (!status) { resolve({ proceed: true, remove: false }); return; }
      if (!status.exists && intent !== 'remove') { resolve({ proceed: true, remove: false }); return; }
      const verb = tr(intent === 'complete' ? 'finish.worktree.settle' : 'finish.worktree.remove');
      const branch = status.branch || session.worktreeBranch || tr('finish.worktree.itsBranch');
      const unpublished = !status.merged && (!status.hasUpstream || status.ahead > 0);
      let summary: string, control = '';
      if (!status.exists) summary = escape(tr('finish.worktree.gone', { note: intent === 'remove' ? tr('finish.worktree.prunedNote') : '' }));
      else if (!status.clean) summary = codeMessage(status.changes === 1 ? 'finish.worktree.dirtyOne' : 'finish.worktree.dirtyMany', { path: session.worktreePath ?? '' }, { count: status.changes, action: intent === 'remove' ? tr('finish.worktree.commitFirst') : '' });
      else {
        summary = status.merged ? escape(tr('finish.worktree.cleanMerged')) : unpublished ? codeMessage('finish.worktree.cleanUnpublished', { branch }, undefined, 'strong') : escape(tr('finish.worktree.clean'));
        control = `<label class="worktree-cleanup-option"><input type="checkbox" name="remove" ${intent === 'remove' || !unpublished ? 'checked' : ''}><span>${codeMessage(status.merged ? 'finish.worktree.removeMerged' : 'finish.worktree.removeKeep', { branch })}</span></label>`;
      }
      const canProceed = intent !== 'remove' || (status.exists ? status.clean : true);
      const dialog = host.modal(verb, `<form id="worktree-cleanup-form" data-session-id="${escape(session.id)}"><p class="dialog-description">${summary}</p>${control}<div class="dialog-footer"><button type="button" class="secondary-button" data-action="close-dialog">${escapeI18n(tr('modules.common.cancel'))}</button><button class="primary-button" ${canProceed ? '' : 'disabled'}>${intent === 'remove' ? tr('finish.worktree.removeSettle') : verb}</button></div></form>`, 'compact-dialog worktree-dialog');
      cleanup?.resolve({ proceed: false, remove: false });
      cleanup = { resolve, dialog };
      dialog.addEventListener('close', () => { if (cleanup?.dialog === dialog) { cleanup = undefined; resolve({ proceed: false, remove: false }); } }, { once: true });
    }));
  }

  async function remove(session: Session): Promise<WorktreeRemoval> {
    const removal = await host.call<WorktreeRemoval>('remove_worktree', { sessionId: session.id, deleteBranch: true });
    host.notify(removal.note || (removal.branchDeleted ? tr('finish.worktree.removedDeleted', { branch: removal.branch }) : removal.removed ? tr('finish.worktree.removedKept', { branch: removal.branch }) : tr('modules.common.worktree_registration_pruned')));
    return removal;
  }

  async function removeInteractive(session: Session): Promise<void> {
    const decision = await cleanupOffer(session, 'remove');
    if (!decision.proceed) return;
    if (decision.remove || !(await host.call<WorktreeStatus>('worktree_status', { sessionId: session.id })).exists) await remove(session);
    await host.settle(session);
  }

  /** Merge the worktree's committed branch into main locally, then offer to clean it up. */
  async function merge(session: Session): Promise<void> {
    let merged: WorktreeMerge;
    try {
      merged = await host.call<WorktreeMerge>('merge_worktree', { sessionId: session.id });
    } catch (cause) {
      host.notify(tr('modules.dynamic.mergeFailed', { error: String(cause instanceof Error ? cause.message : String(cause)) }));
      return;
    }
    const moved = merged.switchedFrom ? tr('finish.worktree.moved', { branch: merged.switchedFrom }) : '';
    host.notify(merged.commits ? tr(merged.commits === 1 ? 'finish.worktree.mergedOne' : 'finish.worktree.mergedMany', { count: merged.commits, branch: merged.branch, target: merged.target, moved }) : tr('finish.worktree.upToDate', { target: merged.target, branch: merged.branch }));
    window.setTimeout(() => void host.branchChanged(), 0);
    // The merged branch can go now; the offer explains and asks first.
    await removeInteractive(session);
  }

  async function recreate(session: Session): Promise<void> {
    const restored = await host.call<Session>('recreate_worktree', { sessionId: session.id });
    await host.afterAttach(restored, false);
    host.notify(tr('modules.dynamic.worktreeRestored', { branch: String(restored.worktreeBranch ?? tr('finish.worktree.itsBranch')) }));
  }

  return { contextBar, showMenu, openDialog, submit, cleanupOffer, remove, removeInteractive, recreate };
}

/** A linked issue or pull request. With a task, a pull request opens in the inspector; otherwise on GitHub. Hidden while the integration is off. */
export function linkChip(link: NonNullable<Session['issue']>, sessionId?: string): string {
  if (!githubEnabled()) return '';
  const label = link.kind === 'pull' ? `PR #${link.number}` : `#${link.number}`;
  const action = link.kind === 'pull' && sessionId ? `data-action="open-pull" data-session-id="${escape(sessionId)}"` : `data-action="open-url" data-url="${escape(link.url)}"`;
  return `<button type="button" class="link-chip link-chip-${escape(link.state || 'open')}" ${action} title="${escape(link.title)}" aria-label="${escape(tr('finish.worktree.link', { kind: tr(link.kind === 'pull' ? 'finish.worktree.pull' : 'finish.worktree.issue'), number: link.number, title: link.title, state: linkState(link.state) }))}">${icon(link.kind === 'pull' ? 'pull' : 'issue')}<span>${label}</span><span class="link-chip-state">${escape(linkState(link.state))}</span></button>`;
}
