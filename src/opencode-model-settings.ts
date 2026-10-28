import { escape as escapeI18n } from './dom.ts';
import { t as tr, onLocaleChange } from './i18n.ts';
import './opencode-model-settings.css';
import { call } from './bridge';
import { icon } from './dom';
import { tokenCount } from './model-catalog';
import type { ProviderModel } from './types';

interface Catalog {
  models: ProviderModel[];
  selectedModelIds: string[];
  error: string | null;
}

/** Keep the search field and selected rows stable while editing or saving. */
export function mountOpenCodeModels(host: HTMLElement, saved: () => void): () => void {
  let disposed = false, loading = false, saving = false, initialized = false;
  let models: ProviderModel[] = [], selected = new Set<string>(), persisted = new Set<string>();
  let visibleLimit = 80;
  const rows = new Map<string, HTMLLabelElement>();
  let rowId = 0;
  host.classList.add('opencode-model-settings');
  host.innerHTML = `<p class="dialog-description">${escapeI18n(tr('modules.common.choose_the_opencode_models_you_want_in_your_model_selectors'))}</p>
    <div class="opencode-model-toolbar"><label class="opencode-model-search">${icon('search')}<input type="search" aria-label="${escapeI18n(tr('modules.common.search_opencode_models'))}" placeholder="${escapeI18n(tr('modules.common.search_models_or_providers'))}" autocomplete="off" spellcheck="false"></label><button type="button" class="secondary-button" data-refresh aria-label="${escapeI18n(tr('modules.common.refresh_models'))}" title="${escapeI18n(tr('modules.common.refresh_from_opencode'))}">${icon('refresh')}</button></div>
    <p class="opencode-model-status" role="status" hidden></p>
    <div class="opencode-model-list" role="group" aria-label="${escapeI18n(tr('modules.common.available_opencode_models'))}"></div>
    <button type="button" class="secondary-button opencode-model-more" hidden>${escapeI18n(tr('modules.common.show_more_models'))}</button>
    <p class="opencode-model-empty" hidden></p>
    <div class="opencode-model-footer"><span class="opencode-model-count"></span><button type="button" class="primary-button" data-save>${escapeI18n(tr('modules.common.save_models'))}</button></div>
    <small class="opencode-model-note">${escapeI18n(tr('modules.common.default_always_uses_opencode_s_own_selection_models_and_connected_providers_come'))}</small>`;
  const search = host.querySelector<HTMLInputElement>('input')!;
  const list = host.querySelector<HTMLElement>('.opencode-model-list')!;
  const empty = host.querySelector<HTMLElement>('.opencode-model-empty')!;
  const status = host.querySelector<HTMLElement>('.opencode-model-status')!;
  const count = host.querySelector<HTMLElement>('.opencode-model-count')!;
  const refreshButton = host.querySelector<HTMLButtonElement>('[data-refresh]')!;
  const saveButton = host.querySelector<HTMLButtonElement>('[data-save]')!;
  const moreButton = host.querySelector<HTMLButtonElement>('.opencode-model-more')!;
  const dirty = () => selected.size !== persisted.size || [...selected].some(id => !persisted.has(id));
  function message(text: string, error = false): void {
    status.textContent = text; status.hidden = !text; status.classList.toggle('error', error);
  }
  function controls(): void {
    refreshButton.disabled = loading || saving;
    saveButton.disabled = !initialized || saving || !dirty();
    saveButton.textContent = saving ? tr('modules.common.saving') : tr('modules.common.save_models');
    count.textContent = selected.size === 100 ? tr('modules.common.100_selected_limit_reached') : tr('modules.models.selectedCount', { count: selected.size });
    for (const input of list.querySelectorAll<HTMLInputElement>('input')) input.disabled = saving || (selected.size >= 100 && !input.checked);
  }
  function render(): void {
    const query = search.value.trim().toLocaleLowerCase();
    const available = new Map(models.filter(model => model.id !== 'default').map(model => [model.id, model]));
    const items = [...available.values()];
    for (const id of selected) if (!available.has(id)) items.push({id, name: id, description: ''});
    items.sort((a, b) => a.id.split('/')[0].localeCompare(b.id.split('/')[0]) || a.name.localeCompare(b.name));
    const keep = new Set<string>();
    const matching = items.filter(model => `${model.name} ${model.id}`.toLocaleLowerCase().includes(query));
    const shown = Math.min(visibleLimit, matching.length);
    moreButton.hidden = shown === matching.length;
    moreButton.textContent = tr('modules.dynamic.moreModels', { count: String(matching.length - shown) });
    for (const [index, model] of matching.slice(0, visibleLimit).entries()) {
      keep.add(model.id);
      let row = rows.get(model.id);
      if (!row) {
        row = document.createElement('label'); row.className = 'opencode-model-row';
        row.innerHTML = `<input type="checkbox"><span class="opencode-model-copy"><strong></strong><small></small></span><span class="opencode-model-context"></span>`;
        const checkbox = row.querySelector('input')!;
        checkbox.dataset.modelId = model.id;
        const description = row.querySelector('small')!;
        description.id = `opencode-model-description-${++rowId}`;
        checkbox.setAttribute('aria-describedby', description.id);
        rows.set(model.id, row);
      }
      const checkbox = row.querySelector('input')!;
      checkbox.checked = selected.has(model.id); checkbox.disabled = saving;
      checkbox.setAttribute('aria-label', model.name);
      row.querySelector('strong')!.textContent = model.name;
      row.querySelector('small')!.textContent = available.has(model.id) ? model.id : tr('modules.models.currentlyUnavailable', { model: model.id });
      row.querySelector('.opencode-model-context')!.textContent = model.contextWindow ? tr('modules.model.contextCapacity', { capacity: tokenCount(model.contextWindow) }) : '';
      row.classList.toggle('selected', checkbox.checked);
      if (list.children[index] !== row) list.insertBefore(row, list.children[index] ?? null);
    }
    for (const [id, row] of rows) if (!keep.has(id)) { row.remove(); rows.delete(id); }
    list.hidden = shown === 0;
    empty.hidden = shown > 0;
    empty.textContent = loading ? tr('modules.common.loading_models_from_opencode') : query ? tr('modules.common.no_matching_models_try_another_name_or_provider') : tr('modules.common.no_models_found_connect_a_provider_in_opencode_then_refresh');
    controls();
  }
  async function refresh(): Promise<void> {
    if (disposed || loading || saving) return;
    loading = true; controls();
    message('Loading models from OpenCode…');
    if (!models.length) render();
    try {
      const result = await call<Catalog>('list_opencode_models');
      if (disposed) return;
      if (!initialized) { selected = new Set(result.selectedModelIds); persisted = new Set(result.selectedModelIds); initialized = true; }
      if (!result.error || result.models.length) models = result.models;
      message(result.error || '');
      status.classList.toggle('error', Boolean(result.error));
    } catch (error) { if (!disposed) message(String(error), true); }
    finally { loading = false; if (!disposed) render(); }
  }
  async function save(): Promise<void> {
    if (disposed || saving || !initialized || !dirty()) return;
    saving = true; render();
    try {
      const ids = await call<string[]>('save_opencode_models', {modelIds: [...selected]});
      if (disposed) return;
      persisted = new Set(ids); selected = new Set(ids);
      saved(); message('Models saved. Available in every model selector.');
    } catch (error) { if (!disposed) message(String(error), true); }
    finally { saving = false; if (!disposed) render(); }
  }
  function change(event: Event): void {
    const checkbox = event.target;
    if (!(checkbox instanceof HTMLInputElement) || !checkbox.dataset.modelId || saving) return;
    if (checkbox.checked) selected.add(checkbox.dataset.modelId); else selected.delete(checkbox.dataset.modelId);
    checkbox.closest('label')!.classList.toggle('selected', checkbox.checked);
    message(''); controls();
  }
  function filter(): void { visibleLimit = 80; list.scrollTop = 0; render(); }
  function more(): void { visibleLimit += 80; render(); }
  search.addEventListener('input', filter); list.addEventListener('change', change);
  moreButton.addEventListener('click', more);
  refreshButton.addEventListener('click', refresh); saveButton.addEventListener('click', save);
  // Its own dialog starts in the search; embedded in the Settings page, focus stays on the group list.
  void refresh(); if (host.closest('dialog')) search.focus({preventScroll: true});
  const disposeLocale = onLocaleChange(() => {
    host.querySelector('.dialog-description')!.textContent = tr('modules.common.choose_the_opencode_models_you_want_in_your_model_selectors');
    search.setAttribute('aria-label', tr('modules.common.search_opencode_models')); search.placeholder = tr('modules.common.search_models_or_providers');
    refreshButton.setAttribute('aria-label', tr('modules.common.refresh_models')); refreshButton.title = tr('modules.common.refresh_from_opencode');
    list.setAttribute('aria-label', tr('modules.common.available_opencode_models'));
    host.querySelector('.opencode-model-note')!.textContent = tr('modules.common.default_always_uses_opencode_s_own_selection_models_and_connected_providers_come');
    render();
  });
  return () => {
    disposed = true; disposeLocale(); rows.clear(); search.removeEventListener('input', filter); moreButton.removeEventListener('click', more);
    list.removeEventListener('change', change); refreshButton.removeEventListener('click', refresh); saveButton.removeEventListener('click', save);
  };
}
