import { getLocale, onLocaleChange } from './i18n.ts';
import { escape as escapeI18n } from './dom.ts';
import { t as tr } from './i18n.ts';
import './bots.css';
import './bots-settings.css';
import { escape, icon } from './dom';
import { providerLogo } from './provider-logos';
import { infoMark } from './tooltip';
import type { Provider, ProviderId, ProviderModel, ReasoningEffort } from './types';
import { advertisedModelsOnly, modelChoices } from './model-catalog';
import { connectInput, guideToggled } from './bots-connect';
import { avatarPicker, botAvatarHtml, colorPicker, handleAvatarPicker } from './bot-avatars';
import { age, renderPanel, panelClick, panelSubmit, panelChange, invalidateActivity, invalidateCapabilities, type PanelContext, type Tab } from './bots-panels';

export { age };

export interface Bot {
  id: string; name: string; role: string; instructions: string; goals: string; soul: string; avatar: string; projectId: string;
  provider: ProviderId; model: string; mode: string; heartbeatMinutes: number; nextHeartbeatAt: number | null;
  paused: boolean; memoryVersion: number; notifyChannelId: string | null; notifyThread: string | null; createdAt: number; updatedAt: number;
  /** Profile settings added later; older data (and preview mocks) may leave them out. */
  color?: string; reasoningEffort?: string; backupModels?: BackupModel[]; fallbackMode?: 'ask' | 'auto'; notify?: boolean; whileWorking?: 'queue' | 'steer'; showPlan?: boolean;
  /** Library skill ids and configured MCP server names, by reference. */
  skills: string[]; mcp: string[];
  /** The bot's conversation in this app, once it exists. */
  desktopSession?: string | null;
  /** The latest thing said in that conversation, flattened to one line. */
  lastMessage?: { role: 'user' | 'assistant'; text: string; at: number } | null;
}
export interface BackupModel { provider: ProviderId; model: string; }
export interface BotInput {
  name: string; role: string; instructions: string; goals: string; soul?: string; avatar: string; provider: ProviderId; model: string; mode: string; heartbeatMinutes: number;
  /** Optional for older callers; native code fills the defaults. */
  color?: string; reasoningEffort?: string; backupModels?: BackupModel[]; fallbackMode?: 'ask' | 'auto'; notify?: boolean; whileWorking?: 'queue' | 'steer'; showPlan?: boolean;
}
export interface Memory { id: string; content: string; source: 'user' | 'bot'; createdAt: number; }
export interface Schedule { id: string; botId: string; title: string; prompt: string; kind: 'once' | 'interval' | 'daily' | 'weekdays'; intervalMinutes: number | null; timeOfDay: string | null; nextRunAt: number | null; lastRunAt: number | null; enabled: boolean; createdBy: 'user' | 'bot'; createdAt: number; }
export type ChannelKind = 'web' | 'telegram' | 'slack' | 'discord' | 'whatsapp';
export interface Channel { id: string; botId: string; kind: ChannelKind; label: string; config: Record<string, unknown>; enabled: boolean; status: string; secrets: string[]; }
export interface Pairing { channelId: string; senderId: string; senderName: string; status: 'pending' | 'approved' | 'blocked'; code: string; createdAt: number; }
export interface Thread { channelId: string; externalId: string; sessionId: string; updatedAt: number; }
export interface Rule { id: string; pattern: string; decision: 'allow' | 'ask' | 'deny'; createdAt: number; }
export interface Activity { id: number; kind: string; summary: string; detail: Record<string, unknown>; at: number; }
export interface BotDetail { bot: Bot; memories: Memory[]; schedules: Schedule[]; channels: Channel[]; pairings: Pairing[]; threads: Thread[]; rules: Rule[]; serverPort: number; }

/** A message held by `ask` failover (`bot-failover` event, `bot_failover_pending`); answer with `bot_failover_decide`. */
export interface FailoverAsk { botId: string; sessionId: string; cause: 'limit' | 'provider-error'; provider: ProviderId; model: string; target: BackupModel; resetsAt: number | null; }
/** Display names for harnesses and models; ids show when left out. */
export interface ModelNames { harness?(provider: ProviderId): string; model?(provider: ProviderId, model: string): string; }

/** The hold card: Send to {model} / Wait for the reset (Dismiss when no reset time is known), with "Next time, switch without asking" (`data-failover-always`). */
export function failoverCardHtml(ask: FailoverAsk, names: ModelNames = {}): string {
  const harness = names.harness?.(ask.provider) ?? ask.provider;
  const target = names.model?.(ask.target.provider, ask.target.model) ?? ask.target.model;
  const limit = ask.cause === 'limit';
  // Only a known reset time resumes the message; otherwise waiting would never end.
  const waits = limit && Boolean(ask.resetsAt);
  const reset = ask.resetsAt ? new Date(ask.resetsAt).toLocaleString(getLocale(), { weekday: 'short', hour: 'numeric', minute: '2-digit' }) : '';
  const title = limit ? tr('bots.settings.limit', { harness }) : tr('bots.settings.provider_error', { harness });
  const body = waits ? tr('bots.settings.hold_until', { time: reset }) : tr('bots.settings.hold_manual');
  return `<section class="bot-failover" role="group" aria-label="${escape(title)}" data-failover-session="${escape(ask.sessionId)}">
    <header><span class="bot-failover-icon">${icon('alert')}</span><strong>${escape(title)}</strong><small>${escapeI18n(tr('modules.common.message_on_hold'))}</small></header>
    <p>${escape(body)}</p>
    <div class="bot-failover-actions"><button type="button" class="primary-button" data-failover="send">${escape(tr('bots.settings.send_to', { model: target }))}</button>
      <button type="button" class="secondary-button" data-failover="wait">${escape(waits ? tr('bots.settings.wait_reset') : tr('bots.settings.dismiss'))}</button></div>
    <label class="bot-failover-always"><input type="checkbox" data-failover-always> ${escapeI18n(tr('modules.common.next_time_switch_without_asking'))}</label></section>`;
}

/** A `model-switch` activity (`bot_model_switches`, `bot-model-switch` event) as a centered compact system row. */
export function modelSwitchMarkerHtml(activity: Pick<Activity, 'summary' | 'detail' | 'at'>, names: ModelNames = {}): string {
  const detail = activity.detail as { cause?: string; back?: boolean; provider?: ProviderId; model?: string };
  const model = detail.provider && detail.model ? names.model?.(detail.provider, detail.model) ?? detail.model : '';
  const text = !model ? activity.summary
    : detail.cause === 'limit' ? (detail.back ? tr('bots.settings.limit_back', { model }) : tr('bots.settings.limit_switch', { model }))
    : detail.back ? tr('bots.settings.error_back', { model }) : tr('bots.settings.error_switch', { model });
  return `<div class="model-switch-marker" role="note"><span>${escape(text)}</span><time>${new Date(activity.at).toLocaleTimeString(getLocale(), { hour: 'numeric', minute: '2-digit' })}</time></div>`;
}

export interface BotsOptions {
  call<T>(command: string, args?: Record<string, unknown>): Promise<T>;
  providers: Provider[];
  defaultModel(provider: ProviderId): string;
  loadModels(provider: ProviderId): Promise<ProviderModel[]>;
  /** True while a task's agent is working. */
  running(sessionId: string): boolean;
  openTask(sessionId: string): void;
  /** Opens the bot's own conversation in the workspace, like any task. */
  openChat(botId: string): void;
  notify(text: string): void;
  /** Open on this bot, or on the New bot form. */
  initialBot?: string;
  startNew?: boolean;
  /** `settings`: one bot's settings, as a modal; `window`: every bot, with a list. */
  layout?: 'window' | 'settings';
  /** The settings section to open on. */
  initialTab?: Section;
  /** Settings layout: the bot was deleted, so the modal should close. */
  onDeleted?(): void;
}
export interface BotsView { dispose(): void; refresh(): void; agent(sessionId: string, kind: string): void; }
export type Section = Tab | 'profile';

