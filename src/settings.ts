import { t, onLocaleChange, getLocale, setLocale } from './i18n';
import './settings.css';
import { mountProviderReadiness } from './provider-readiness';
import { escape, icon, morph } from './dom';
import { infoMark } from './tooltip';
import { providerLogo } from './provider-logos';
import { uiSizeControls } from './ui-size';
import type { Project, Provider, ProviderId } from './types';
import { mountOverlaySettings } from './overlay-settings';
import { mountSupportDetails } from './support-settings';
import { aboutSettingsHtml, mountAboutSettings } from './about-settings';
import { mountResourceUsage, resourceUsageHtml } from './resource-usage-settings';
import { colorsSummary } from './theme-settings';
import { mountModelRouting } from './model-routing';
import { mountAgentTeams, type AgentTeamsOptions } from './agent-teams';
import { mountCloudSettings, type CloudSettingsHost } from './cloud-settings';
import { mountSkillsLibrary, type SkillsLibraryHost } from './skills-library';
import { call, subscribe } from './bridge';
import { mount as mountCapabilities } from './capabilities-panel';
import { mountRemoteSettings } from './remote-settings';
import type { RemoteHost } from './remote-types';
import type { AgentsDockPreferences } from './agents-dock';

/** Panels that live elsewhere and are embedded here: each mounts into a host and returns its cleanup. */
type Embed = (host: HTMLElement) => Promise<() => void>;

export type SettingsSection = 'general' | 'appearance' | 'agents' | 'providers' | 'teams' | 'tools' | 'skills' | 'cloud' | 'remote' | 'github' | 'about';

interface SettingsOptions {
  providers: Provider[];
  defaultProvider: ProviderId;
  defaultModel: string;
  activityExpanded: boolean;
  compact: boolean;
  wallpapers: boolean;
  theme: 'light' | 'dark';
  preview: boolean;
  /** Runs the checkout's fast check after a clean turn and queues one repair on failure. */
  turnChecks: boolean;
  section?: SettingsSection;
  discover(): Promise<Provider[]>;
  /** Mounts the optional GitHub row; returns its cleanup. */
  github?(host: HTMLElement): () => void;
  /** Projects listed under General; remove() rejects with the native refusal text. */
  projects?: { list(): Project[]; remove(id: string): Promise<void> };
  /** Named agent teams and the classic Team setup switch. */
  teams?: Omit<AgentTeamsOptions, 'providers'>;
  /** Cloud sandbox connections (Daytona, Cloudflare, AWS). */
  cloud?: CloudSettingsHost;
  /** Skills library and rules registry. */
  skills?: SkillsLibraryHost;
  /** PandaCode Connect: sign-in, remote control and devices. */
  remote?: RemoteHost;
  embed: { colors: Embed; wallpapers: Embed; providerConnections: Embed; openCodeModels: Embed };
  /** Leaves Settings for the workspace. */
  close(): void;
}
export interface SettingsView { show(section: SettingsSection): void; dispose(): void }

/** The groups in the left column, in order. Each names what it holds, not a vague umbrella. */
export const SECTIONS = (): { id: SettingsSection; label: string; icon: string; description: string }[] => [
  { id: 'general', label: t('shell.settings.general'), icon: 'settings', description: t('shell.settings.generalDescription') },
  { id: 'appearance', label: t('shell.settings.appearance'), icon: 'sun', description: t('shell.settings.appearanceDescription') },
  { id: 'agents', label: t('shell.settings.agents'), icon: 'bot', description: t('shell.settings.agentsDescription') },
  { id: 'providers', label: t('shell.settings.providers'), icon: 'lock', description: t('shell.settings.providersDescription') },
  { id: 'teams', label: t('shell.settings.teams'), icon: 'grid', description: t('shell.settings.teamsDescription') },
  { id: 'tools', label: t('shell.settings.tools'), icon: 'terminal', description: t('shell.settings.toolsDescription') },
  { id: 'skills', label: t('shell.settings.skills'), icon: 'widget', description: t('shell.settings.skillsDescription') },
  { id: 'cloud', label: t('shell.settings.cloud'), icon: 'server', description: t('shell.settings.cloudDescription') },
  { id: 'remote', label: t('shell.settings.remote'), icon: 'globe', description: t('shell.settings.remoteDescription') },
  { id: 'github', label: 'GitHub', icon: 'github', description: t('shell.settings.githubDescription') },
  { id: 'about', label: t('shell.settings.about'), icon: 'info', description: t('shell.settings.aboutDescription') },
];

