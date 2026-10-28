import { escape as escapeI18n } from './dom.ts';
import { t as tr, onLocaleChange } from './i18n.ts';
/* Settings → Skills & rules (issues #15 and #45): the library, imports, where each item is
 * active per harness and scope, the drift matrix and safety findings. Everything is native
 * (`skills_*` commands in src-tauri/src/skills.rs); this view only draws and asks. Catalogs
 * (#114, #115) index GitHub repositories of skills; importing from one never activates. */
import './skills-library.css';
import { escape } from './dom';

export type SkillKind = 'skill' | 'rule';
export type SkillScope = 'user' | 'project';
export type SkillFinding = { rule: 'secret' | 'approvals' | 'pipe-to-shell'; file: string; line: number; excerpt: string };
export type SkillActivation = { harness: string; scope: SkillScope; project: string | null; surface: 'folder' | 'block' | 'prompt'; sha256: string; files: { path: string; sha256: string }[] };
export type SkillItem = {
  id: string; name: string; kind: SkillKind; description: string; sha256: string; importedAt: number;
  source: { kind: 'folder' | 'github'; location: string; gitRef: string | null; commit: string | null };
  acknowledged: string | null; activations: SkillActivation[]; files: string[]; findings: SkillFinding[];
};
export type SkillCell = { id: string; scope: SkillScope; status: 'active' | 'outdated' | 'drifted' | 'missing' | 'prompt' | 'off'; surface: string };
export type SkillMatrix = {
  project: string | null;
  harnesses: { harness: string; installed: boolean; prompt: boolean; cells: SkillCell[]; unmanaged: { scope: SkillScope; kind: SkillKind; path: string; detail: string }[] }[];
};
export type CatalogSkill = { path: string; id: string; name: string; description: string; files: number; bytes: number; imported: string | null; conflicts: string[] };
export type CatalogSource = {
  repo: string; gitRef: string | null; commit: string | null; origin: 'manual' | 'discovered'; state: 'enabled' | 'disabled' | 'ignored';
  private: boolean; pushedAt: string | null; scannedAt: number; skills: CatalogSkill[];
};
export type SkillCatalogs = { sources: CatalogSource[]; discovery: { at: number; checked: number; registered: string[]; failures: string[]; note: string | null } | null };
export type CatalogImport = { items: SkillItem[]; imported: string[]; skipped: { path: string; name: string; reason: string }[] };
export type SkillsLibraryHost = {
  call<T>(command: string, args?: Record<string, unknown>): Promise<T>;
  /** Projects offered for project scope. */
  projects?(): { id: string; name: string }[];
};

const HARNESS_NAMES: Record<string, string> = { claude: 'Claude Code', codex: 'Codex', opencode: 'OpenCode', glm: 'GLM', mimo: 'MiMo', deepseek: 'DeepSeek', commandcode: 'Command Code', cline: 'Cline', kilo: 'Kilo', omp: 'OMP', pi: 'Pi', muse: 'Muse Code', zcode: 'ZCode' };
const harnessName = (id: string) => HARNESS_NAMES[id] ?? id.charAt(0).toUpperCase() + id.slice(1);
const FINDING_LABELS: Record<SkillFinding['rule'], string> = {
  get secret() { return tr('finish.skills.secret'); },
  get approvals() { return tr('finish.skills.approvals'); },
  get 'pipe-to-shell'() { return tr('finish.skills.pipeToShell'); },
};
const STATUS_LABELS: Record<SkillCell['status'], string> = {
  get active() { return tr('finish.skills.active'); },
  get outdated() { return tr('finish.skills.outdated'); },
  get drifted() { return tr('finish.skills.drifted'); },
  get missing() { return tr('finish.skills.missing'); },
  get prompt() { return tr('finish.skills.prompt'); },
  off: '—',
};
const fileCount = (count: number) => tr(count === 1 ? 'finish.skills.file.one' : 'finish.skills.file.many', { count });
const skillCount = (count: number) => tr(count === 1 ? 'finish.skills.skill.one' : 'finish.skills.skill.many', { count });
const scopeLabel = (scope: SkillScope) => tr(scope === 'user' ? 'finish.skills.user' : 'finish.skills.project');
const message = (error: unknown) => error instanceof Error ? error.message : String(error);

