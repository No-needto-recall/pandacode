import { escape as escapeI18n } from './dom.ts';
import { t as tr } from './i18n.ts';
import './integrations.css';
import { call, preview } from './bridge';
import { escape, icon } from './dom';

interface Tool { name: string; description: string; }
interface Entry extends Tool { status: string; }
interface Server extends Entry { authStatus: string; tools: Tool[]; }
interface Catalog { servers: Server[]; skills: Entry[]; apps: Entry[]; warnings: string[]; }

export async function showIntegrations(dialog: HTMLDialogElement, context: { projectId: string; sessionId?: string }): Promise<void> {
  const host = document.createElement('div');
  host.className = 'integrations-view';
  host.innerHTML = `<div class="dialog-heading"><h2>${escapeI18n(tr('modules.common.tools_integrations'))}</h2><button data-action="close-dialog" aria-label="${escapeI18n(tr('modules.common.close'))}">${icon('close')}</button></div>
    <p class="dialog-description">${escapeI18n(tr('modules.common.codex_uses_its_own_coding_tools_your_configured_mcp_servers_and_skills'))}</p>
    <div class="integration-content" role="status">${escapeI18n(tr('modules.common.checking_available_integrations'))}</div>
    <div class="dialog-footer"><button class="secondary-button" data-integration-refresh>${escapeI18n(tr('modules.common.refresh'))}</button><button class="primary-button" data-action="close-dialog">${escapeI18n(tr('modules.common.done'))}</button></div>`;
  dialog.className = 'settings-dialog'; dialog.replaceChildren(host); if (!dialog.open) dialog.showModal();
  let revision = 0;
  const row = (item: Tool, status?: string) => `<div class="integration-row"><div><strong>${escape(item.name)}</strong>${item.description ? `<small>${escape(item.description)}</small>` : ''}</div>${status ? `<span class="integration-status">${escape(status)}</span>` : ''}</div>`;
  async function refresh(): Promise<void> {
    const ticket = ++revision;
    const refreshButton = host.querySelector<HTMLButtonElement>('[data-integration-refresh]')!;
    refreshButton.disabled = true;
    const results = await Promise.allSettled([
      call<Catalog>('list_agent_integrations', context), call<Tool[]>('list_app_tools'),
    ]);
    if (ticket !== revision || !host.isConnected || !dialog.open) return;
    refreshButton.disabled = false;
    const target = host.querySelector('.integration-content')!;
    const catalog = results[0].status === 'fulfilled' ? results[0].value : undefined;
    const tools = results[1].status === 'fulfilled' ? results[1].value : [];
    target.innerHTML = `${preview ? `<div class="preview-notice">${escapeI18n(tr('modules.common.browser_preview_integration_status_is_sample_data'))}</div>` : ''}
      <div class="integration-note">${escapeI18n(tr('modules.common.shell_commands_file_editing_image_inspection_web_search_and_subagents_are_supplied'))}</div>
      <div class="integration-row"><div><strong>${escapeI18n(tr('modules.common.jev_optional_add_on'))}</strong><small>${escapeI18n(tr('modules.common.browser_tests_work_review_context_matching_and_worker_suggestions_no_jev_key'))}</small></div><button class="secondary-button" data-action="jev-settings">${escapeI18n(tr('modules.common.set_up_jev'))}</button></div>
      <details class="integration-group"><summary>${escapeI18n(tr('modules.common.pandacode_tools'))} <span>${tools.length}</span></summary><p class="integration-note">${escapeI18n(tr('modules.common.core_app_tools_are_available_in_new_codex_tasks_and_their_continuations'))}</p>${tools.map(tool => row({ ...tool, name: tool.name.replace(/^pandacode_/, '').replaceAll('_', ' ') })).join('')}</details>
      ${catalog ? `<details class="integration-group" open><summary>${escapeI18n(tr('modules.common.mcp_servers'))} <span>${catalog.servers.length}</span></summary>${catalog.servers.length ? catalog.servers.map(server => `<details class="integration-server"><summary>${escape(server.name)}<span>${escape(server.status)} · ${escape(server.authStatus)}</span></summary>${server.description ? `<p class="integration-note">${escape(server.description)}</p>` : ''}${server.tools.map(tool => row(tool)).join('') || `<p class="integration-note">${escapeI18n(tr('modules.common.no_tools_were_reported'))}</p>`}</details>`).join('') : `<p class="integration-note">${escapeI18n(tr('modules.common.no_servers_were_reported_for_this_codex_configuration'))}</p>`}</details>
      <details class="integration-group"><summary>${escapeI18n(tr('modules.common.skills'))} <span>${catalog.skills.length}</span></summary>${catalog.skills.map(skill => row(skill, skill.status)).join('') || `<p class="integration-note">${escapeI18n(tr('modules.common.no_skills_were_reported_for_this_project'))}</p>`}</details>
      <details class="integration-group"><summary>${escapeI18n(tr('modules.common.apps'))} <span>${catalog.apps.length}</span></summary>${catalog.apps.map(app => row(app, app.status)).join('') || `<p class="integration-note">${escapeI18n(tr('modules.common.no_apps_were_reported_by_this_codex_installation'))}</p>`}</details>
      ${catalog.warnings.map(warning => `<p class="integration-note" role="status">${escape(warning)}</p>`).join('')}` : `<p class="integration-note" role="alert">${escapeI18n(tr('modules.common.integration_discovery_is_unavailable_check_that_codex_cli_is_installed_and_try'))}</p>`}
      <p class="integration-note">${escapeI18n(tr('modules.common.configure_servers_through_codex_cli_pandacode_inherits_that_configuration_on_the_next'))}</p>
      <button class="secondary-button" data-integration-guide>MCP setup guide ${icon('globe')}</button>`;
    target.removeAttribute('role');
    target.querySelector('[data-integration-guide]')?.addEventListener('click', () => {
      void call('open_external_url', { url: 'https://developers.openai.com/codex/mcp/' }).catch(() => {
        const note = document.createElement('p'); note.className = 'integration-note'; note.textContent = tr('modules.common.unable_to_open_the_browser_the_guide_is_at_developers_openai_com'); target.append(note);
      });
    });
  }
  host.querySelector('[data-integration-refresh]')!.addEventListener('click', () => { void refresh(); });
  await refresh();
}
