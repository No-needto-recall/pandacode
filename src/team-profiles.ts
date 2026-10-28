import { escape as escapeI18n } from './dom.ts';
import { t as tr } from './i18n.ts';
import { call } from './bridge';
import { icon } from './dom';
import { openChoiceMenu } from './choice-menu';
import type { TeamLibrary, TeamProfile, TeamSetup } from './architect-types';
import { sameTeamSetup } from './team-mode';

/** Reusable templates stay local until the setup form applies the draft. */
export function mountTeamProfiles(host: HTMLElement, options: {
  library: TeamLibrary;
  pendingSetup?: TeamSetup | null;
  read: () => TeamSetup;
  apply: (setup: TeamSetup) => void;
  busy: (value: boolean) => void;
}): { selectedId: () => string | null; changed: () => void; dispose: () => void; hasMenu: () => boolean } {
  let library = structuredClone(options.library), disposed = false, pending = false;
  let menu: (() => void) | undefined, edit: 'create' | 'rename' | undefined;
  let selected = library.profiles.find(profile => profile.id === library.activeProfileId && sameTeamSetup(profile.setup, options.read()))?.id
    ?? library.profiles.find(profile => sameTeamSetup(profile.setup, options.read()))?.id ?? null;
  host.className = 'team-library';
  host.innerHTML = `<div class="team-library-heading"><span>${escapeI18n(tr('modules.common.team_profile'))}</span><span class="team-library-state" role="status"></span></div><div class="team-library-row"><button type="button" class="team-library-picker" aria-label="${escapeI18n(tr('modules.common.choose_team_profile'))}" aria-haspopup="dialog" aria-expanded="false"><span></span>${icon('down')}</button><button type="button" class="icon-button team-library-manage" aria-label="${escapeI18n(tr('modules.common.manage_team_profile'))}" aria-haspopup="dialog">${icon('more')}</button></div><div class="team-library-actions"><button type="button" class="team-library-create">${icon('plus')} Save as…</button><button type="button" class="team-library-update" hidden>${escapeI18n(tr('modules.common.update_profile'))}</button></div><div class="team-library-editor" hidden><label>${escapeI18n(tr('modules.common.profile_name'))}<input type="text" maxlength="80" autocomplete="off" aria-label="${escapeI18n(tr('modules.common.profile_name'))}"></label><div><button type="button" class="secondary-button team-library-cancel">${escapeI18n(tr('modules.common.cancel'))}</button><button type="button" class="primary-button team-library-confirm">${escapeI18n(tr('modules.common.save_profile'))}</button></div></div><p class="team-library-error" role="alert" hidden></p>`;
  const picker = host.querySelector<HTMLButtonElement>('.team-library-picker')!;
  const manage = host.querySelector<HTMLButtonElement>('.team-library-manage')!;
  const create = host.querySelector<HTMLButtonElement>('.team-library-create')!;
  const update = host.querySelector<HTMLButtonElement>('.team-library-update')!;
  const status = host.querySelector<HTMLElement>('.team-library-state')!;
  const editor = host.querySelector<HTMLElement>('.team-library-editor')!;
  const name = editor.querySelector<HTMLInputElement>('input')!;
  const confirm = editor.querySelector<HTMLButtonElement>('.team-library-confirm')!;
  const error = host.querySelector<HTMLElement>('.team-library-error')!;
  const current = (): TeamProfile | undefined => library.profiles.find(profile => profile.id === selected);
  const showError = (cause: unknown) => { error.textContent = cause instanceof Error ? cause.message : String(cause); error.hidden = false; };
  function refresh(): void {
    if (disposed) return;
    const profile = current(), setup = options.read();
    const modified = !!profile && !sameTeamSetup(profile.setup, setup);
    picker.querySelector('span')!.textContent = profile?.name ?? (library.lastSetup && sameTeamSetup(library.lastSetup, setup) ? tr('modules.common.last_saved_setup') : tr('modules.common.custom_setup'));
    picker.disabled = pending || (!library.profiles.length && !library.lastSetup);
    picker.title = tr('modules.common.choose_a_saved_team');
    manage.disabled = pending || !profile;
    create.disabled = pending || library.profiles.length >= 20;
    update.hidden = !modified;
    update.disabled = pending;
    status.textContent = modified ? tr('modules.common.modified') : options.pendingSetup && sameTeamSetup(options.pendingSetup, setup) ? tr('modules.common.pending') : profile ? tr('modules.common.saved') : '';
  }
  function closeEditor(): void { edit = undefined; editor.hidden = true; error.hidden = true; }
  function editName(mode: 'create' | 'rename'): void {
    edit = mode; editor.hidden = false; error.hidden = true;
    name.value = mode === 'rename' ? current()?.name ?? '' : '';
    confirm.textContent = mode === 'rename' ? tr('modules.common.rename_profile') : tr('modules.common.save_profile');
    name.focus(); name.select();
  }
  async function mutate(action: () => Promise<TeamLibrary>, after?: () => void): Promise<void> {
    if (pending || disposed) return;
    pending = true; error.hidden = true; menu?.(); options.busy(true);
    try {
      library = await action();
      if (!disposed) { after?.(); closeEditor(); }
    } catch (cause) { if (!disposed) showError(cause); }
    finally { pending = false; if (!disposed) { options.busy(false); refresh(); } }
  }
  picker.addEventListener('click', () => {
    if (menu) { menu(); return; }
    // Named agent teams live in Settings and the model picker, not among classic profiles.
    const profiles = library.profiles.filter(profile => !profile.setup.config.rosterOnly);
    const items = profiles.map(profile => ({ id: profile.id, label: profile.name, provider: profile.setup.architect.provider,
      description: tr((profile.setup.config.workers.length === 1 ? '' : 's') === '' ? 'modules.dynamic.workerModels.one' : 'modules.dynamic.workerModels.many', { count: String(profile.setup.config.workers.length), details: String(profile.setup.config.maxParallel === 0 ? 'Unlimited at once' : `${profile.setup.config.maxParallel} at once`) }), selected: selected === profile.id }));
    if (library.lastSetup) items.unshift({ id: 'last-saved', label: tr('modules.common.last_saved_setup'), provider: library.lastSetup.architect.provider,
      description: library.enabled ? tr('modules.common.default_for_new_tasks') : tr('modules.common.remembered_single_agent_default'), selected: !selected && sameTeamSetup(library.lastSetup, options.read()) });
    menu = openChoiceMenu({ anchor: picker, title: tr('modules.common.team_profiles'), items, width: 310,
      searchPlaceholder: profiles.length > 5 ? 'Search profiles…' : undefined,
      onSelect: id => {
        const setup = id === 'last-saved' ? library.lastSetup : profiles.find(profile => profile.id === id)?.setup;
        if (!setup) throw new Error('This profile is no longer available.');
        options.apply(structuredClone(setup)); selected = id === 'last-saved' ? library.activeProfileId : id;
        closeEditor(); refresh();
      }, onClose: () => { menu = undefined; },
    });
  });
  create.addEventListener('click', () => editName('create'));
  editor.querySelector('.team-library-cancel')!.addEventListener('click', () => { closeEditor(); create.focus(); });
  function saveNamed(): void {
    const trimmed = name.value.trim();
    if (!trimmed) { showError(new Error('Give this team profile a name.')); name.focus(); return; }
    const id = edit === 'rename' ? current()?.id : undefined;
    const setup = edit === 'rename' ? current()?.setup : options.read();
    if (!setup) return;
    void mutate(() => call<TeamLibrary>('architect_save_profile', { id, name: trimmed, setup }), () => {
      selected = id ?? library.profiles.find(profile => profile.name === trimmed)?.id ?? null;
    });
  }
  confirm.addEventListener('click', saveNamed);
  name.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.isComposing) { event.preventDefault(); event.stopPropagation(); saveNamed(); }
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeEditor(); create.focus(); }
  });
  update.addEventListener('click', () => {
    const profile = current(); if (!profile) return;
    void mutate(() => call<TeamLibrary>('architect_save_profile', { id: profile.id, name: profile.name, setup: options.read() }));
  });
  manage.addEventListener('click', () => {
    if (menu) { menu(); return; }
    const profile = current(); if (!profile) return;
    menu = openChoiceMenu({ anchor: manage, title: tr('modules.common.profile_actions'), actions: true, items: [
      { id: 'rename', label: tr('modules.common.rename_profile'), icon: 'edit' }, { id: 'delete', label: tr('modules.common.delete_profile'), icon: 'close' },
    ], onSelect: id => {
      if (id === 'rename') { menu?.(); editName('rename'); }
      else void mutate(() => call<TeamLibrary>('architect_delete_profile', { id: profile.id }), () => { selected = null; });
    }, onClose: () => { menu = undefined; } });
  });
  refresh();
  return {
    selectedId: () => { const profile = current(); return profile && sameTeamSetup(profile.setup, options.read()) ? profile.id : null; },
    changed: refresh,
    hasMenu: () => Boolean(menu),
    dispose: () => { disposed = true; menu?.(); },
  };
}