/** The settings nav, like the app's own Settings. Activity also holds conversations and rules. */
type Nav = 'profile' | 'skills' | 'channels' | 'schedules' | 'memory' | 'activity';
const SECTIONS: { id: Nav; label: string; icon: string; text: string }[] = [
  { id: 'profile', get label() { return tr('modules.common.profile'); }, icon: 'bot', get text() { return tr('bots.settings.section_profile'); } },
  { id: 'channels', get label() { return tr('modules.common.connections'); }, icon: 'globe', get text() { return tr('bots.settings.section_channels'); } },
  { id: 'schedules', get label() { return tr('modules.common.schedules'); }, icon: 'refresh', get text() { return tr('bots.settings.section_schedules'); } },
  { id: 'memory', get label() { return tr('modules.common.memory'); }, icon: 'leaf', get text() { return tr('bots.settings.section_memory'); } },
  { id: 'skills', get label() { return tr('modules.common.skills'); }, icon: 'widget', get text() { return tr('bots.settings.section_skills'); } },
  { id: 'activity', get label() { return tr('modules.common.activity'); }, icon: 'activity', get text() { return tr('bots.settings.section_activity'); } },
];
const navFor = (section: Section): Nav => section === 'conversations' || section === 'rules' ? 'activity' : section;
/** One labelled row, like a Settings row: title and hint on the left, the control on the right. */
const row = (title: string, hint: string, control: string, stacked = false) => `<label class="bs-row ${stacked ? 'stacked' : ''}"><span class="bs-row-text"><strong>${escape(title)}</strong>${hint ? `<small>${escape(hint)}</small>` : ''}</span>${control}</label>`;
const heading = (title: string, more = '') => `<h3 class="bs-heading">${escape(title)}${more}</h3>`;
/** OpenBot-style permission levels over the harness modes; Plan only stays for bots that already use it. */
const PERMISSIONS = [{ id: 'auto', get label() { return tr('modules.common.workspace_only'); }, get hint() { return tr('bots.settings.permission_auto'); } }, { id: 'ask', get label() { return tr('modules.common.ask_first'); }, get hint() { return tr('bots.settings.permission_ask'); } }, { id: 'review', get label() { return tr('modules.common.approve_for_me'); }, get hint() { return tr('bots.settings.permission_review'); } }, { id: 'full', get label() { return tr('modules.common.full_access'); }, get hint() { return tr('bots.settings.permission_full'); } }, { id: 'plan', get label() { return tr('modules.common.plan_only'); }, get hint() { return tr('bots.settings.permission_plan'); } }];
const permissionChoices = (provider: ProviderId, current: string) => PERMISSIONS.filter(item => (item.id !== 'plan' || current === 'plan')
  && (item.id !== 'review' || ['claude', 'glm', 'mimo'].includes(provider))
  && (item.id !== 'auto' || !['github-copilot', 'devin'].includes(provider)));
const permissionOptions = (provider: ProviderId, current: string) => {
  const choices = permissionChoices(provider, current), chosen = choices.some(item => item.id === current) ? current : 'ask';
  return choices.map(item => `<button type="button" role="radio" data-permission="${item.id}" aria-label="${escape(item.label)}" aria-checked="${item.id === chosen}"><strong>${escape(item.label)}</strong><small>${escape(item.hint)}</small></button>`).join('');
};
const CHECK_INS = [{ minutes: 0, get label() { return tr('modules.common.off'); } }, { minutes: 30, get label() { return tr('modules.common.every_30_minutes'); } }, { minutes: 60, get label() { return tr('modules.common.every_hour'); } }, { minutes: 180, get label() { return tr('modules.common.every_3_hours'); } }, { minutes: 360, get label() { return tr('modules.common.every_6_hours'); } }, { minutes: 1440, get label() { return tr('modules.common.once_a_day'); } }];
const PURPOSE_MAX = 2000;
const SAVE_TEXT = { '': '', get saving() { return tr('bots.settings.saving'); }, get saved() { return tr('modules.common.saved'); }, get error() { return tr('bots.settings.not_saved'); } } as const;

/** Suggested bots: picking one fills the create form's name and purpose. */
export const SUGGESTIONS: { id: string; avatar: string; name: string; role: string; purpose: string; heartbeatMinutes: number }[] = [
  { id: 'research', avatar: 'panda:4', get name() { return tr('bots.settings.suggest_research_name'); }, get role() { return tr('bots.settings.suggest_research_role'); }, get purpose() { return tr('bots.settings.suggest_research_purpose'); }, heartbeatMinutes: 0 },
  { id: 'inbox', avatar: 'panda:2', get name() { return tr('bots.settings.suggest_inbox_name'); }, get role() { return tr('bots.settings.suggest_inbox_role'); }, get purpose() { return tr('bots.settings.suggest_inbox_purpose'); }, heartbeatMinutes: 0 },
  { id: 'chief', avatar: 'panda:1', get name() { return tr('bots.settings.suggest_chief_name'); }, get role() { return tr('bots.settings.suggest_chief_role'); }, get purpose() { return tr('bots.settings.suggest_chief_purpose'); }, heartbeatMinutes: 360 },
  { id: 'review', avatar: 'panda:6', get name() { return tr('bots.settings.suggest_review_name'); }, get role() { return tr('bots.settings.suggest_review_role'); }, get purpose() { return tr('bots.settings.suggest_review_purpose'); }, heartbeatMinutes: 0 },
  { id: 'release', avatar: 'panda:5', get name() { return tr('bots.settings.suggest_release_name'); }, get role() { return tr('bots.settings.suggest_release_role'); }, get purpose() { return tr('bots.settings.suggest_release_purpose'); }, heartbeatMinutes: 0 },
  { id: 'standup', avatar: 'panda:7', get name() { return tr('bots.settings.suggest_standup_name'); }, get role() { return tr('bots.settings.suggest_standup_role'); }, get purpose() { return tr('bots.settings.suggest_standup_purpose'); }, heartbeatMinutes: 1440 },
  { id: 'monitor', avatar: 'panda:8', get name() { return tr('bots.settings.suggest_monitor_name'); }, get role() { return tr('bots.settings.suggest_monitor_role'); }, get purpose() { return tr('bots.settings.suggest_monitor_purpose'); }, heartbeatMinutes: 60 },
  { id: 'writer', avatar: 'panda:3', get name() { return tr('bots.settings.suggest_writer_name'); }, get role() { return tr('bots.settings.suggest_writer_role'); }, get purpose() { return tr('bots.settings.suggest_writer_purpose'); }, heartbeatMinutes: 0 },
];
interface Draft { name: string; purpose: string; role: string; avatar: string; color: string; heartbeatMinutes: number; suggestion: string; suggestionName?: string; suggestionPurpose?: string; provider: ProviderId | ''; model: string; reasoningEffort: string; }
const newDraft = (): Draft => ({ name: '', purpose: '', role: '', avatar: 'panda:0', color: '', heartbeatMinutes: 0, suggestion: '', provider: '', model: '', reasoningEffort: '' });
/** A soul.md is copied into the bot once; the file is never read again. */
const MAX_SOUL = 64 * 1024;
/** Reads a soul.md as UTF-8 text, or explains why it cannot be used. */
export async function readSoulFile(file: File): Promise<string> {
  if (file.size > MAX_SOUL) throw new Error(tr('bots.settings.soul_size', { name: file.name }));
  try { return new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer()).replace(/^\uFEFF/, ''); }
  catch { throw new Error(tr('bots.settings.soul_encoding', { name: file.name })); }
}

export function avatar(bot: Pick<Bot, 'avatar' | 'name' | 'color'>, cls = ''): string { return botAvatarHtml(bot.avatar, bot.name, cls, bot.color ?? ''); }