export function mountSkillsLibrary(host: HTMLElement, options: SkillsLibraryHost): () => void {
  let items: SkillItem[] = [];
  let matrix: SkillMatrix = { project: null, harnesses: [] };
  let catalogs: SkillCatalogs = { sources: [], discovery: null };
  /** Catalog skills chosen for import, as `repo\npath`. */
  let selected = new Set<string>();
  let projectId = '';
  let source: 'folder' | 'github' = 'folder';
  let pending: { id: string; harness: string; scope: SkillScope } | null = null;
  let note: (() => string) | undefined;
  let error: string | (() => string) = '';
  let busy = false, disposed = false, clearFields = false;
  const projects = () => options.projects?.() ?? [];
  const scopeArgs = (scope: SkillScope) => scope === 'project' ? { projectId } : {};

  async function refresh(): Promise<void> {
    try {
      [items, matrix, catalogs] = await Promise.all([
        options.call<SkillItem[]>('skills_list'),
        options.call<SkillMatrix>('skills_matrix', projectId ? { projectId } : {}),
        options.call<SkillCatalogs>('skills_catalogs'),
      ]);
    } catch (failure) { error = message(failure); }
    if (!disposed) draw();
  }
  async function run(work: () => Promise<(() => string) | void>): Promise<void> {
    busy = true; error = ''; note = undefined; draw();
    try { note = (await work()) || undefined; } catch (failure) { error = message(failure); }
    busy = false;
    if (!disposed) await refresh();
  }

  /** Harnesses with toggles: the file-based ones, plus any already used through the prompt. */
  const harnesses = () => {
    const ids = new Set(['claude', 'codex', ...matrix.harnesses.map(row => row.harness)]);
    return [...ids].map(id => matrix.harnesses.find(row => row.harness === id) ?? { harness: id, installed: false, prompt: false, cells: [], unmanaged: [] });
  };
  const scopes = (): SkillScope[] => projectId ? ['user', 'project'] : ['user'];
  const active = (item: SkillItem, harness: string, scope: SkillScope) =>
    item.activations.some(a => a.harness === harness && a.scope === scope && (scope === 'user' || a.project === matrix.project));

  function itemHtml(item: SkillItem): string {
    const from = item.source.kind === 'github' ? `GitHub · ${item.source.location}${item.source.commit ? ` @ ${item.source.commit.slice(0, 7)}` : ''}` : item.source.location;
    const toggles = harnesses().flatMap(row => scopes().map(scope => {
      const label = `${harnessName(row.harness)} · ${scopeLabel(scope)}`;
      return `<label class="skills-toggle"><input type="checkbox" data-harness="${escape(row.harness)}" data-scope="${scope}" ${active(item, row.harness, scope) ? 'checked' : ''} ${busy ? 'disabled' : ''} aria-label="${escape(`${item.name}: ${label}`)}"><span>${escape(label)}</span></label>`;
    })).join('');
    const findings = item.findings.length ? `<ul class="skills-findings" aria-label="${escape(tr('modules.dynamic.safetyFindings', { name: String(item.name) }))}">${item.findings.map(f =>
      `<li><strong>${escape(FINDING_LABELS[f.rule])}</strong> <span>${escape(f.file)}:${f.line}</span><code>${escape(f.excerpt)}</code></li>`).join('')}</ul>` : '';
    const confirm = pending?.id === item.id ? `<div class="skills-confirm" role="alert"><span>${escape(tr(item.findings.length === 1 ? 'modules.dynamic.activateUnsafe.one' : 'modules.dynamic.activateUnsafe.many', { name: String(item.name), count: String(item.findings.length), harness: String(harnessName(pending.harness)) }))}</span><button type="button" class="secondary-button" data-action="acknowledge">${escapeI18n(tr('modules.common.activate_anyway'))}</button><button type="button" class="secondary-button" data-action="cancel">${escapeI18n(tr('modules.common.cancel'))}</button></div>` : '';
    return `<li class="skills-item" data-id="${escape(item.id)}">
      <div class="skills-item-head"><div><strong>${escape(item.name)}</strong><span class="skills-kind">${escape(tr(item.kind === 'rule' ? 'modules.common.rule' : 'modules.common.skill'))}</span><small>${escape(item.description)}</small><small class="skills-source">${escape(from)}</small></div>
        <button type="button" class="secondary-button" data-action="remove" aria-label="${escape(tr('modules.dynamic.removeSkill', { name: String(item.name) }))}" ${busy ? 'disabled' : ''}>${escapeI18n(tr('modules.common.remove'))}</button></div>
      ${findings}${confirm}<div class="skills-toggles">${toggles}</div></li>`;
  }

  function matrixHtml(): string {
    const rows = matrix.harnesses;
    if (!rows.length || !items.length) return `<p class="skills-empty">${escapeI18n(tr('modules.common.no_installed_harness_found_yet_or_nothing_in_the_library'))}</p>`;
    const columns = rows.flatMap(row => scopes().map(scope => ({ row, scope })));
    const head = columns.map(({ row, scope }) => `<th scope="col">${escape(harnessName(row.harness))}<small>${escape(scopeLabel(scope))}${row.prompt ? ` · ${escape(tr('finish.skills.promptMarker'))}` : ''}</small></th>`).join('');
    const body = items.map(item => `<tr><th scope="row">${escape(item.name)}</th>${columns.map(({ row, scope }) => {
      const cell = row.cells.find(c => c.id === item.id && c.scope === scope);
      const status = cell?.status ?? 'off';
      return `<td class="skills-status" data-status="${status}" title="${escape(cell?.surface ?? '')}">${escape(STATUS_LABELS[status])}</td>`;
    }).join('')}</tr>`).join('');
    const unmanaged = rows.flatMap(row => row.unmanaged.map(u => `<li><strong>${escape(harnessName(row.harness))}</strong> <code>${escape(u.path)}</code> <span>${escape(u.detail)}</span></li>`)).join('');
    const prompt = rows.some(row => row.prompt) ? `<p class="skills-note">${escapeI18n(tr('modules.common.harnesses_marked_prompt_have_no_skill_files_pandacode_adds_these_items_to'))}</p>` : '';
    return `<div class="skills-matrix-wrap"><table class="skills-matrix" aria-label="${escapeI18n(tr('modules.common.skills_by_harness'))}"><thead><tr><th scope="col">${escapeI18n(tr('modules.common.item'))}</th>${head}</tr></thead><tbody>${body}</tbody></table></div>${prompt}
      ${unmanaged ? `<h4 class="skills-subheading">${escapeI18n(tr('modules.common.found_on_disk_not_managed_by_pandacode'))}</h4><ul class="skills-unmanaged">${unmanaged}</ul>` : ''}`;
  }

  function catalogSkillHtml(source: CatalogSource, skill: CatalogSkill): string {
    const key = `${source.repo}\n${skill.path}`;
    const library = skill.imported ? `<small>${escape(skill.imported === source.commit ? tr('finish.skills.inLibrary') : tr('finish.skills.newUpstream', { commit: skill.imported.slice(0, 7) }))}</small>` : '';
    const conflict = skill.conflicts.length ? `<small class="skills-conflict">${escape(tr('finish.skills.conflict', { names: skill.conflicts.join(', ') }))}</small>` : '';
    return `<li class="skills-catalog-skill"><label class="skills-toggle"><input type="checkbox" data-select="${escape(key)}" ${selected.has(key) ? 'checked' : ''} ${busy ? 'disabled' : ''} aria-label="${escape(tr('modules.dynamic.selectSkill', { name: String(skill.name), repo: String(source.repo) }))}"><span><strong>${escape(skill.name)}</strong> <code>${escape(skill.path || tr('finish.skills.root'))}</code> · ${escape(fileCount(skill.files))}</span></label>
      <small>${escape(skill.description)}</small>${library}${conflict}</li>`;
  }
  function sourceHtml(source: CatalogSource): string {
    const enabled = source.state === 'enabled';
    const repo = escape(source.repo);
    const tags = [tr(source.origin === 'discovered' ? 'finish.skills.discovered' : 'finish.skills.added'), source.private ? tr('finish.skills.private') : '', enabled ? '' : tr('finish.skills.disabled')].filter(Boolean).map(tag => `<span class="skills-kind">${escape(tag)}</span>`).join('');
    const at = source.commit ? ` @ ${escape(source.commit.slice(0, 7))}${source.gitRef ? ` (${escape(source.gitRef)})` : ''}` : '';
    const button = (action: string, label: string, extra = '', name = tr('finish.skills.sourceAction', { action: label, repo: source.repo })) =>
      `<button type="button" class="secondary-button" data-action="${action}" data-repo="${repo}" ${extra} aria-label="${escape(name)}" ${busy ? 'disabled' : ''}>${escape(label)}</button>`;
    const body = enabled ? `<ul class="skills-catalog-skills" aria-label="${escape(tr('modules.dynamic.skillsIn', { repo: String(source.repo) }))}">${source.skills.map(skill => catalogSkillHtml(source, skill)).join('')}</ul>
      <div class="skills-confirm">${button('catalog-import', tr('finish.skills.importSelected'), '', tr('finish.skills.importSelectedFrom', { repo: source.repo }))}${button('catalog-import-all', tr('finish.skills.importAll'), '', tr('finish.skills.importAllFrom', { repo: source.repo }))}</div>` : '';
    return `<li class="skills-item skills-catalog" data-repo="${repo}">
      <div class="skills-item-head"><div><strong>${repo}</strong>${tags}<small>${escape(skillCount(source.skills.length))}${at}</small></div>
        <div class="skills-confirm">${button('catalog-refresh', tr('finish.skills.refresh'))}${enabled ? button('catalog-state', tr('finish.skills.disable'), 'data-state="disabled"') : button('catalog-state', tr('finish.skills.enable'), 'data-state="enabled"')}${button('catalog-state', tr('finish.skills.ignore'), 'data-state="ignored"')}</div></div>
      ${body}</li>`;
  }
  function catalogsHtml(): string {
    const shown = catalogs.sources.filter(s => s.state !== 'ignored');
    const ignored = catalogs.sources.filter(s => s.state === 'ignored');
    const found = catalogs.discovery;
    const summary = found ? `<p class="skills-note">${escape(tr(found.checked === 1 ? 'finish.skills.checked.one' : 'finish.skills.checked.many', { count: found.checked }))}${found.failures.length ? ` ${escape(tr('finish.skills.cannotRead', { repositories: found.failures.join('; ') }))}` : ''}${found.note ? ` ${escape(found.note)}` : ''}</p>` : '';
    return `<div class="settings-group">
      <form class="skills-import skills-catalog-add" aria-label="${escapeI18n(tr('modules.common.add_a_skill_catalog'))}" novalidate>
        <div class="skills-import-row"><input name="catalogRepo" aria-label="${escapeI18n(tr('modules.common.catalog_repository'))}" placeholder="owner/name" spellcheck="false" autocomplete="off"><input name="catalogRef" aria-label="${escapeI18n(tr('modules.common.catalog_branch_tag_or_commit'))}" placeholder="${escapeI18n(tr('modules.common.default_branch'))}" spellcheck="false" autocomplete="off"><button type="submit" class="secondary-button" ${busy ? 'disabled' : ''}>${escapeI18n(tr('modules.common.scan'))}</button></div>
        <div class="skills-import-row skills-import-actions"><p class="skills-message">${escapeI18n(tr('modules.common.catalogs_list_skills_nothing_is_turned_on_until_you_choose_a_harness'))}</p><button type="button" class="secondary-button" data-action="discover" ${busy ? 'disabled' : ''}>${escapeI18n(tr('modules.common.find_my_skill_repositories'))}</button></div>
      </form>
    </div>${summary}
    ${shown.length ? `<ul class="settings-group skills-list" aria-label="${escapeI18n(tr('modules.common.catalog_sources'))}">${shown.map(sourceHtml).join('')}</ul>` : `<p class="skills-empty">${escapeI18n(tr('modules.common.no_catalogs_yet_scan_a_repository_or_find_the_skill_repositories_in'))}</p>`}
    ${ignored.length ? `<ul class="skills-unmanaged" aria-label="${escapeI18n(tr('modules.common.ignored_sources'))}">${ignored.map(s => `<li><code>${escape(s.repo)}</code> <button type="button" class="secondary-button" data-action="catalog-state" data-state="enabled" data-repo="${escape(s.repo)}" aria-label="${escape(tr('modules.dynamic.unignore', { repo: String(s.repo) }))}" ${busy ? 'disabled' : ''}>${escapeI18n(tr('modules.common.stop_ignoring'))}</button></li>`).join('')}</ul>` : ''}`;
  }

  function draw(): void {
    const list = projects();
    const values = clearFields ? {} : Object.fromEntries([...host.querySelectorAll<HTMLInputElement | HTMLSelectElement>('form [name]')].map(field => [field.name, field.value]));
    host.innerHTML = `<div class="settings-group skills-library" aria-label="${escapeI18n(tr('modules.common.skills_and_rules'))}">
      <form class="skills-import" aria-label="${escapeI18n(tr('modules.common.import_a_skill_or_rule'))}" novalidate>
        <div class="skills-import-row">
          <select name="kind" aria-label="${escapeI18n(tr('modules.common.kind'))}"><option value="skill">${escapeI18n(tr('modules.common.skill'))}</option><option value="rule">${escapeI18n(tr('modules.common.rule'))}</option></select>
          <select name="source" aria-label="${escapeI18n(tr('modules.skills.source'))}"><option value="folder" ${source === 'folder' ? 'selected' : ''}>${escapeI18n(tr('modules.common.local_folder_or_file'))}</option><option value="github" ${source === 'github' ? 'selected' : ''}>${escape(tr('modules.about.repository'))}</option></select>
          ${list.length ? `<select name="project" aria-label="${escapeI18n(tr('modules.common.project_for_project_scope'))}"><option value="">${escapeI18n(tr('modules.common.user_scope_only'))}</option>${list.map(p => `<option value="${escape(p.id)}" ${p.id === projectId ? 'selected' : ''}>${escape(p.name)}</option>`).join('')}</select>` : ''}
        </div>
        ${source === 'folder'
          ? `<input name="path" aria-label="${escapeI18n(tr('modules.common.folder_or_file_path'))}" placeholder="${escape(tr('finish.skills.pathPlaceholder'))}" spellcheck="false" autocomplete="off">`
          : `<div class="skills-import-row"><input name="repo" aria-label="${escapeI18n(tr('modules.common.repository'))}" placeholder="owner/name" spellcheck="false" autocomplete="off"><input name="repoPath" aria-label="${escapeI18n(tr('modules.common.path_in_repository'))}" placeholder="skills/pdf" spellcheck="false" autocomplete="off"><input name="ref" aria-label="${escapeI18n(tr('modules.common.branch_tag_or_commit'))}" placeholder="${escapeI18n(tr('modules.common.default_branch'))}" spellcheck="false" autocomplete="off"></div>`}
        <div class="skills-import-row skills-import-actions"><p class="skills-message" role="status">${escape(busy ? tr('finish.skills.working') : note?.() ?? '')}</p><button type="submit" class="secondary-button" ${busy ? 'disabled' : ''}>${escapeI18n(tr('modules.common.import'))}</button></div>
        <p class="skills-error" role="alert" ${error ? '' : 'hidden'}>${escape(typeof error === 'function' ? error() : error)}</p>
      </form>
    </div>
    <h3 class="settings-heading">${escapeI18n(tr('modules.common.catalogs'))}</h3>${catalogsHtml()}
    <h3 class="settings-heading">${escapeI18n(tr('modules.common.library'))}</h3>
    ${items.length ? `<ul class="settings-group skills-list" aria-label="${escapeI18n(tr('modules.common.library'))}">${items.map(itemHtml).join('')}</ul>` : `<p class="skills-empty">${escapeI18n(tr('modules.common.the_library_is_empty_import_a_skill_folder_with_a_skill_md'))}</p>`}
    <h3 class="settings-heading">${escapeI18n(tr('modules.common.by_harness'))}</h3>${matrixHtml()}`;
    for (const [name, value] of Object.entries(values)) {
      const field = host.querySelector<HTMLInputElement | HTMLSelectElement>(`form [name="${name}"]`);
      if (field && name !== 'source' && name !== 'project') field.value = value;
    }
    clearFields = false;
  }

  function toggle(input: HTMLInputElement): void {
    const id = input.closest<HTMLElement>('.skills-item')!.dataset.id!;
    const { harness, scope } = input.dataset as { harness: string; scope: SkillScope };
    const item = items.find(entry => entry.id === id)!;
    if (!input.checked) {
      void run(async () => {
        const change = await options.call<{ kept: string[] }>('skills_deactivate', { id, harness, scope, ...scopeArgs(scope) });
        return () => change.kept.length ? tr(change.kept.length === 1 ? 'finish.skills.kept.one' : 'finish.skills.kept.many', { count: change.kept.length, paths: change.kept.join(', ') }) : tr('finish.skills.turnedOff', { name: item.name, harness: harnessName(harness) });
      });
      return;
    }
    if (item.findings.length && item.acknowledged !== item.sha256) {
      input.checked = false; pending = { id, harness, scope }; draw(); return;
    }
    void activate(id, harness, scope, false);
  }
  function activate(id: string, harness: string, scope: SkillScope, acknowledge: boolean): Promise<void> {
    pending = null;
    return run(async () => {
      await options.call('skills_activate', { id, harness, scope, ...scopeArgs(scope), acknowledge });
      const row = matrix.harnesses.find(r => r.harness === harness);
      return () => tr(row?.prompt ? 'finish.skills.activePrompt' : 'finish.skills.activeFor', { harness: harnessName(harness) });
    });
  }
  function importItem(form: HTMLFormElement): void {
    const data = new FormData(form);
    const kind = String(data.get('kind') ?? 'skill') as SkillKind;
    const text = (name: string) => String(data.get(name) ?? '').trim();
    if (source === 'folder' && !text('path')) { error = () => tr('finish.skills.enterPath'); draw(); return; }
    if (source === 'github' && !text('repo')) { error = () => tr('finish.skills.enterRepo'); draw(); return; }
    void run(async () => {
      const item = source === 'folder'
        ? await options.call<SkillItem>('skills_import_folder', { path: text('path'), kind })
        : await options.call<SkillItem>('skills_import_github', { repo: text('repo'), path: text('repoPath'), gitRef: text('ref') || null, kind });
      clearFields = true;
      return () => item.findings.length ? tr(item.findings.length === 1 ? 'finish.skills.importFinding.one' : 'finish.skills.importFinding.many', { name: item.name, count: item.findings.length }) : tr('finish.skills.imported', { name: item.name });
    });
  }

  function addCatalog(form: HTMLFormElement): void {
    const data = new FormData(form);
    const repo = String(data.get('catalogRepo') ?? '').trim();
    if (!repo) { error = () => tr('finish.skills.enterRepo'); draw(); return; }
    void run(async () => {
      catalogs = await options.call<SkillCatalogs>('skills_catalog_add', { repo, gitRef: String(data.get('catalogRef') ?? '').trim() || null });
      clearFields = true;
      const source = catalogs.sources.find(s => s.repo.toLowerCase() === repo.replace(/^https:\/\/github\.com\//, '').replace(/\.git$/, '').toLowerCase());
      return () => tr((source?.skills.length ?? 0) === 1 ? 'finish.skills.found.one' : 'finish.skills.found.many', { count: source?.skills.length ?? 0, repo: source?.repo ?? repo });
    });
  }
  function catalogAction(action: string, repo: string, state?: string): void {
    if (action === 'catalog-refresh') void run(async () => { await options.call('skills_catalog_refresh', { repo }); return () => tr('finish.skills.refreshed', { repo }); });
    if (action === 'catalog-state' && state) void run(async () => {
      await options.call('skills_catalog_state', { repo, state });
      return () => tr(state === 'ignored' ? 'finish.skills.ignoring' : state === 'disabled' ? 'finish.skills.repoDisabled' : 'finish.skills.repoEnabled', { repo });
    });
    if (action === 'catalog-import' || action === 'catalog-import-all') {
      const prefix = `${repo}\n`;
      const paths = action === 'catalog-import' ? [...selected].filter(key => key.startsWith(prefix)).map(key => key.slice(prefix.length)) : null;
      if (paths && !paths.length) { error = () => tr('finish.skills.selectSkills'); draw(); return; }
      void run(async () => {
        const result = await options.call<CatalogImport>('skills_catalog_import', { repo, paths });
        selected = new Set([...selected].filter(key => !key.startsWith(prefix)));
        return () => {
          const imported = tr(result.imported.length === 1 ? 'finish.skills.catalogImported.one' : 'finish.skills.catalogImported.many', { count: result.imported.length });
          const skipped = result.skipped.length ? tr('finish.skills.skipped', { count: result.skipped.length, reasons: result.skipped.map(s => s.reason).join(' ') }) : '';
          return [imported, skipped, tr('finish.skills.activationNotice')].filter(Boolean).join(' ');
        };
      });
    }
  }

  const onClick = (event: Event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-action]');
    if (!button) return;
    if (button.dataset.action === 'discover') {
      void run(async () => {
        const found = (await options.call<SkillCatalogs>('skills_discover')).discovery;
        return () => found?.registered.length ? tr('finish.skills.addedRepos', { repositories: found.registered.join(', ') }) : tr('finish.skills.noNewRepos');
      });
      return;
    }
    if (button.dataset.repo) { catalogAction(button.dataset.action!, button.dataset.repo, button.dataset.state); return; }
    const id = button.closest<HTMLElement>('.skills-item')?.dataset.id;
    if (button.dataset.action === 'remove' && id) void run(async () => { await options.call('skills_remove', { id }); return () => tr('finish.skills.removed'); });
    if (button.dataset.action === 'acknowledge' && pending) void activate(pending.id, pending.harness, pending.scope, true);
    if (button.dataset.action === 'cancel') { pending = null; draw(); }
  };
  const onChange = (event: Event) => {
    const target = event.target as HTMLElement;
    if (target instanceof HTMLInputElement && target.dataset.harness) toggle(target);
    if (target instanceof HTMLInputElement && target.dataset.select) {
      const key = target.dataset.select;
      selected = target.checked ? new Set([...selected, key]) : new Set([...selected].filter(k => k !== key));
    }
    if (target instanceof HTMLSelectElement && target.name === 'source') { source = target.value as typeof source; draw(); }
    if (target instanceof HTMLSelectElement && target.name === 'project') { projectId = target.value; pending = null; void refresh(); }
  };
  const onSubmit = (event: Event) => {
    event.preventDefault();
    const form = event.target as HTMLFormElement;
    if (form.classList.contains('skills-catalog-add')) addCatalog(form); else importItem(form);
  };
  host.addEventListener('click', onClick);
  host.addEventListener('change', onChange);
  host.addEventListener('submit', onSubmit);
  draw();
  void refresh();
  const disposeLocale = onLocaleChange(() => {
    const forms = [...host.querySelectorAll('form')];
    const saved = forms.map(form => [...form.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input[name], select[name]')].map(field => ({ name: field.name, value: field.value })));
    const active = document.activeElement instanceof HTMLInputElement && host.contains(document.activeElement) ? document.activeElement : null;
    const formIndex = active ? forms.indexOf(active.form!) : -1, name = active?.name, caret = active?.selectionStart ?? null;
    draw();
    const nextForms = [...host.querySelectorAll('form')];
    saved.forEach((fields, index) => fields.forEach(field => { const input = nextForms[index]?.querySelector<HTMLInputElement | HTMLSelectElement>('[name="' + CSS.escape(field.name) + '"]'); if (input) input.value = field.value; }));
    if (name && formIndex >= 0) { const input = nextForms[formIndex]?.querySelector<HTMLInputElement>('[name="' + CSS.escape(name) + '"]'); input?.focus(); if (input && caret !== null && ['text', 'search'].includes(input.type)) input.setSelectionRange(caret, caret); }
  });
  return () => {
    disposed = true; disposeLocale();
    host.removeEventListener('click', onClick);
    host.removeEventListener('change', onChange);
    host.removeEventListener('submit', onSubmit);
  };
}