/** Key-based plans that run through Claude Code; they are set up under Providers, not listed as agents. */
const PLANS = new Set<ProviderId>(['glm', 'mimo']);

const LONG_DETAIL = 80;
const switchRow = (id: string, title: string, detail: string, checked: boolean) =>
  `<div class="setting-row"><div><strong>${escape(title)}${detail.length > LONG_DETAIL ? ` ${infoMark(detail)}` : ''}</strong>${detail.length > LONG_DETAIL ? '' : `<small>${escape(detail)}</small>`}</div><input type="checkbox" class="settings-switch" id="${id}" aria-label="${escape(title)}" ${checked ? 'checked' : ''}></div>`;

function mountAgentsDockSettings(host: HTMLElement): () => void {
  let disposed = false;
  let preferences: AgentsDockPreferences = { enabled: true, keepOnScreen: true, pinned: false };
  let error = '';
  let unsubscribe: (() => void) | undefined;
  // Disabling a focused switch while saving blurs it, so the change handler remembers it.
  let refocus = '';
  const draw = () => {
    if (disposed) return;
    const active = document.activeElement;
    const focused = refocus || (active instanceof HTMLElement && host.contains(active) ? active.id : '');
    refocus = '';
    host.innerHTML = `<div class="settings-group">${switchRow('agents-dock-enabled', t('shell.settings.widget'), t('shell.settings.widgetDescription'), preferences.enabled)}${switchRow('agents-dock-keep-on-screen', t('shell.settings.keepWidget'), t('shell.settings.keepWidgetDescription'), preferences.keepOnScreen)}${error ? `<small class="settings-embed-error" role="alert">${escape(error)}</small>` : ''}</div>`;
    if (focused) host.querySelector<HTMLElement>(`#${focused}`)?.focus({ preventScroll: true });
  };
  const change = async (event: Event) => {
    const target = event.target instanceof HTMLInputElement ? event.target : null;
    if (!target || !['agents-dock-enabled', 'agents-dock-keep-on-screen'].includes(target.id)) return;
    const next = {
      enabled: target.id === 'agents-dock-enabled' ? target.checked : preferences.enabled,
      keepOnScreen: target.id === 'agents-dock-keep-on-screen' ? target.checked : preferences.keepOnScreen,
    };
    refocus = target.id;
    host.querySelectorAll<HTMLInputElement>('.settings-switch').forEach(input => { input.disabled = true; });
    try {
      preferences = { ...preferences, ...await call<AgentsDockPreferences>('agents_dock_save_preferences', next) };
      error = '';
    } catch (failure) {
      error = failure instanceof Error ? failure.message : String(failure);
    }
    draw();
  };
  host.addEventListener('change', change);
  void call<AgentsDockPreferences>('agents_dock_preferences').then(value => {
    if (!disposed) { preferences = { ...preferences, ...value }; draw(); }
  }).catch(() => undefined);
  const subscribeDockEvent = subscribe as unknown as <T>(name: string, callback: (event: T) => void) => Promise<() => void>;
  void subscribeDockEvent<Partial<AgentsDockPreferences>>('agents-dock-preferences-changed', value => {
    if (!disposed) { preferences = { ...preferences, ...value }; draw(); }
  }).then(cleanup => { if (disposed) cleanup(); else unsubscribe = cleanup; }).catch(() => undefined);
  draw();
  const stopLocale = onLocaleChange(draw);
  return () => {
    stopLocale();
    disposed = true;
    unsubscribe?.();
    host.removeEventListener('change', change);
    host.replaceChildren();
  };
}