export function mountBots(host: HTMLElement, options: BotsOptions): BotsView {
  let bots: Bot[] = [];
  let detail: BotDetail | null = null;
  let selected = options.initialBot ?? '';
  let section: Nav = navFor(options.initialTab ?? 'profile');
  let editing: 'new' | null = options.startNew ? 'new' : null;
  let draft = newDraft();
  let nameError = '', creating = false, avatarOpen = false, advancedOpen = false;
  let saveTimer = 0, saving = false;
  let pendingSave: { botId: string; input: BotInput } | null = null;
  let saveState: keyof typeof SAVE_TEXT = '';
  let confirming: { title: () => string; text: () => string; button: () => string; action: () => Promise<void> } | null = null;
  let loading = true, busy = false, disposed = false, request = 0, moreOpen = false;
  let formModelGeneration = 0;
  const modelCatalogs = new Map<ProviderId, ProviderModel[]>();
  const modelCatalogRequests = new Map<ProviderId, Promise<ProviderModel[]>>();
  for (const provider of options.providers) if (provider.models.length) modelCatalogs.set(provider.id, provider.models);
  let error = '';
  const single = options.layout === 'settings';
  const installed = () => options.providers.filter(provider => provider.installed);
  invalidateCapabilities();
  host.classList.add('bots');
  host.classList.toggle('bots-single', single);
  host.innerHTML = single
    ? '<section class="bots-detail" aria-live="polite"></section>'
    : `<aside class="bots-list" aria-label="${escapeI18n(tr('modules.common.bots'))}"></aside><section class="bots-detail" aria-live="polite"></section>`;
  const list = host.querySelector<HTMLElement>('.bots-list');
  const pane = host.querySelector<HTMLElement>('.bots-detail')!;

  const context: PanelContext = {
    call: options.call, notify: options.notify, openTask: id => options.openTask(id), running: options.running,
    detail: () => detail, reload: () => load(), rerender: () => render(),
    work: action => work(action),
    confirm: (title, text, button, action) => { confirming = { title: typeof title === 'function' ? title : () => title, text: typeof text === 'function' ? text : () => text, button: typeof button === 'function' ? button : () => button, action }; render(); pane.querySelector<HTMLButtonElement>('.bots-confirm .secondary-button')?.focus(); },
  };

  async function load(): Promise<void> {
    const id = ++request;
    invalidateActivity();
    try {
      const next = await options.call<Bot[]>('bots_list');
      if (disposed || id !== request) return;
      bots = next;
      if (!bots.some(bot => bot.id === selected)) selected = single ? '' : bots[0]?.id ?? '';
      detail = selected ? await options.call<BotDetail>('bot_detail', { botId: selected }) : null;
      if (disposed || id !== request) return;
      if (!bots.length && !single) editing ??= 'new';
      // A background refresh keeps a message the user has not acted on yet; the next action clears it.
    } catch (cause) {
      error = message(cause);
      // Never leave another bot's settings actionable under the newly selected row.
      if (detail && detail.bot.id !== selected) detail = null;
    }
    loading = false;
    render();
  }
  async function work(action: () => Promise<void>): Promise<void> {
    if (busy || disposed) return;
    busy = true; error = ''; host.setAttribute('aria-busy', 'true');
    try { await action(); } catch (cause) { error = message(cause); render(); } finally { busy = false; host.removeAttribute('aria-busy'); }
  }
  function message(cause: unknown): string { return cause instanceof Error ? cause.message : String(cause); }
  function working(bot: Bot): boolean { return bot.id === detail?.bot.id && detail.threads.some(thread => options.running(thread.sessionId)); }

  function botModelChoices(provider: ProviderId, catalog: ProviderModel[], selected: string): ProviderModel[] {
    const choices = modelChoices(provider, catalog, selected);
    return advertisedModelsOnly(provider)
      ? choices.filter(model => model.id === 'default' || catalog.some(advertised => advertised.id === model.id))
      : choices;
  }
  function modelOptions(provider: ProviderId, catalog: ProviderModel[], selected: string): string {
    const choices = botModelChoices(provider, catalog, selected);
    const chosen = choices.some(model => model.id === selected) ? selected : 'default';
    return choices.map(model => `<option value="${escape(model.id)}" ${model.id === chosen ? 'selected' : ''}>${escape(model.name)}</option>`).join('');
  }
  function loadFormModels(providerId: ProviderId, select: HTMLSelectElement, preferred: string): void {
    const generation = ++formModelGeneration;
    const provider = options.providers.find(item => item.id === providerId);
    if (!provider) return;
    const apply = (catalog: ProviderModel[]) => {
      if (disposed || generation !== formModelGeneration || !select.isConnected
        || pane.querySelector<HTMLSelectElement>('.bots-form select[name=provider]')?.value !== providerId) return;
      const desired = advertisedModelsOnly(providerId) && preferred !== 'default'
        && !catalog.some(model => model.id === preferred) ? 'default' : preferred;
      select.innerHTML = modelOptions(providerId, catalog, desired);
      select.value = botModelChoices(providerId, catalog, desired).some(model => model.id === desired) ? desired : 'default';
      const form = select.closest('form');
      if (form) syncEfforts(form);
    };
    apply(modelCatalogs.get(providerId) ?? provider.models);
    if (modelCatalogs.has(providerId)) return;
    let pending = modelCatalogRequests.get(providerId);
    if (!pending) {
      pending = options.loadModels(providerId).then(catalog => {
        const models = Array.isArray(catalog) ? catalog : [];
        provider.models = models;
        modelCatalogs.set(providerId, models);
        return models;
      }).finally(() => modelCatalogRequests.delete(providerId));
      modelCatalogRequests.set(providerId, pending);
    }
    void pending.then(apply).catch(() => undefined);
  }
  function hydrateFormModels(): void {
    const form = pane.querySelector<HTMLFormElement>('.bots-form');
    if (!form) return;
    const provider = form.querySelector<HTMLSelectElement>('select[name=provider]')!;
    const model = form.querySelector<HTMLSelectElement>('select[name=model]')!;
    void loadFormModels(provider.value as ProviderId, model, model.dataset.preferredModel || model.value);
  }

  function renderList(): void {
    if (!list) return;
    const rows = bots.map(bot => `<button type="button" class="bots-row" data-bot="${escape(bot.id)}" aria-current="${bot.id === selected && editing !== 'new'}">${avatar(bot)}<span class="bots-row-text"><b>${escape(bot.name)}</b><small>${escape(bot.paused ? tr('bots.settings.paused') : working(bot) ? tr('bots.settings.working') : bot.role || tr('bots.settings.ready'))}</small></span>${bot.paused ? `<span class="bots-dot paused" title="${escapeI18n(tr('modules.common.paused'))}"></span>` : working(bot) ? `<span class="bots-dot working" title="${escapeI18n(tr('modules.common.working'))}"></span>` : ''}</button>`).join('');
    list.innerHTML = `<div class="bots-list-head"><span>${escapeI18n(tr('modules.common.bots'))}</span><button type="button" class="icon-button" data-bots-action="new" aria-label="${escapeI18n(tr('modules.common.new_bot'))}" title="${escapeI18n(tr('modules.common.new_bot'))}">${icon('plus')}</button></div><div class="bots-rows">${rows || `<p class="bots-empty-note">${escapeI18n(tr('modules.common.no_bots_yet'))}</p>`}</div>`;
  }

  function catalogFor(provider: ProviderId): ProviderModel[] { return modelCatalogs.get(provider) ?? options.providers.find(item => item.id === provider)?.models ?? []; }
  function harnessName(provider: ProviderId): string { return options.providers.find(item => item.id === provider)?.name ?? provider; }
  function modelName(provider: ProviderId, model: string): string { return botModelChoices(provider, catalogFor(provider), model).find(item => item.id === model)?.name ?? model; }
  /** The chosen model's reasoning levels; disabled when it has none. Keeps a saved level the catalog does not list yet. */
  function effortSelect(provider: ProviderId, model: string, current: string): string {
    const levels: ReasoningEffort[] = catalogFor(provider).find(item => item.id === model)?.reasoningEfforts ?? [];
    const all = current && !levels.some(item => item.id === current) ? [...levels, { id: current, name: current, description: '' }] : levels;
    return `<select name="reasoningEffort" aria-label="${escapeI18n(tr('modules.common.reasoning'))}" ${all.length ? '' : 'disabled'}><option value="">${escapeI18n(tr('modules.common.default'))}</option>${all.map(item => `<option value="${escape(item.id)}" ${item.id === current ? 'selected' : ''}>${escape(item.name)}</option>`).join('')}</select>`;
  }
  function syncEfforts(form: HTMLFormElement): void {
    const select = form.querySelector<HTMLSelectElement>('select[name=reasoningEffort]');
    const provider = form.querySelector<HTMLSelectElement>('select[name=provider]')?.value as ProviderId;
    const model = form.querySelector<HTMLSelectElement>('select[name=model]')?.value ?? '';
    if (select && provider) select.outerHTML = effortSelect(provider, model, select.value);
  }
  /** Settings rows carry their own titles, so there the selects come bare. */
  function harnessControls(providerId: ProviderId | '', modelId: string, labelled = true): { provider: Provider | undefined; harness: string; model: string } {
    const providers = options.providers;
    const hasInstalledProvider = providers.some(item => item.installed);
    const provider = providers.find(item => item.id === providerId) ?? providers.find(item => item.installed) ?? providers[0];
    const preferred = modelId || (provider ? options.defaultModel(provider.id) : '');
    const models = provider ? catalogFor(provider.id) : [];
    const shown = provider && advertisedModelsOnly(provider.id) && preferred !== 'default' && !models.some(item => item.id === preferred) ? 'default' : preferred;
    const wrap = (title: string, control: string) => labelled ? `<label class="bc-control"><span>${escape(title)}</span>${control}</label>` : control;
    return {
      provider,
      harness: wrap(tr('bots.settings.harness'), `<select name="provider" aria-label="${escapeI18n(tr('modules.common.harness'))}">${providers.map(item => `<option value="${item.id}" ${item.id === provider?.id ? 'selected' : ''} ${!item.installed && hasInstalledProvider ? 'disabled' : ''}>${escape(item.name)}${!item.installed ? ` · ${escape(tr('bots.settings.not_installed'))}` : ''}</option>`).join('')}</select>`),
      model: wrap(tr('bots.settings.model'), `<select name="model" aria-label="${escapeI18n(tr('modules.common.model'))}" data-preferred-model="${escape(preferred)}">${provider ? modelOptions(provider.id, models, shown) : `<option value="default">${escapeI18n(tr('modules.common.default'))}</option>`}</select>`),
    };
  }

  /** A centered column: live avatar, color and face, name, purpose and brain, then suggestions to start from. */
  function renderCreate(): string {
    const { provider, harness, model } = harnessControls(draft.provider, draft.model);
    const efforts = provider ? effortSelect(provider.id, draft.model || options.defaultModel(provider.id), draft.reasoningEffort) : '';
    const cards = SUGGESTIONS.map(item => `<li><button type="button" class="bc-card" data-suggestion="${item.id}" aria-pressed="${item.id === draft.suggestion}">${botAvatarHtml(item.avatar, item.name, 'bc-card-avatar')}<b>${escape(item.name)}</b><small>${escape(item.role)}</small></button></li>`).join('');
    return `<div class="bots-create"><form class="bots-form bc-form" novalidate aria-label="${escapeI18n(tr('modules.common.new_bot'))}">
      <div class="bc-preview">${botAvatarHtml(draft.avatar, draft.name || tr('bots.settings.bot'), 'bc-avatar', draft.color)}</div>
      ${colorPicker(draft.color)}${avatarPicker(draft.avatar, draft.color)}
      <label class="bots-field"><span>${escapeI18n(tr('modules.common.name'))}<i class="bc-required" aria-hidden="true">*</i></span><input name="name" maxlength="60" required aria-required="true" value="${escape(draft.name)}" placeholder="${escape(tr('bots.settings.name_example'))}" autocomplete="off" ${nameError ? 'aria-invalid="true" aria-describedby="bc-name-error"' : ''}></label>
      ${nameError ? `<p class="bc-error" id="bc-name-error">${escape(nameError)}</p>` : ''}
      <label class="bots-field"><span>${escapeI18n(tr('modules.common.what_should_this_bot_help_with'))}</span><textarea name="purpose" rows="3" maxlength="${PURPOSE_MAX}" placeholder="${escape(tr('bots.settings.purpose_example'))}" aria-describedby="bc-count">${escape(draft.purpose)}</textarea></label>
      <span class="bc-count" id="bc-count">${draft.purpose.length} / ${PURPOSE_MAX}</span>
      <div class="bc-brain" role="group" aria-label="${escapeI18n(tr('modules.common.harness_and_model'))}">${harness}${model}<label class="bc-control"><span>${escapeI18n(tr('modules.common.reasoning'))}</span>${efforts}</label></div>
      <div class="bc-actions">${bots.length && !single ? `<button type="button" class="secondary-button" data-bots-action="cancel-edit">${escapeI18n(tr('modules.common.cancel'))}</button>` : ''}<button type="submit" class="primary-button bc-submit" ${creating ? 'disabled aria-busy="true"' : ''}>${creating ? `<span class="support-spinner" aria-hidden="true"></span>${escape(tr('bots.settings.creating'))}` : escape(tr('bots.settings.create'))}</button></div>
    </form>
    <section class="bc-suggestions" aria-labelledby="bc-suggestions-title"><h4 id="bc-suggestions-title">${escapeI18n(tr('modules.common.suggestions'))}</h4><div class="bc-rail"><ul>${cards}</ul></div></section></div>`;
  }

  function backupsRow(bot: Bot): string {
    const backups = bot.backupModels ?? [];
    const label = (item: BackupModel) => `${modelName(item.provider, item.model)} · ${harnessName(item.provider)}`;
    const items = backups.map((item, index) => `<li><span>${escape(label(item))}</span>
      <button type="button" class="icon-button" data-backup-move="${index}" data-step="-1" aria-label="${escape(tr('bots.settings.move_named_up', { name: label(item) }))}" title="${escape(tr('bots.settings.move_up'))}" ${index === 0 ? 'disabled' : ''}>${icon('down', 'flip')}</button>
      <button type="button" class="icon-button" data-backup-move="${index}" data-step="1" aria-label="${escape(tr('bots.settings.move_named_down', { name: label(item) }))}" title="${escape(tr('bots.settings.move_down'))}" ${index === backups.length - 1 ? 'disabled' : ''}>${icon('down')}</button>
      <button type="button" class="icon-button" data-backup-remove="${index}" aria-label="${escape(tr('bots.settings.remove_named', { name: label(item) }))}" title="${escape(tr('bots.settings.remove'))}">${icon('close')}</button></li>`).join('');
    const taken = (provider: ProviderId, model: string) => (provider === bot.provider && model === bot.model) || backups.some(item => item.provider === provider && item.model === model);
    const groups = installed().map(provider => {
      const models = botModelChoices(provider.id, catalogFor(provider.id), '').filter(model => model.id !== 'default' && !taken(provider.id, model.id));
      return models.length ? `<optgroup label="${escape(provider.name)}">${models.map(model => `<option value="${escape(JSON.stringify({ provider: provider.id, model: model.id }))}">${escape(model.name)}</option>`).join('')}</optgroup>` : '';
    }).join('');
    const full = backups.length >= 4;
    return `<div class="bs-row stacked"><span class="bs-row-text"><strong>${escapeI18n(tr('modules.common.backup_models'))}</strong><small>${escapeI18n(tr('modules.common.tried_in_order_when_the_main_model_is_unavailable'))}</small></span>
      <input type="hidden" name="backupModels" value="${escape(JSON.stringify(backups))}">
      ${items ? `<ol class="bp-backups">${items}</ol>` : ''}
      <small class="bp-backup-note">${escapeI18n(tr('modules.common.automatic_failover_only_retries_before_a_bot_writes_a_reply_usage_limits'))}</small>
      <div class="bp-backup-add"><select data-backup-add aria-label="${escapeI18n(tr('modules.common.add_a_backup_model'))}" ${full || !groups ? 'disabled' : ''}><option value="">${escape(full ? tr('bots.settings.backup_full') : tr('bots.settings.backup_add'))}</option>${groups}</select>
      <select name="fallbackMode" aria-label="${escapeI18n(tr('modules.common.switching_to_a_backup'))}"><option value="ask" ${bot.fallbackMode !== 'auto' ? 'selected' : ''}>${escapeI18n(tr('modules.common.ask_first'))}</option><option value="auto" ${bot.fallbackMode === 'auto' ? 'selected' : ''}>${escapeI18n(tr('modules.common.automatic'))}</option></select></div></div>`;
  }

  /** Settings → Profile, saved as you go: identity, the brain behind the bot, and its rules. */
  function renderProfile(bot: Bot): string {
    const { provider, harness, model } = harnessControls(bot.provider, bot.model, false);
    const mode = permissionChoices(bot.provider, bot.mode).some(item => item.id === bot.mode) ? bot.mode : 'ask';
    const checkIns = `<select name="heartbeatMinutes" aria-label="${escapeI18n(tr('modules.common.check_ins'))}">${CHECK_INS.map(item => `<option value="${item.minutes}" ${item.minutes === bot.heartbeatMinutes ? 'selected' : ''}>${escape(item.label)}</option>`).join('')}</select>`;
    const toggle = (name: string, on: boolean, label: string) => `<input type="checkbox" class="bots-switch" name="${name}" ${on ? 'checked' : ''} aria-label="${escape(label)}">`;
    const pop = avatarOpen ? `<div class="bp-avatar-pop" role="dialog" aria-label="${escapeI18n(tr('modules.common.icon'))}">
        <button type="button" class="secondary-button" data-bots-action="avatar-upload">${icon('upload')}${escape(tr('bots.settings.upload'))}</button>
        <h5>${escapeI18n(tr('modules.common.choose_panda'))}</h5>${avatarPicker(bot.avatar, bot.color ?? '')}<h5>${escapeI18n(tr('modules.common.color'))}</h5>${colorPicker(bot.color ?? '')}
        <button type="button" class="bp-avatar-reset" data-bots-action="avatar-reset">${icon('reset')}${escape(tr('bots.settings.reset'))}</button></div>`
      : `<input type="hidden" name="avatar" value="${escape(bot.avatar)}"><input type="hidden" name="color" value="${escape(bot.color ?? '')}">`;
    return `<form class="bots-form bots-profile" novalidate aria-label="${escapeI18n(tr('modules.common.profile'))}">
      <div class="bp-identity"><span class="bp-avatar-wrap"><button type="button" class="bp-avatar-button" data-bots-action="avatar" aria-haspopup="dialog" aria-expanded="${avatarOpen}" aria-label="${escape(tr('bots.settings.change_icon'))}">${avatar(bot, 'bp-avatar')}<span class="bp-avatar-badge">${icon('edit')}</span></button>${pop}</span>
        <div class="bp-identity-fields"><input name="name" maxlength="60" required value="${escape(bot.name)}" placeholder="${escapeI18n(tr('modules.common.name'))}" aria-label="${escapeI18n(tr('modules.common.name'))}" autocomplete="off"><input name="role" maxlength="200" value="${escape(bot.role)}" placeholder="${escapeI18n(tr('modules.common.title_like_research_assistant'))}" aria-label="${escapeI18n(tr('modules.common.title'))}" autocomplete="off"><p class="bc-error" id="bp-name-error" hidden></p></div></div>
      <div class="bs-group">${row(tr('bots.settings.instructions'), tr('bots.settings.instructions_hint'), `<textarea name="instructions" rows="4" maxlength="16000" aria-label="${escapeI18n(tr('modules.common.instructions'))}">${escape(bot.instructions)}</textarea>`, true)}</div>
      ${heading(tr('bots.settings.personality'), infoMark(tr('modules.common.optional_tone_values_and_conversational_style_kept_apart_from_the_instructions_importing'), tr('modules.common.about_personality')))}
      <div class="bs-group">
        <div class="bs-row stacked bots-soul"><span class="bs-row-text"><strong>${escapeI18n(tr('modules.common.soul'))}</strong><small>${escapeI18n(tr('modules.common.markdown_up_to_64_kb'))}</small></span>
          <textarea name="soul" rows="4" aria-label="${escapeI18n(tr('modules.common.soul'))}" placeholder="${escape(tr('bots.settings.soul_example'))}">${escape(bot.soul ?? '')}</textarea>
          <span class="bots-soul-actions"><button type="button" class="secondary-button" data-bots-action="soul-import">${escapeI18n(tr('modules.common.import_soul_md'))}</button><button type="button" class="secondary-button" data-bots-action="soul-remove" ${bot.soul ? '' : 'hidden'}>${escapeI18n(tr('modules.common.remove'))}</button><input type="file" data-soul-file accept=".md,.markdown,.txt,text/markdown,text/plain" hidden></span>
          <p class="bots-error bots-soul-error" role="alert" hidden></p>
        </div>
      </div>
      ${heading(tr('bots.settings.brain'))}
      <div class="bs-group">
        ${row(tr('bots.settings.harness'), '', harness)}${row(tr('bots.settings.model'), '', model)}${row(tr('bots.settings.reasoning'), '', provider ? effortSelect(provider.id, bot.model, bot.reasoningEffort ?? '') : '')}
        ${backupsRow(bot)}
      </div>
      ${heading(tr('bots.settings.rules'))}
      <div class="bs-group">
        <input type="hidden" name="mode" value="${escape(mode)}">
        <div class="bp-rules-row"><div class="bs-row-text"><strong>${escapeI18n(tr('modules.common.how_it_can_work'))}</strong><small>${escapeI18n(tr('modules.common.choose_when_pandacode_asks_before_a_change'))}</small></div><div class="bp-rule-options" role="radiogroup" aria-label="${escapeI18n(tr('modules.common.rules'))}">${permissionOptions(bot.provider, mode)}</div></div>
        ${row(tr('bots.settings.notifications'), tr('bots.settings.notifications_hint'), toggle('notify', bot.notify !== false, tr('bots.settings.notifications')))}
        <details class="bs-advanced" ${advancedOpen ? 'open' : ''}><summary>${escapeI18n(tr('modules.common.advanced'))}</summary>
          ${row(tr('bots.settings.while_working'), tr('bots.settings.while_working_hint'), `<select name="whileWorking" aria-label="${escapeI18n(tr('modules.common.while_working'))}"><option value="queue" ${bot.whileWorking !== 'steer' ? 'selected' : ''}>${escapeI18n(tr('modules.common.queue_it'))}</option><option value="steer" ${bot.whileWorking === 'steer' ? 'selected' : ''}>${escapeI18n(tr('modules.common.steer_the_current_work'))}</option></select>`)}
          ${row(tr('bots.settings.show_plan'), '', toggle('showPlan', bot.showPlan === true, tr('bots.settings.show_plan')))}
        </details>
      </div>
      ${heading(tr('bots.settings.check_ins'), infoMark(tr('modules.common.on_each_check_in_the_bot_reviews_its_goals_and_memory_using'), tr('modules.common.about_check_ins')))}
      <div class="bs-group">
        ${row(tr('bots.settings.check_in'), '', checkIns)}
        ${row(tr('bots.settings.goals'), tr('bots.settings.goals_hint'), `<textarea name="goals" rows="2" maxlength="16000" aria-label="${escapeI18n(tr('modules.common.standing_goals'))}">${escape(bot.goals)}</textarea>`, true)}
      </div>
    </form>`;
  }

  function readForm(form: HTMLFormElement): BotInput {
    const data = new FormData(form);
    const text = (name: string) => String(data.get(name) ?? '').trim();
    let backupModels: BackupModel[] = [];
    try { const parsed: unknown = JSON.parse(text('backupModels') || '[]'); if (Array.isArray(parsed)) backupModels = parsed; } catch { /* An unreadable list saves as none. */ }
    return {
      name: text('name'), role: text('role'), instructions: text('instructions'), goals: text('goals'), soul: text('soul'), avatar: text('avatar'), color: text('color'),
      provider: text('provider') as ProviderId, model: text('model'), mode: text('mode') || 'ask', heartbeatMinutes: Number(text('heartbeatMinutes')) || 0,
      reasoningEffort: text('reasoningEffort'), backupModels, fallbackMode: text('fallbackMode') === 'auto' ? 'auto' : 'ask',
      notify: data.has('notify'), whileWorking: text('whileWorking') === 'steer' ? 'steer' : 'queue', showPlan: data.has('showPlan'),
    };
  }

  function setSaved(state: keyof typeof SAVE_TEXT): void {
    saveState = state;
    const status = pane.querySelector<HTMLElement>('.bs-saved');
    if (status) { status.dataset.state = state; status.innerHTML = state === 'saved' ? `${icon('check')}${escape(SAVE_TEXT.saved)}` : escape(SAVE_TEXT[state]); }
  }
  /** Reads the profile form now, so a change made just before closing still saves; `delay` batches typing. */
  function queueSave(delay = 0): void {
    const form = pane.querySelector<HTMLFormElement>('.bots-profile');
    if (!form || !detail) return;
    const input = readForm(form);
    const nameField = form.querySelector<HTMLInputElement>('input[name=name]')!;
    const nameNote = form.querySelector<HTMLElement>('#bp-name-error')!;
    nameNote.hidden = Boolean(input.name);
    nameNote.textContent = input.name ? '' : tr('modules.common.give_the_bot_a_name');
    if (input.name) { nameField.removeAttribute('aria-invalid'); nameField.removeAttribute('aria-describedby'); }
    else { nameField.setAttribute('aria-invalid', 'true'); nameField.setAttribute('aria-describedby', 'bp-name-error'); return; }
    pendingSave = { botId: detail.bot.id, input };
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => void flushSave(), delay);
  }
  /** One save at a time; the latest queued state follows when it finishes, even after the view closes. */
  async function flushSave(): Promise<void> {
    window.clearTimeout(saveTimer);
    if (!pendingSave || saving) return;
    const { botId, input } = pendingSave;
    pendingSave = null;
    saving = true;
    if (!disposed) setSaved('saving');
    try {
      const saved = await options.call<Bot>('bot_update', { botId, input });
      if (disposed) return;
      if (detail?.bot.id === saved.id) detail = { ...detail, bot: { ...detail.bot, ...saved } };
      bots = bots.map(item => item.id === saved.id ? { ...item, ...saved } : item);
      setSaved('saved');
      refreshHeader();
    } catch (cause) {
      if (disposed) options.notify(message(cause)); else { setSaved('error'); error = message(cause); render(); }
    } finally {
      saving = false;
      if (pendingSave) void flushSave();
    }
  }
  /** The header follows the profile without redrawing the fields being typed in. */
  function refreshHeader(): void {
    const bar = pane.querySelector('.bp-bar');
    if (!bar || !detail) return;
    const fresh = document.createElement('div');
    fresh.innerHTML = renderHeader(detail.bot);
    bar.replaceWith(fresh.firstElementChild!);
    renderList();
  }
  /** Changes made outside a field (avatar, backups, a confirmed permission) show at once, then save. */
  function patchBot(patch: Partial<Bot>, redraw = true): void {
    if (!detail) return;
    // Keep edits made just before a click on a profile action. Redrawing from
    // `detail.bot` alone can discard a checkbox/select change whose save is in flight.
    const form = pane.querySelector<HTMLFormElement>('.bots-profile');
    const fields: Partial<BotInput> = form ? readForm(form) : {};
    // An invalid blank name is not a profile change; don't briefly erase the sidebar/header name.
    if (form && !fields.name?.trim()) fields.name = detail.bot.name;
    detail = { ...detail, bot: { ...detail.bot, ...fields, ...patch } };
    if (redraw) render();
    queueSave();
  }

  /** Identity and live state on the left; the conversation, pause, and the rare destructive actions on the right. */
  function renderHeader(bot: Bot): string {
    const harness = options.providers.find(item => item.id === bot.provider);
    const live = working(bot);
    const state = bot.paused ? 'paused' : live ? 'working' : 'ready';
    const stateLabel = bot.paused ? tr('bots.settings.paused') : live ? tr('modules.common.working') : tr('bots.settings.ready');
    const next = bot.heartbeatMinutes && bot.nextHeartbeatAt && !bot.paused ? tr('bots.settings.next_check', { time: age(bot.nextHeartbeatAt) }) : '';
    const meta = [bot.role, harness?.name, next].filter(Boolean).map(item => escape(item!)).join('<i aria-hidden="true">·</i>');
    return `<header class="bp-bar ${live ? 'is-working' : ''} ${bot.paused ? 'is-paused' : ''}"><span class="bots-ring bp-ring">${avatar(bot)}</span>
      <div class="bp-id"><div class="bp-name-row"><h3 class="bp-name">${escape(bot.name)}</h3><span class="bp-state" data-state="${state}">${escape(stateLabel)}</span></div><p class="bp-meta">${meta}</p></div>
      <div class="bp-actions">
        <button type="button" class="secondary-button bp-open" data-bots-action="open-chat">${icon('chat')}<span>${escapeI18n(tr('modules.common.open_chat'))}</span></button>
        <button type="button" class="icon-button" data-bots-action="pause" aria-label="${escape(bot.paused ? tr('bots.settings.resume') : tr('bots.settings.pause'))}" title="${escape(bot.paused ? tr('bots.settings.resume_hint') : tr('bots.settings.pause_hint'))}" aria-pressed="${bot.paused}">${icon(bot.paused ? 'play' : 'pause')}</button>
        <span class="bp-more"><button type="button" class="icon-button" data-bots-action="more" aria-label="${escapeI18n(tr('modules.common.more'))}" title="${escapeI18n(tr('modules.common.more'))}" aria-haspopup="menu" aria-expanded="${moreOpen}">${icon('more')}</button>
        ${moreOpen ? `<span class="bp-menu" role="menu"><button type="button" role="menuitem" data-bots-action="reset" aria-label="${escapeI18n(tr('modules.common.reset_bot'))}">${icon('reset')}${escape(tr('bots.settings.reset'))}…<small>${escapeI18n(tr('modules.common.forget_conversations_memories_and_schedules'))}</small></button><button type="button" role="menuitem" class="danger" data-bots-action="delete" aria-label="${escapeI18n(tr('modules.common.delete_bot'))}">${icon('trash')}${escape(tr('bots.settings.delete_menu'))}<small>${escapeI18n(tr('modules.common.remove_the_bot_and_its_channels'))}</small></button></span>` : ''}</span>
      </div></header>
      ${bot.paused ? `<p class="bots-banner">${escapeI18n(tr('modules.common.paused_schedules_check_ins_and_channel_messages_wait_until_you_resume'))}</p>` : ''}`;
  }

  function badge(id: Nav): string {
    const pending = id === 'channels' ? detail?.pairings.filter(item => item.status === 'pending').length ?? 0 : 0;
    if (pending) return `<span class="bots-badge" aria-label="${escape(tr('bots.settings.waiting_count', { count: pending }))}">${pending}</span>`;
    const counts: Partial<Record<Nav, number>> = detail ? { memory: detail.memories.length, schedules: detail.schedules.filter(item => item.enabled).length, channels: detail.channels.filter(item => item.enabled).length } : {};
    return counts[id] ? `<span class="bots-count">${counts[id]}</span>` : '';
  }

  function render(preserveDrafts = false): void {
    if (disposed) return;
    // A locale change is presentation-only: retain every field, not just the focused input.
    const controls = 'input:not([type=file]),textarea,select';
    const drafts = preserveDrafts ? [...pane.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(controls)].map(field => ({
      name: field.name, id: field.id, tag: field.tagName, value: field.value,
      checked: field instanceof HTMLInputElement ? field.checked : undefined,
      preferred: field.dataset.preferredModel,
    })) : [];
    list?.setAttribute('aria-label', tr('modules.common.bots'));
    host.classList.toggle('bots-creating', editing === 'new' && !single);
    // The window's title names the create form, so the form needs no heading of its own.
    const dialog = single ? null : host.closest('dialog'), title = dialog?.querySelector('.dialog-title h2');
    if (dialog && title) { title.textContent = editing === 'new' ? tr('modules.common.new_bot') : tr('modules.common.bots'); dialog.setAttribute('aria-label', title.textContent); }
    renderList();
    const confirm = confirming ? `<div class="bots-confirm" role="alertdialog" aria-label="${escape(confirming.title())}"><b>${escape(confirming.title())}</b><p>${escape(confirming.text())}</p><div class="dialog-footer"><button type="button" class="secondary-button" data-bots-action="confirm-cancel">${escapeI18n(tr('modules.common.cancel'))}</button><button type="button" class="primary-button danger" data-bots-action="confirm-run">${escape(confirming.button())}</button></div></div>` : '';
    const alert = error ? `<p class="bots-error" role="alert">${escape(error)}</p>` : '';
    if (loading) { pane.innerHTML = `<p class="dialog-loading" role="status">${escapeI18n(tr('modules.common.loading_bots'))}</p>`; return; }
    // Keep a half-typed setting (a new memory, a schedule prompt) and its caret through background refreshes.
    const typing = pane.contains(document.activeElement) ? document.activeElement as HTMLInputElement | HTMLTextAreaElement : null;
    const kept = typing?.matches('textarea,input:not([type=checkbox],[type=hidden])') ? { name: typing!.name || typing!.getAttribute('aria-label') || '', value: typing!.value, start: typing!.selectionStart, end: typing!.selectionEnd } : null;
    const rail = pane.querySelector('.bc-rail')?.scrollLeft ?? 0;
    // Any other control (a swatch in the icon popover, a switch) gets focus back by position.
    const FOCUSABLE = 'button,input:not([type=hidden]),select,textarea,summary';
    const focusAt = typing ? [...pane.querySelectorAll(FOCUSABLE)].indexOf(typing) : -1;
    const focusTag = typing?.tagName;
    // A selected bot whose detail is loading or failed shows only that state, never the create form.
    if (!detail && selected && editing !== 'new' && !single) { pane.innerHTML = alert || `<p class="dialog-loading" role="status">${escapeI18n(tr('modules.common.loading_bot'))}</p>`; return; }
    if (editing === 'new' || !detail) {
      pane.innerHTML = alert + (single && !detail ? `<p class="bots-empty-note">${escapeI18n(tr('modules.common.this_bot_no_longer_exists'))}</p>` : renderCreate());
      const list = pane.querySelector<HTMLElement>('.bc-rail');
      if (list) { list.scrollLeft = rail; railFades(list); }
    } else {
      const nav = `<div class="bs-nav" role="tablist" aria-orientation="vertical" aria-label="${escapeI18n(tr('modules.common.bot_settings'))}">${SECTIONS.map(item => `<button type="button" role="tab" id="bs-tab-${item.id}" data-section="${item.id}" aria-controls="bs-panel" aria-selected="${item.id === section}" tabindex="${item.id === section ? 0 : -1}">${icon(item.icon)}<span>${escape(item.label)}</span>${badge(item.id)}</button>`).join('')}</div>`;
      const current = SECTIONS.find(item => item.id === section)!;
      const body = section === 'profile' ? renderProfile(detail.bot)
        : section === 'activity' ? `${heading(tr('bots.settings.conversations'))}${renderPanel('conversations', detail, context)}${heading(tr('bots.settings.rules'), infoMark(tr('modules.common.answer_the_bot_s_requests_for_you_deny_wins_over_allow_and'), tr('modules.common.about_rules')))}${renderPanel('rules', detail, context)}${heading(tr('bots.settings.activity_log'))}${renderPanel('activity', detail, context)}`
        : renderPanel(section, detail, context);
      const saved = section === 'profile' ? `<span class="bs-saved" role="status" aria-live="polite" data-state="${saveState}"></span>` : '';
      pane.innerHTML = `${renderHeader(detail.bot)}${confirm}${alert}<div class="bs-body">${nav}<div class="bots-panel" id="bs-panel" role="tabpanel" aria-labelledby="bs-tab-${section}"><div class="bs-panel-head"><h2>${escape(current.label)}${saved}</h2><p>${escape(current.text)}</p></div>${body}</div></div>`;
      setSaved(saveState);
    }
    if (preserveDrafts) {
      [...pane.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(controls)].forEach((field, index) => {
        const draft = drafts[index];
        if (!draft || draft.name !== field.name || draft.id !== field.id || draft.tag !== field.tagName) return;
        field.value = draft.value;
        if (field instanceof HTMLInputElement && draft.checked !== undefined) field.checked = draft.checked;
        if (draft.preferred !== undefined) field.dataset.preferredModel = draft.value;
      });
    }
    hydrateFormModels();
    if (kept?.name) {
      const again = [...pane.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input,textarea')].find(field => (field.name || field.getAttribute('aria-label')) === kept.name);
      if (again) { again.value = kept.value; again.focus(); if (kept.start !== null && 'setSelectionRange' in again) try { again.setSelectionRange(kept.start, kept.end); } catch { /* Not a text field. */ } }
    } else if (focusAt >= 0) {
      const again = pane.querySelectorAll<HTMLElement>(FOCUSABLE)[focusAt];
      if (again?.tagName === focusTag) again.focus();
    }
  }
  /** Edge fades show only where the carousel has more to scroll to. */
  function railFades(list: HTMLElement): void {
    list.classList.toggle('fade-start', list.scrollLeft > 1);
    list.classList.toggle('fade-end', list.scrollLeft < list.scrollWidth - list.clientWidth - 1);
  }

  /** Reads the create form into the draft; a suggestion stays picked only while its text is unchanged. */
  function readDraft(form: HTMLFormElement): void {
    const data = new FormData(form);
    const text = (name: string) => String(data.get(name) ?? '');
    const next = { ...draft, name: text('name'), purpose: text('purpose'), avatar: text('avatar') || draft.avatar, color: text('color'), provider: text('provider') as ProviderId, model: text('model'), reasoningEffort: text('reasoningEffort') };
    const picked = SUGGESTIONS.find(item => item.id === next.suggestion);
    draft = picked && (next.suggestionName ?? picked.name) === next.name.trim() && (next.suggestionPurpose ?? picked.purpose) === next.purpose.trim() ? next : { ...next, suggestion: '', role: '', heartbeatMinutes: 0 };
  }
  function previewDraft(form: HTMLFormElement): void {
    form.querySelector('.bc-preview')!.innerHTML = botAvatarHtml(draft.avatar, draft.name || tr('bots.settings.bot'), 'bc-avatar', draft.color);
    form.querySelector('.bc-count')!.textContent = `${draft.purpose.length} / ${PURPOSE_MAX}`;
    for (const card of pane.querySelectorAll('[data-suggestion]')) card.setAttribute('aria-pressed', String((card as HTMLElement).dataset.suggestion === draft.suggestion));
  }
  function createBot(form: HTMLFormElement): void {
    readDraft(form);
    const name = draft.name.trim(), purpose = draft.purpose.trim();
    if (!name) { nameError = tr('bots.settings.name_error'); render(); pane.querySelector<HTMLInputElement>('input[name=name]')?.focus(); return; }
    nameError = '';
    const input: BotInput = { name, role: draft.role, instructions: purpose, goals: '', avatar: draft.avatar, color: draft.color, provider: draft.provider as ProviderId, model: draft.model, mode: 'ask', heartbeatMinutes: draft.heartbeatMinutes, reasoningEffort: draft.reasoningEffort, backupModels: [], fallbackMode: 'ask', notify: true, whileWorking: 'queue', showPlan: false };
    creating = true; render();
    void work(async () => {
      try {
        const bot = await options.call<Bot>('bot_create', { input });
        selected = bot.id; editing = null; section = 'profile'; draft = newDraft();
        await load();
        options.openChat(bot.id);
      } finally { creating = false; if (!disposed && pane.querySelector('.bc-form')) render(); }
    });
  }

  const click = (event: MouseEvent) => {
    if (handleAvatarPicker(event)) return;
    // A click anywhere outside the More menu or the icon popover closes it, like any menu.
    const inside = (selector: string) => event.target instanceof Element && event.target.closest(selector);
    if (moreOpen && !inside('.bp-more')) { moreOpen = false; render(); }
    if (avatarOpen && !inside('.bp-avatar-wrap')) { avatarOpen = false; render(); }
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>('button,[data-bot]') : null;
    if (!target || !host.contains(target) || (target as HTMLButtonElement).disabled) return;
    if (target.dataset.bot) { selected = target.dataset.bot; editing = null; confirming = null; if (detail?.bot.id !== selected) { detail = null; render(); } void load(); return; }
    if (target.dataset.section) { section = target.dataset.section as Nav; confirming = null; avatarOpen = false; render(); return; }
    if (target.dataset.suggestion) {
      const picked = SUGGESTIONS.find(item => item.id === target.dataset.suggestion)!;
      const form = pane.querySelector<HTMLFormElement>('.bc-form');
      if (form) readDraft(form);
      draft = { ...draft, name: picked.name, purpose: picked.purpose, role: picked.role, avatar: picked.avatar, color: '', heartbeatMinutes: picked.heartbeatMinutes, suggestion: picked.id, suggestionName: picked.name, suggestionPurpose: picked.purpose };
      nameError = ''; render(); pane.querySelector<HTMLElement>(`[data-suggestion="${picked.id}"]`)?.focus(); return;
    }
    const bot = detail?.bot;
    if (bot && target.dataset.permission) {
      const mode = target.dataset.permission;
      if (!permissionChoices(bot.provider, bot.mode).some(item => item.id === mode)) return;
      if (mode === 'full' && bot.mode !== 'full') {
        context.confirm(() => tr('bots.settings.full_title', { name: bot.name }), () => tr('bots.settings.full_body'), () => tr('bots.settings.full_allow'), async () => patchBot({ mode }));
        return;
      }
      patchBot({ mode }); return;
    }
    if (bot && target.dataset.backupMove) {
      const from = Number(target.dataset.backupMove), to = from + Number(target.dataset.step);
      const list = [...(bot.backupModels ?? [])];
      [list[from], list[to]] = [list[to], list[from]];
      patchBot({ backupModels: list }); pane.querySelector<HTMLElement>(`[data-backup-move="${to}"][data-step="${target.dataset.step}"]:not(:disabled)`)?.focus(); return;
    }
    if (bot && target.dataset.backupRemove) { patchBot({ backupModels: (bot.backupModels ?? []).filter((_, index) => index !== Number(target.dataset.backupRemove)) }); return; }
    const action = target.dataset.botsAction;
    if (moreOpen && action !== 'more') moreOpen = false;
    if (action === 'new') { editing = 'new'; draft = newDraft(); nameError = ''; confirming = null; render(); pane.querySelector<HTMLInputElement>('input[name=name]')?.focus(); }
    else if (action === 'cancel-edit') { editing = null; nameError = ''; render(); }
    else if (action === 'more') { moreOpen = !moreOpen; render(); if (moreOpen) pane.querySelector<HTMLElement>('.bp-menu [role=menuitem]')?.focus(); }
    else if (action === 'avatar') { avatarOpen = !avatarOpen; render(); pane.querySelector<HTMLElement>(avatarOpen ? '.bp-avatar-pop button' : '.bp-avatar-button')?.focus(); }
    else if (action === 'avatar-upload') pane.querySelector<HTMLInputElement>('.bp-avatar-pop [data-avatar-upload]')?.click();
    else if (action === 'avatar-reset' && bot) patchBot({ avatar: 'panda:0', color: '' });
    else if (action === 'soul-import') pane.querySelector<HTMLInputElement>('input[data-soul-file]')?.click();
    else if (action === 'soul-remove') setSoul('');
    else if (action === 'open-chat' && bot) options.openChat(bot.id);
    else if (action === 'pause' && bot) void work(async () => { await options.call('bot_set_paused', { botId: bot.id, paused: !bot.paused }); options.notify(bot.paused ? tr('bots.settings.resumed', { name: bot.name }) : tr('bots.settings.paused_notice', { name: bot.name })); await load(); });
    else if (action === 'reset' && bot) context.confirm(() => tr('bots.settings.reset_title', { name: bot.name }), () => tr('bots.settings.reset_body'), () => tr('bots.settings.reset'), async () => { await options.call('bot_reset', { botId: bot.id }); options.notify(tr('bots.settings.reset_done', { name: bot.name })); await load(); });
    else if (action === 'delete' && bot) context.confirm(() => tr('bots.settings.delete_title', { name: bot.name }), () => tr('bots.settings.delete_body'), () => tr('bots.settings.delete'), async () => { await options.call('bot_delete', { botId: bot.id }); selected = ''; options.notify(tr('bots.settings.delete_done', { name: bot.name })); if (single) { options.onDeleted?.(); return; } await load(); });
    else if (action === 'confirm-cancel') { confirming = null; render(); }
    else if (action === 'confirm-run' && confirming) { const run = confirming.action; confirming = null; render(); void work(run); }
    else if (section !== 'profile') panelClick(target, section, context);
  };
  const submit = (event: SubmitEvent) => {
    const form = event.target as HTMLFormElement;
    if (!host.contains(form)) return;
    event.preventDefault();
    if (form.matches('.bc-form')) createBot(form);
    else if (form.matches('.bots-profile')) queueSave();
    else if (section !== 'profile') panelSubmit(form, section, context);
  };
  /** A new harness brings its own models, permissions and reasoning levels. */
  function providerChanged(form: HTMLFormElement, providerId: ProviderId): void {
    const provider = options.providers.find(item => item.id === providerId);
    const select = form.querySelector<HTMLSelectElement>('select[name=model]');
    const mode = form.querySelector<HTMLInputElement>('input[name=mode]');
    if (provider && select) {
      const preferred = options.defaultModel(provider.id) || 'default';
      select.dataset.preferredModel = preferred;
      void loadFormModels(provider.id, select, preferred);
    }
    if (provider && mode) {
      if (!permissionChoices(provider.id, mode.value).some(item => item.id === mode.value)) mode.value = 'ask';
      const group = form.querySelector<HTMLElement>('.bp-rule-options[role=radiogroup]');
      if (group) group.innerHTML = permissionOptions(provider.id, mode.value);
    }
    syncEfforts(form);
  }
  /** Edits the form in place (a render would drop unsaved fields); saving stores it. */
  function setSoul(text: string, problem = ''): void {
    const field = pane.querySelector<HTMLTextAreaElement>('.bots-form textarea[name=soul]');
    const alert = pane.querySelector<HTMLElement>('.bots-soul-error');
    if (!field || !alert) return;
    if (!problem) field.value = text;
    alert.textContent = problem; alert.hidden = !problem;
    pane.querySelector<HTMLElement>('[data-bots-action=soul-remove]')!.hidden = !field.value;
    field.focus();
    if (!problem) queueSave();
  }
  const change = (event: Event) => {
    if (handleAvatarPicker(event)) return;
    const target = event.target as HTMLElement;
    if (target.matches('input[data-soul-file]')) {
      const input = target as HTMLInputElement;
      const file = input.files?.[0];
      input.value = '';
      if (file) void readSoulFile(file).then(text => setSoul(text), (failure: Error) => setSoul('', failure.message));
      return;
    }
    const form = target.closest<HTMLFormElement>('.bc-form,.bots-profile');
    if (form && target.matches('select[name=provider]')) providerChanged(form, (target as HTMLSelectElement).value as ProviderId);
    else if (form && target.matches('select[name=model]')) syncEfforts(form);
    if (form?.matches('.bc-form')) { readDraft(form); return; }
    if (form && detail) {
      const bot = detail.bot;
      if (target.matches('[data-backup-add]')) {
        const value = (target as HTMLSelectElement).value;
        if (value) patchBot({ backupModels: [...(bot.backupModels ?? []), JSON.parse(value) as BackupModel] });
        return;
      }
      if (target.matches('select[name=mode]') && (target as HTMLSelectElement).value === 'full' && bot.mode !== 'full') {
        context.confirm(() => tr('bots.settings.full_title', { name: bot.name }), () => tr('bots.settings.full_body'), () => tr('bots.settings.full_allow'), async () => patchBot({ mode: 'full' }));
        return;
      }
      if (target.matches('input[name=name],input[name=role],textarea')) return; // Saved by the `input` listener.
      queueSave();
      return;
    }
    if (section !== 'profile') panelChange(target, section, context);
  };
  const typed = (event: Event) => {
    const target = event.target as HTMLElement;
    connectInput(target);
    const form = target.closest<HTMLFormElement>('.bc-form,.bots-profile');
    if (form?.matches('.bc-form')) {
      readDraft(form); previewDraft(form);
      if (nameError && draft.name.trim()) { nameError = ''; form.querySelector('#bc-name-error')?.remove(); form.querySelector('input[name=name]')?.removeAttribute('aria-invalid'); }
    } else if (form && detail) {
      // The icon pickers report through their hidden inputs: show the choice at once, then save.
      // The popover stays as it is (and keeps focus), so only the icon itself is redrawn.
      if (target.matches('input[name=avatar],input[name=color]')) {
        patchBot({ [(target as HTMLInputElement).name]: (target as HTMLInputElement).value }, false);
        const icon = pane.querySelector('.bp-avatar-button .bot-avatar');
        if (icon && detail) icon.outerHTML = avatar(detail.bot, 'bp-avatar');
        return;
      }
      if (target.matches('input[name=name],input[name=role],textarea')) queueSave(600);
    }
  };
  host.addEventListener('click', click);
  host.addEventListener('submit', submit);
  host.addEventListener('change', change);
  host.addEventListener('input', typed);
  // `toggle` and `scroll` do not bubble, so listen while capturing.
  const toggled = (event: Event) => {
    if (!(event.target instanceof HTMLDetailsElement)) return;
    if (event.target.matches('.bs-advanced')) advancedOpen = event.target.open; else guideToggled(event.target);
  };
  host.addEventListener('toggle', toggled, true);
  const scrolled = (event: Event) => { if (event.target instanceof HTMLElement && event.target.matches('.bc-rail')) railFades(event.target); };
  host.addEventListener('scroll', scrolled, true);
  /** The section list moves like the app's Settings sidebar: arrow keys, Home and End. */
  const navKeys = (event: KeyboardEvent): boolean => {
    const tabs = [...pane.querySelectorAll<HTMLButtonElement>('.bs-nav [role=tab]')];
    const index = tabs.indexOf(event.target as HTMLButtonElement);
    const step = ({ ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 } as Record<string, number>)[event.key];
    if (index < 0 || (!step && event.key !== 'Home' && event.key !== 'End')) return false;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + step + tabs.length) % tabs.length;
    section = tabs[next].dataset.section as Nav; confirming = null; render();
    pane.querySelector<HTMLElement>(`#bs-tab-${section}`)?.focus();
    return true;
  };
  const keys = (event: KeyboardEvent) => {
    if (navKeys(event) || event.key !== 'Escape' || !(moreOpen || avatarOpen)) return;
    event.preventDefault(); event.stopPropagation();
    const trigger = moreOpen ? '[data-bots-action="more"]' : '.bp-avatar-button';
    moreOpen = avatarOpen = false; render(); pane.querySelector<HTMLElement>(trigger)?.focus();
  };
  host.addEventListener('keydown', keys);
  const unlistenLocale = onLocaleChange(() => render(true));
  render();
  void load();
  return {
    refresh: () => { if (!busy) void load(); },
    agent: (sessionId, kind) => {
      if (!detail?.threads.some(thread => thread.sessionId === sessionId)) return;
      if (kind === 'done') { void load(); return; }
      if (kind === 'turn_start' || kind === 'status') renderList();
    },
    dispose: () => { disposed = true; unlistenLocale(); host.removeEventListener('click', click); host.removeEventListener('submit', submit); host.removeEventListener('change', change); host.removeEventListener('input', typed); host.removeEventListener('toggle', toggled, true); host.removeEventListener('scroll', scrolled, true); void flushSave(); host.removeEventListener('keydown', keys); },
  };
}