function sectionHtml(id: SettingsSection, options: SettingsOptions): string {
  const defaultName = options.providers.find(provider => provider.id === options.defaultProvider)?.name ?? options.defaultProvider;
  switch (id) {
    case 'general': return `<div class="settings-group"><div class="setting-row"><div><strong>${escape(t('shell.settings.language'))}</strong><small>${escape(t('shell.settings.languageDescription'))}</small></div><select id="settings-language" class="settings-select" aria-label="${escape(t('shell.settings.language'))}"><option value="zh-CN" ${getLocale() === 'zh-CN' ? 'selected' : ''}>简体中文</option><option value="en" ${getLocale() === 'en' ? 'selected' : ''}>English</option></select></div>${uiSizeControls()}${switchRow('compact-mode', t('shell.settings.compact'), t('shell.settings.compactDescription'), options.compact)}${switchRow('expand-tool-activity', t('shell.settings.expandActivity'), t('shell.settings.expandActivityDescription'), options.activityExpanded)}</div>
      <h3 class="settings-heading">${escape(t('shell.settings.launcher'))}</h3><div id="launcher-settings"></div><h3 class="settings-heading">${escape(t('shell.settings.widget'))}</h3><div id="agents-dock-settings"></div>${options.projects ? `<h3 class="settings-heading">${escape(t('shell.settings.projects'))}</h3><div id="projects-settings" class="settings-group"></div>` : ''}`;
    case 'appearance': return `<div class="settings-group">
        <div class="setting-row"><div><strong>${escape(t('shell.settings.theme'))}</strong><small>${escape(t('shell.settings.themeDescription', { theme: options.theme === 'dark' ? t('shell.settings.dark') : t('shell.settings.light') }))}</small></div><button type="button" class="secondary-button" data-action="toggle-theme">${icon(options.theme === 'dark' ? 'sun' : 'moon')}${escape(options.theme === 'dark' ? t('shell.settings.useLight') : t('shell.settings.useDark'))}</button></div>
        <div class="setting-row"><div><strong>${escape(t('shell.settings.wallpapersDaily'))}</strong><small>${escape(t('shell.settings.wallpapersDescription'))}</small></div><input type="checkbox" class="settings-switch" id="daily-wallpapers" aria-label="${escape(t('shell.settings.wallpapersDaily'))}" ${options.wallpapers ? 'checked' : ''}></div>
      </div>
      <h3 class="settings-heading">${escape(t('shell.settings.colors'))} <small class="settings-colors-summary">${escape(colorsSummary())}</small></h3><div class="settings-embed" data-embed="colors"></div>
      <h3 class="settings-heading">${escape(t('shell.settings.wallpapers'))}</h3><div class="settings-embed" data-embed="wallpapers"></div>`;
    case 'agents': return `<div class="settings-group">
        <div class="setting-row settings-default-row"><div><strong>${escape(t('shell.settings.defaultAgent'))}</strong><small>${escape(t('shell.settings.usedForNewTasks'))}</small></div><button type="button" id="default-provider" class="settings-select" data-action="default-provider" aria-label="${escape(t('shell.settings.defaultAgentLabel'))}" aria-haspopup="dialog" aria-expanded="false">${providerLogo(options.defaultProvider)}<span>${escape(defaultName)}</span>${icon('down')}</button></div>
        <div class="setting-row settings-default-row"><div><strong>${escape(t('shell.settings.defaultModel'))}</strong><small>${escape(t('shell.settings.usedForNewTasks'))}</small></div><button type="button" id="default-model" class="settings-select" data-action="default-model" aria-label="${escape(t('shell.settings.defaultModelLabel'))}" aria-haspopup="dialog" aria-expanded="false"><span>${escape(options.defaultModel)}</span>${icon('down')}</button></div>
        <div class="setting-row"><div><strong>${escape(t('shell.settings.agentUpdates'))}</strong><small>${escape(t('shell.settings.agentUpdatesDescription'))}</small></div><button type="button" class="secondary-button" data-action="agent-updates" aria-haspopup="dialog">${escape(t('shell.settings.checkUpdates'))}</button></div>
        ${switchRow('turn-checks', t('shell.settings.turnChecks'), t('shell.settings.turnChecksDescription'), options.turnChecks)}
      </div>
      <div class="settings-heading settings-agents-heading"><h3>${escape(t('shell.settings.installedAgents'))}</h3><button type="button" class="settings-refresh">${icon('refresh')}${escape(t('shell.settings.refreshAgents'))}</button></div>
      <div class="settings-provider-status" role="status" hidden></div>
      <div class="provider-diagnostics settings-group"></div>
      ${options.preview ? `<p class="settings-preview-note">${escape(t('shell.settings.preview'))}</p>` : ''}
      <h3 class="settings-heading">${escape(t('shell.settings.openCodeModels'))}</h3><div class="settings-embed" data-embed="openCodeModels"></div>`;
    case 'providers': return '<div class="settings-embed" data-embed="providerConnections"></div>';
    case 'teams': return '<div id="agent-teams-settings"></div><div id="model-routing-settings"></div>';
    case 'tools': return `<div class="settings-group">
        <div class="setting-row"><div><strong>${escape(t('shell.settings.integrations'))}</strong><small>${escape(t('shell.settings.integrationsDescription'))}</small></div><button type="button" class="secondary-button" data-action="agent-integrations">${escape(t('shell.settings.manage'))}</button></div>
        <div class="setting-row"><div><strong>${escape(t('shell.settings.jev'))}</strong><small>${escape(t('shell.settings.jevDescription'))}</small></div><button type="button" class="secondary-button" data-action="jev-settings">${escape(t('shell.settings.jevSetup'))}</button></div>
      </div>
      <div id="capabilities-settings"></div>`;
    case 'skills': return '<div id="skills-library"></div>';
    case 'cloud': return '<div id="cloud-settings"></div>';
    case 'remote': return '<div id="remote-settings"></div>';
    case 'github': return '<div id="github-settings"></div>';
    case 'about': return `${aboutSettingsHtml()}${resourceUsageHtml()}
      <div class="settings-group settings-support"><div class="setting-row"><div><strong>${escape(t('shell.settings.support'))}</strong><small>${escape(t('shell.settings.supportDescription'))}</small></div><button type="button" class="secondary-button" data-action="support">${escape(t('shell.settings.openIssues'))}${icon('forward')}</button></div><details class="support-details"><summary>${escape(t('shell.settings.appDetails'))}</summary><p>${escape(t('shell.settings.appDetailsDescription'))}</p><textarea aria-label="${escape(t('shell.settings.appDetails'))}" rows="3" readonly spellcheck="false"></textarea><div class="support-details-actions"><button type="button" class="secondary-button support-copy" disabled>${icon('copy')}${escape(t('shell.settings.copyDetails'))}</button><button type="button" class="secondary-button support-retry" hidden>${escape(t('shell.settings.retry'))}</button></div><p role="status" aria-live="polite"></p></details></div>`;
  }
}

/** Settings as a full page: groups on the left, the chosen group's settings on the right. */
export function mountSettings(host: HTMLElement, options: SettingsOptions): SettingsView {
  host.classList.add('settings-page-root');
  host.innerHTML = `<nav class="settings-nav" aria-label="${escape(t('shell.settings.sections'))}">
      <div class="settings-nav-head" data-tauri-drag-region><button type="button" class="settings-back" data-settings-close aria-label="${escape(t('shell.settings.backWorkspace'))}" title="${escape(t('shell.settings.backShortcut'))}">${icon('back')}<span>${escape(t('shell.settings.back'))}</span></button></div>
      <h1 class="settings-nav-title" data-tauri-drag-region>${escape(t('shell.settings.title'))}</h1>
      <div class="settings-nav-list" role="tablist" aria-orientation="vertical" aria-label="${escape(t('shell.settings.title'))}">${SECTIONS().map(section => `<button type="button" role="tab" id="settings-tab-${section.id}" data-section="${section.id}" title="${section.label}" aria-controls="settings-panel-${section.id}" aria-selected="false" tabindex="-1">${icon(section.icon)}<span>${section.label}</span></button>`).join('')}</div>
    </nav>
    <div class="settings-content">${SECTIONS().map(section => `<section class="settings-panel" id="settings-panel-${section.id}" role="tabpanel" aria-labelledby="settings-tab-${section.id}" hidden><header class="settings-panel-head" data-tauri-drag-region><h2>${section.label}</h2><p>${section.description}</p></header><div class="settings-panel-body">${sectionHtml(section.id, options)}</div></section>`).join('')}</div>`;
  const tabs = [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  const panels = new Map(SECTIONS().map(section => [section.id, host.querySelector<HTMLElement>(`#settings-panel-${section.id}`)!]));
  const cleanups: (() => void)[] = [];
  const mounted = new Set<SettingsSection>();
  let disposed = false;

  const list = host.querySelector<HTMLElement>('.provider-diagnostics')!;
  const refreshButton = host.querySelector<HTMLButtonElement>('.settings-refresh')!;
  const status = host.querySelector<HTMLElement>('.settings-provider-status')!;
  let pending = false, discovered = false;
  const readinessCleanup: (() => void)[] = [];
  const live = () => !disposed && host.isConnected && !host.hidden;

  let latestProviders = options.providers;
  function updateProviders(all: Provider[]): void {
    latestProviders = all;
    const providers = all.filter(provider => !PLANS.has(provider.id));
    const rows = new Map(Array.from(list.querySelectorAll<HTMLDetailsElement>('details')).map(row => [row.dataset.provider!, row]));
    for (const [index, provider] of providers.entries()) {
      let row = rows.get(provider.id);
      if (!row) {
        row = document.createElement('details');
        row.className = 'provider-diagnostic'; row.dataset.provider = provider.id;
        row.innerHTML = `<summary aria-label="${escape(provider.name)}"><span class="provider-avatar ${provider.id}">${providerLogo(provider.id)}</span><strong></strong><span class="provider-availability"><span class="status-dot"></span><span class="settings-installed"></span></span>${icon('chevron')}</summary><div class="settings-provider-details"><span>${escape(t('shell.settings.version'))}</span><span class="settings-provider-version"></span><span>${escape(t('shell.settings.location'))}</span><code></code></div>`;
      }
      if (provider.id === 'antigravity' && !row.querySelector('.provider-readiness')) {
        const check = document.createElement('div');
        row.append(check); readinessCleanup.push(mountProviderReadiness(check));
      }
      row.querySelector('.settings-provider-details > span:first-child')!.textContent = t('shell.settings.version');
      row.querySelector('.settings-provider-details > span:nth-child(3)')!.textContent = t('shell.settings.location');
      row.querySelector('strong')!.textContent = provider.name;
      row.querySelector('summary')!.setAttribute('aria-label', t('shell.settings.providerDetails', { name: provider.name, status: provider.installed ? t('shell.settings.installed') : t('shell.settings.notInstalled') }));
      row.querySelector('.provider-availability')!.classList.toggle('available', provider.installed);
      row.querySelector('.settings-installed')!.textContent = provider.installed ? (provider.id === 'antigravity' ? t('shell.settings.acpInstalled') : t('shell.settings.installed')) : t('shell.settings.notInstalled');
      row.querySelector('.settings-provider-version')!.textContent = provider.version || t('shell.settings.notReported');
      row.querySelector('code')!.textContent = provider.path || t('shell.settings.installThenRefresh');
      if (list.children[index] !== row) list.insertBefore(row, list.children[index] ?? null);
      rows.delete(provider.id);
    }
    rows.forEach(row => row.remove());
  }
  async function refresh(): Promise<void> {
    if (!live() || pending) return;
    pending = true; refreshButton.disabled = true;
    status.hidden = false; status.textContent = t('shell.settings.checking');
    try {
      const providers = await options.discover();
      if (!live()) return;
      updateProviders(providers); discovered = true;
      status.textContent = ''; status.hidden = true;
    } catch {
      if (!live()) return;
      status.textContent = t('shell.settings.checkFailed');
    } finally { pending = false; if (live()) refreshButton.disabled = false; }
  }

  /** Projects: each row removes its project after an inline confirmation; the folder stays on disk. */
  function mountProjects(slot: HTMLElement, projects: NonNullable<SettingsOptions['projects']>): () => void {
    let confirming = '', error = '';
    const draw = () => {
      const rows = projects.list();
      slot.innerHTML = rows.length ? rows.map(project => confirming === project.id
        ? `<div class="setting-row project-row" data-project="${escape(project.id)}"><div><strong>${escape(t('shell.settings.remove'))} ${escape(project.name)}?</strong><small>${escape(t('shell.settings.removeProjectDescription'))}</small>${error ? `<small class="settings-embed-error" role="alert">${escape(error)}</small>` : ''}</div><div class="project-row-actions"><button type="button" class="secondary-button" data-project-cancel>${escape(t('shell.settings.cancel'))}</button><button type="button" class="secondary-button" data-project-confirm>${escape(t('shell.settings.removeProject'))}</button></div></div>`
        : `<div class="setting-row project-row" data-project="${escape(project.id)}"><div><strong>${escape(project.name)}</strong><small class="project-path">${escape(project.path)}</small></div><button type="button" class="secondary-button" data-project-remove aria-label="${escape(t('shell.settings.removeNamed', { name: project.name }))}">${escape(t('shell.settings.remove'))}</button></div>`).join('')
        : `<div class="setting-row"><div><small>${escape(t('shell.settings.noProjects'))}</small></div></div>`;
    };
    const onClick = async (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const id = target?.closest<HTMLElement>('[data-project]')?.dataset.project;
      if (!target || !id) return;
      if (target.closest('[data-project-remove]')) { confirming = id; error = ''; draw(); }
      else if (target.closest('[data-project-cancel]')) { confirming = ''; error = ''; draw(); }
      else if (target.closest('[data-project-confirm]')) {
        const button = target.closest<HTMLButtonElement>('button')!;
        button.disabled = true;
        try { await projects.remove(id); confirming = ''; error = ''; }
        catch (failure) { error = failure instanceof Error ? failure.message : String(failure); }
        if (live()) draw();
      }
    };
    slot.addEventListener('click', onClick); draw();
    const stopLocale = onLocaleChange(draw);
    return () => { stopLocale(); slot.removeEventListener('click', onClick); };
  }

  /** A group's live parts mount the first time it opens, and stay mounted while Settings is open. */
  function mountSection(id: SettingsSection): void {
    if (mounted.has(id)) return;
    mounted.add(id);
    const panel = panels.get(id)!;
    if (id === 'general') {
      cleanups.push(mountOverlaySettings(panel.querySelector<HTMLElement>('#launcher-settings')!));
      cleanups.push(mountAgentsDockSettings(panel.querySelector<HTMLElement>('#agents-dock-settings')!));
    }
    if (id === 'remote' && options.remote) cleanups.push(mountRemoteSettings(panel.querySelector<HTMLElement>('#remote-settings')!, options.remote));
    if (id === 'general' && options.projects) cleanups.push(mountProjects(panel.querySelector<HTMLElement>('#projects-settings')!, options.projects));
    if (id === 'github' && options.github) cleanups.push(options.github(panel.querySelector<HTMLElement>('#github-settings')!));
    if (id === 'teams' && options.teams) cleanups.push(mountModelRouting(panel.querySelector<HTMLElement>('#model-routing-settings')!, { ...options.teams, providers: options.providers }));
    if (id === 'teams' && options.teams) cleanups.push(mountAgentTeams(panel.querySelector<HTMLElement>('#agent-teams-settings')!, { ...options.teams, providers: options.providers }));
    if (id === 'tools') cleanups.push(mountCapabilities(panel.querySelector<HTMLElement>('#capabilities-settings')!, call));
    if (id === 'skills' && options.skills) cleanups.push(mountSkillsLibrary(panel.querySelector<HTMLElement>('#skills-library')!, options.skills));
    if (id === 'cloud' && options.cloud) cleanups.push(mountCloudSettings(panel.querySelector<HTMLElement>('#cloud-settings')!, options.cloud));
    if (id === 'about') {
      cleanups.push(mountSupportDetails(panel.querySelector<HTMLDetailsElement>('.support-details')!));
      cleanups.push(mountAboutSettings(panel.querySelector<HTMLElement>('.settings-about')!));
      cleanups.push(mountResourceUsage(panel.querySelector<HTMLElement>('.settings-resources')!));
    }
    if (id === 'agents' && !discovered) void refresh();
    for (const slot of panel.querySelectorAll<HTMLElement>('[data-embed]')) {
      const embed = options.embed[slot.dataset.embed as keyof SettingsOptions['embed']];
      slot.innerHTML = `<p class="dialog-loading">${escape(t('shell.settings.loading'))}</p>`;
      embed(slot).then(cleanup => { if (disposed) cleanup(); else cleanups.push(cleanup); })
        .catch(() => { if (!disposed) slot.innerHTML = `<p class="settings-embed-error" role="alert">${escape(t('shell.settings.loadFailed'))}</p>`; });
    }
  }

  function show(id: SettingsSection, focus = false): void {
    if (disposed) return;
    tabs.forEach(tab => { const on = tab.dataset.section === id; tab.setAttribute('aria-selected', String(on)); tab.tabIndex = on ? 0 : -1; });
    panels.forEach((panel, key) => { panel.hidden = key !== id; });
    mountSection(id);
    host.querySelector<HTMLElement>('.settings-content')!.scrollTop = 0;
    if (focus) tabs.find(tab => tab.dataset.section === id)?.focus({ preventScroll: true });
  }

  const click = (event: MouseEvent) => {
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-section], [data-settings-close]') : null;
    if (!target || !host.contains(target)) return;
    if ('settingsClose' in target.dataset) { options.close(); return; }
    show(target.dataset.section as SettingsSection);
  };
  /** The group list moves like a native sidebar: arrow keys, Home and End. */
  const keydown = (event: KeyboardEvent) => {
    const index = tabs.indexOf(event.target as HTMLButtonElement);
    if (index < 0 || !['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + tabs.length) % tabs.length;
    show(tabs[next].dataset.section as SettingsSection, true);
  };
  // Refresh this module's owned shell; embedded panels and their forms stay mounted.
  function refreshCopy(): void {
    if (disposed) return;
    host.querySelector('.settings-nav')!.setAttribute('aria-label', t('shell.settings.sections'));
    host.querySelector('.settings-nav-title')!.textContent = t('shell.settings.title');
    host.querySelector('.settings-nav-list')!.setAttribute('aria-label', t('shell.settings.title'));
    const back = host.querySelector<HTMLButtonElement>('.settings-back')!;
    back.setAttribute('aria-label', t('shell.settings.backWorkspace')); back.title = t('shell.settings.backShortcut');
    back.querySelector('span')!.textContent = t('shell.settings.back');
    for (const section of SECTIONS()) {
      const tab = tabs.find(tab => tab.dataset.section === section.id)!;
      tab.title = section.label; tab.querySelector('span')!.textContent = section.label;
      const panel = panels.get(section.id)!;
      panel.querySelector('h2')!.textContent = section.label;
      panel.querySelector('.settings-panel-head > p')!.textContent = section.description;
      const template = document.createElement('template'); template.innerHTML = sectionHtml(section.id, options);
      const body = panel.querySelector('.settings-panel-body')!;
      // Named/embedded mount points belong to their own modules.
      [...template.content.children].forEach((next, index) => {
        const current = body.children[index];
        if (!current || next.id || next.hasAttribute('data-embed') || next.classList.contains('provider-diagnostics') || next.classList.contains('settings-provider-status') || next.classList.contains('settings-about') || next.classList.contains('settings-resources')) return;
        if (next.classList.contains('settings-support')) {
          morph(current.querySelector('.setting-row')!, next.querySelector('.setting-row')!.innerHTML, 20);
          for (const selector of ['.support-details > summary', '.support-details > p:first-of-type']) current.querySelector(selector)!.textContent = next.querySelector(selector)!.textContent;
          current.querySelector('textarea')!.setAttribute('aria-label', t('shell.settings.appDetails'));
          return;
        }
        const controls = [...current.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input, select')].map(control => ({ control, value: control.value, checked: control instanceof HTMLInputElement ? control.checked : undefined }));
        // Selected model labels can change while Settings stays mounted; do not restore its initial snapshot.
        for (const id of ['default-provider', 'default-model']) {
          const oldButton = current.querySelector('#' + id), newButton = next.querySelector('#' + id);
          if (oldButton && newButton) newButton.innerHTML = oldButton.innerHTML;
        }
        morph(current, next.innerHTML, 20);
        for (const saved of controls) if (saved.control.isConnected) { saved.control.value = saved.control.id === 'settings-language' ? getLocale() : saved.value; if (saved.control instanceof HTMLInputElement && saved.checked !== undefined) saved.control.checked = saved.checked; }
      });
    }
    updateProviders(latestProviders);
    if (pending) status.textContent = t('shell.settings.checking');
  }
  const languageChanged = (event: Event) => {
    const select = event.target;
    if (!(select instanceof HTMLSelectElement) || select.id !== 'settings-language') return;
    void setLocale(select.value === 'en' ? 'en' : 'zh-CN').catch(error => { select.value = getLocale(); status.hidden = false; status.textContent = String(error); });
  };
  host.addEventListener('change', languageChanged);
  cleanups.push(onLocaleChange(refreshCopy), () => host.removeEventListener('change', languageChanged));
  updateProviders(options.providers);
  host.addEventListener('click', click);
  host.addEventListener('keydown', keydown);
  refreshButton.addEventListener('click', refresh);
  show(options.section ?? 'general', true);
  return {
    show: id => show(id, true),
    dispose: () => {
      if (disposed) return;
      disposed = true; readinessCleanup.forEach(cleanup => cleanup());
      cleanups.forEach(cleanup => cleanup());
      host.removeEventListener('click', click); host.removeEventListener('keydown', keydown);
      refreshButton.removeEventListener('click', refresh);
      host.replaceChildren(); host.classList.remove('settings-page-root');
    },
  };
}
