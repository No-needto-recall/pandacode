import { escape as escapeI18n } from './dom.ts';
import { t as tr, onLocaleChange, type MessageKey } from './i18n.ts';
import './provider-settings.css';
import { call, preview } from './bridge';
import { escape, icon, morph } from './dom';
import { providerLogo } from './provider-logos';
import { infoMark } from './tooltip';
import type { ConnectionSnapshot } from './connections';
import type { ProviderId } from './types';

type ClaudeMode = 'inherit' | 'subscription';
interface ClaudeStatus { mode: ClaudeMode; source: string; environmentVariables: string[]; endpoint: string | null; savedLogin: 'signedIn' | 'notSignedIn' | 'otherCredentials' | 'unknown'; conflict: boolean; }
const howProvidersWork = () => tr('modules.providers.help');
const claudeHelp = () => tr('modules.providers.claudeHelp');
const globalEnvHelp = () => tr('modules.providers.globalEnvironmentHelp');
const envHelp = () => tr('modules.providers.environmentHelp');

interface Configuration {
  executablePaths: Record<string, string>;
  globalEnvironment?: string[];
  environment?: Record<string, string[]>;
  useGlobalEnvironment?: Record<string, boolean>;
  glmKeySaved: boolean;
  glmKeyFromEnvironment: boolean;
  deepseekKeySaved: boolean;
  deepseekKeyFromEnvironment: boolean;
  commandcodeKeySaved: boolean;
  commandcodeKeyFromEnvironment: boolean;
  mimoKeySaved: boolean;
  mimoKeyFromEnvironment: boolean;
  mimoEndpoint: string | null;
  mimoEndpoints: { id: string; url: string; label: string }[];
  secureStorageAvailable: boolean;
  credentialStorageError?: string | null;
  claudeConnectionMode?: ClaudeMode;
}

/** Key-based connections share one form/status/remove pattern; the native side owns the secret. */
const keyed = {
  glm: { env: 'ZAI_API_KEY', save: 'provider_save_glm_key', remove: 'provider_remove_glm_key', get saved() { return tr('modules.providers.keySavedGLM'); }, savedFlag: 'glmKeySaved', envFlag: 'glmKeyFromEnvironment' },
  mimo: { env: 'MIMO_API_KEY', save: 'provider_save_mimo_key', remove: 'provider_remove_mimo_key', get saved() { return tr('modules.providers.keySavedMiMo'); }, savedFlag: 'mimoKeySaved', envFlag: 'mimoKeyFromEnvironment' },
  deepseek: { env: 'DEEPSEEK_API_KEY', save: 'provider_save_deepseek_key', remove: 'provider_remove_deepseek_key', get saved() { return tr('modules.providers.keySavedDeepSeek'); }, savedFlag: 'deepseekKeySaved', envFlag: 'deepseekKeyFromEnvironment' },
  commandcode: { env: 'COMMAND_CODE_API_KEY', save: 'provider_save_commandcode_key', remove: 'provider_remove_commandcode_key', get saved() { return tr('modules.providers.keySavedCommandCode'); }, savedFlag: 'commandcodeKeySaved', envFlag: 'commandcodeKeyFromEnvironment' },
} as const;
type KeyedProvider = keyof typeof keyed;

function instruction(key: MessageKey, commands: readonly string[]): string {
  const text = tr(key), ranges: [number, number][] = [];
  const word = /[A-Za-z0-9_-]/;
  for (const command of commands) {
    if (!command) continue;
    for (let start = text.indexOf(command); start !== -1; start = text.indexOf(command, start + command.length)) {
      const end = start + command.length;
      if (word.test(command[0]) && start > 0 && word.test(text[start - 1])) continue;
      if (word.test(command[command.length - 1]) && end < text.length && word.test(text[end])) continue;
      ranges.push([start, end]);
    }
  }
  let cursor = 0, html = '';
  for (const [start, end] of ranges.sort((a, b) => a[0] - b[0] || b[1] - a[1])) {
    if (start < cursor) continue;
    html += escape(text.slice(cursor, start)) + `<code>${escape(text.slice(start, end))}</code>`;
    cursor = end;
  }
  return html + escape(text.slice(cursor));
}

/** The saved-variable list and add form for one provider, or `*` for the global set. */
function envEditor(key: string): string {
  return `<div class="connection-env-list" data-env-list="${key}"></div>
    <form data-env-provider="${key}"><div class="connection-input-row"><input class="connection-env-name" aria-label="${escapeI18n(tr('modules.common.variable_name'))}" placeholder="NAME" maxlength="128" autocomplete="off" spellcheck="false"><input class="connection-env-value" aria-label="${escapeI18n(tr('modules.common.variable_value'))}" placeholder="value" maxlength="4096" autocomplete="off" spellcheck="false"><button class="secondary-button" type="submit">${escapeI18n(tr('modules.common.add'))}</button></div></form>`;
}

/** Per-provider collapsed environment section with the global-set toggle. */
function envDetails(provider: string): string {
  return `<details class="connection-env"><summary>${escape(tr('modules.providers.environment'))} ${icon('down')}</summary>
    <label class="connection-env-global"><input type="checkbox" data-use-global="${provider}"> ${escapeI18n(tr('modules.common.use_global_environment_variables'))}</label>
    ${envEditor(provider)}
    <small>${escape(envHelp())}</small>
  </details>`;
}

function keyForm(provider: KeyedProvider, label: string): string {
  return `<form id="${provider}-key-form" data-key-provider="${provider}"><label for="${provider}-key">${escape(label)}</label><div class="connection-input-row"><input id="${provider}-key" type="password" autocomplete="off" spellcheck="false" placeholder="${escapeI18n(tr('modules.common.enter_api_key'))}" maxlength="4096"><button class="primary-button" type="submit">${escapeI18n(tr('modules.common.save_key'))}</button></div></form>
      <div class="connection-key-status"><span id="${provider}-key-status" role="status">${escapeI18n(tr('modules.common.checking_connection'))}</span><button type="button" class="secondary-button" id="remove-${provider}-key" data-remove-key="${provider}" hidden>${escapeI18n(tr('modules.common.remove_saved_key'))}</button></div>`;
}

export function mountProviderSettings(host: HTMLElement, saved: () => Promise<unknown>, named?: { harnesses: { id: ProviderId; name: string }[]; saved: (snapshot: ConnectionSnapshot) => void }): () => void {
  let disposed = false, pending = false, unmountNamed: (() => void) | undefined;
  let configurationRevision = 0;
  const editedPaths = new Set<HTMLInputElement>();
  host.classList.add('provider-connections');
  const markup = () => `<p class="dialog-description">${escape(tr('modules.providers.intro'))}${infoMark(howProvidersWork(), tr('modules.common.how_providers_relate_to_agents'))}<span class="sr-only">${escape(howProvidersWork())}</span></p>${named ? '<section id="named-connections"></section>' : ''}
    <section class="connection-card" id="global-environment"><h3>${escapeI18n(tr('modules.common.global_environment_variables'))}</h3>
      <p>${instruction('modules.providers.globalIntro', ["HTTP_PROXY","HTTPS_PROXY","NO_PROXY"])}${infoMark(globalEnvHelp(), tr('modules.common.how_the_global_environment_is_applied'))}<span class="sr-only">${escape(globalEnvHelp())}</span></p>
      ${envEditor('*')}
    </section>
    <section class="connection-card" id="claude-connection"><h3>${providerLogo('claude')}Claude Code</h3>
      <div class="connection-auth-label"><label for="claude-connection-mode">${escapeI18n(tr('modules.common.claude_connection'))}</label>${infoMark(claudeHelp(), tr('modules.common.claude_connection_details'))}<span class="sr-only" id="claude-connection-help">${escape(claudeHelp())}</span></div>
      <div class="connection-select"><select id="claude-connection-mode" aria-describedby="claude-connection-help"><option value="inherit">${escapeI18n(tr('modules.common.use_current_environment'))}</option><option value="subscription">${escapeI18n(tr('modules.common.prefer_saved_claude_login'))}</option></select></div>
      <div class="connection-key-status"><span class="claude-auth-source" role="status">${escapeI18n(tr('modules.common.checking_claude_login'))}</span><span class="claude-auth-details"></span><button type="button" class="secondary-button" data-check-claude>${escapeI18n(tr('modules.common.check_login'))}</button></div>
      <p class="claude-auth-endpoint" hidden></p><p class="claude-auth-conflict" hidden>${escapeI18n(tr('modules.common.environment_credentials_can_override_your_saved_claude_login'))}</p><p class="claude-auth-login" hidden></p>
      <a href="https://code.claude.com/docs/en/authentication" target="_blank" rel="noopener noreferrer">${escape(tr('modules.providers.claudeSignInHelp'))} ${icon('forward')}</a>
      ${envDetails('claude')}
    </section>
    <section class="connection-card"><h3>${providerLogo('glm')}GLM Coding Plan<small>${escapeI18n(tr('modules.common.via_claude_code'))}</small></h3>
      <p>${escapeI18n(tr('modules.common.use_a_z_ai_coding_plan_key_with_your_installed_claude_code'))}</p>
      ${keyForm('glm', tr('modules.providers.apiKey', { name: 'Z.ai' }))}
      <a href="https://docs.z.ai/devpack/tool/claude" target="_blank" rel="noopener noreferrer">${escape(tr('modules.providers.codingPlanSetup'))} ${icon('forward')}</a>
      ${envDetails('glm')}
    </section>
    <section class="connection-card"><h3>${providerLogo('mimo')}MiMo Token Plan<small>${escapeI18n(tr('modules.common.xiaomi_via_claude_code'))}</small></h3>
      <p>${instruction('modules.providers.mimo', ["ttp-…"])}</p>
      <label for="mimo-endpoint">${escapeI18n(tr('modules.common.endpoint'))}</label><div class="connection-select"><select id="mimo-endpoint" aria-describedby="mimo-endpoint-hint"><option value="">${escapeI18n(tr('modules.common.choose_your_cluster'))}</option></select></div>
      <small id="mimo-endpoint-hint" class="connection-endpoint-hint" data-live></small>
      ${keyForm('mimo', tr('modules.providers.apiKey', { name: 'MiMo' }))}
      <a href="https://platform.xiaomimimo.com/token-plan" target="_blank" rel="noopener noreferrer">Token Plan ${icon('forward')}</a>
      ${envDetails('mimo')}
    </section>
    <section class="connection-card"><h3>${providerLogo('opencode')}OpenCode</h3><p>${instruction('modules.providers.opencode', ['opencode auth login'])}</p><p>${escapeI18n(tr('modules.common.choose_which_opencode_models_appear_in_the_model_selector_in_settings_agents'))}</p><a href="https://opencode.ai/docs/" target="_blank" rel="noopener noreferrer">${escape(tr('modules.providers.installSignIn'))} ${icon('forward')}</a>${pathForm('opencode', tr('modules.providers.executable', { name: 'OpenCode' }), '/path/to/opencode')}${envDetails('opencode')}</section>
    <section class="connection-card"><h3>${providerLogo('antigravity')}Antigravity</h3><p>${instruction('modules.providers.antigravity', ["agy"])}</p><a href="https://antigravity.google/docs/ide/extensions" target="_blank" rel="noopener noreferrer">${escape(tr('modules.providers.getAcp'))} ${icon('forward')}</a>${pathForm('antigravity', tr('modules.providers.executable', { name: 'Antigravity ACP' }), '/path/to/agy_acp_server.par')}${envDetails('antigravity')}</section>
    <section class="connection-card"><h3>${providerLogo('grok')}Grok Build<small>${escape(tr('modules.providers.xaiAcp'))}</small></h3><p>${instruction('modules.providers.grok', ["curl -fsSL https://x.ai/cli/install.sh | bash","grok login","grok agent stdio"])}</p><a href="https://docs.x.ai/build/overview" target="_blank" rel="noopener noreferrer">${escape(tr('modules.providers.grokDocs'))} ${icon('forward')}</a>${pathForm('grok', tr('modules.providers.executable', { name: 'Grok' }), '/path/to/grok')}${envDetails('grok')}</section>
    <section class="connection-card"><h3>${providerLogo('pi')}Pi</h3><p>${escapeI18n(tr('modules.common.uses_the_accounts_models_and_extensions_configured_in_pi_install_pi_and'))}</p><a href="https://github.com/earendil-works/pi" target="_blank" rel="noopener noreferrer">${escape(tr('modules.providers.installPi'))} ${icon('forward')}</a>${pathForm('pi', tr('modules.providers.executable', { name: 'Pi' }), '/path/to/pi')}${envDetails('pi')}</section>
    <section class="connection-card"><h3>${providerLogo('omp')}Oh My Pi<small>omp</small></h3><p>${instruction('modules.providers.omp', ["bun install -g @oh-my-pi/pi-coding-agent","omp"])}</p><a href="https://github.com/can1357/oh-my-pi" target="_blank" rel="noopener noreferrer">${escape(tr('modules.providers.installOmp'))} ${icon('forward')}</a>${pathForm('omp', tr('modules.providers.executable', { name: 'omp' }), '/path/to/omp')}${envDetails('omp')}</section>
    <section class="connection-card"><h3>${providerLogo('deepseek')}DeepSeek<small>${escape(tr('modules.providers.deepseekAcp'))}</small></h3><p>${instruction('modules.providers.deepseek', ["npm i -g @deepseek-ai/dsh"])}</p>
      ${keyForm('deepseek', tr('modules.providers.apiKey', { name: 'DeepSeek' }))}
      <a href="https://platform.deepseek.com/api_keys" target="_blank" rel="noopener noreferrer">${escape(tr('modules.providers.getKey'))} ${icon('forward')}</a>${pathForm('deepseek', tr('modules.providers.executable', { name: 'DeepSeek' }), '/path/to/dsh')}${envDetails('deepseek')}</section>
    <section class="connection-card"><h3>${providerLogo('commandcode')}Command Code<small>${escape(tr('modules.providers.viaAcp'))}</small></h3><p>${instruction('modules.providers.commandcode', ["npm i -g command-code","command-code login"])}</p>
      ${keyForm('commandcode', tr('modules.providers.apiKey', { name: 'Command Code' }))}
      <a href="https://commandcode.ai/docs/acp" target="_blank" rel="noopener noreferrer">${escape(tr('modules.providers.commandcodeDocs'))} ${icon('forward')}</a>${pathForm('commandcode', tr('modules.providers.executable', { name: 'Command Code' }), '/path/to/command-code')}${envDetails('commandcode')}</section>
    <section class="connection-card"><h3>${providerLogo('cline')}Cline<small>${escape(tr('modules.providers.viaAcp'))}</small></h3><p>${instruction('modules.providers.cline', ["npm i -g cline","cline auth","CLINE_API_KEY","cline --acp"])}</p><div class="connection-model-actions"><a href="https://docs.cline.bot/usage/cli-overview" target="_blank" rel="noopener noreferrer">${escape(tr('modules.providers.clineDocs'))} ${icon('forward')}</a><a href="https://docs.cline.bot/usage/acp" target="_blank" rel="noopener noreferrer">${escape(tr('modules.providers.acpDetails'))} ${icon('forward')}</a><a href="https://docs.cline.bot/usage/tui" target="_blank" rel="noopener noreferrer">${escape(tr('modules.providers.tuiDocs'))} ${icon('forward')}</a></div>${pathForm('cline', tr('modules.providers.executable', { name: 'Cline' }), '/path/to/cline')}${envDetails('cline')}</section>
    <section class="connection-card"><h3>${providerLogo('github-copilot')}GitHub Copilot CLI<small>${escape(tr('modules.providers.copilotAcp'))}</small></h3><p>${instruction('modules.providers.copilot', ["npm install -g @github/copilot","copilot login"])}</p><div class="connection-model-actions"><a href="https://docs.github.com/en/copilot/how-tos/set-up/install-copilot-cli" target="_blank" rel="noopener noreferrer">${escape(tr('modules.providers.installAndSignIn'))} ${icon('forward')}</a><a href="https://docs.github.com/en/copilot/reference/copilot-cli-reference/acp-server" target="_blank" rel="noopener noreferrer">${escape(tr('modules.providers.acpSupport'))} ${icon('forward')}</a></div>${pathForm('github-copilot', tr('modules.providers.executable', { name: 'GitHub Copilot CLI' }), '/path/to/copilot')}${envDetails('github-copilot')}</section>
    <section class="connection-card"><h3>${providerLogo('devin')}Devin CLI<small>${escape(tr('modules.providers.cognitionAcp'))}</small></h3><p>${instruction('modules.providers.devin', ["curl -fsSL https://cli.devin.ai/install.sh | bash","brew install --cask devin-cli","devin auth login","devin acp"])}</p><div class="connection-model-actions"><a href="https://docs.devin.ai/cli" target="_blank" rel="noopener noreferrer">${escape(tr('modules.providers.installAndSignIn'))} ${icon('forward')}</a><a href="https://docs.devin.ai/cli/reference/commands" target="_blank" rel="noopener noreferrer">${escape(tr('modules.providers.acpDetails'))} ${icon('forward')}</a></div>${pathForm('devin', tr('modules.providers.executable', { name: 'Devin' }), '/path/to/devin')}${envDetails('devin')}</section>
    <section class="connection-card"><h3>${providerLogo('kilo')}Kilo Code<small>${escape(tr('modules.providers.viaAcp'))}</small></h3><p>${instruction('modules.providers.kilo', ["npm i -g @kilocode/cli","kilo auth login","kilo acp"])}</p><a href="https://kilo.ai/docs/code-with-ai/platforms/cli" target="_blank" rel="noopener noreferrer">${escape(tr('modules.providers.kiloDocs'))} ${icon('forward')}</a>${pathForm('kilo', tr('modules.providers.executable', { name: 'Kilo' }), '/path/to/kilo')}${envDetails('kilo')}</section>
    <section class="connection-card"><h3>${providerLogo('muse')}Muse Code<small>${escape(tr('modules.providers.metaMsp'))}</small></h3><p>${instruction('modules.providers.muse', ["muse login","muse serve"])}</p>${pathForm('muse', tr('modules.providers.executable', { name: 'Muse Code' }), '/path/to/muse')}${envDetails('muse')}</section>
    <section class="connection-card"><h3>${providerLogo('zcode')}ZCode<small>${escape(tr('modules.providers.appServer'))}</small></h3><p>${instruction('modules.providers.zcode', ["zcode"])}</p><a href="https://github.com/zai-org/ZCode" target="_blank" rel="noopener noreferrer">${escape(tr('modules.providers.zcodeDocs'))} ${icon('forward')}</a>${pathForm('zcode', tr('modules.providers.executable', { name: 'ZCode' }), '/path/to/zcode')}${envDetails('zcode')}</section>
    <section class="connection-card"><h3>${providerLogo('hermes')}Hermes Agent<small>${escape(tr('modules.providers.hermesAcp'))}</small></h3><p>${instruction('modules.providers.hermes', ["curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash","hermes acp --setup","~/.hermes/config.yaml","hermes acp"])}</p><div class="connection-model-actions"><a href="https://hermes-agent.org" target="_blank" rel="noopener noreferrer">${escape(tr('modules.providers.hermesDocs'))} ${icon('forward')}</a><a href="https://github.com/NousResearch/hermes-agent" target="_blank" rel="noopener noreferrer">${escape(tr('modules.providers.repository'))} ${icon('forward')}</a></div>${pathForm('hermes', tr('modules.providers.executable', { name: 'Hermes Agent' }), '/path/to/hermes')}${envDetails('hermes')}</section>
    <p class="connection-feedback" role="status" hidden></p>${preview ? `<p class="settings-preview-note">${escapeI18n(tr('modules.common.browser_preview_keys_are_never_saved_here'))}</p>` : ''}`;
  host.innerHTML = markup();
  const feedback = host.querySelector<HTMLElement>('.connection-feedback')!;
  const keyInput = (provider: KeyedProvider) => host.querySelector<HTMLInputElement>(`#${provider}-key`)!;
  const keyInputs = (Object.keys(keyed) as KeyedProvider[]).map(keyInput);
  const endpoint = host.querySelector<HTMLSelectElement>('#mimo-endpoint')!;
  const endpointHint = host.querySelector<HTMLElement>('#mimo-endpoint-hint')!;
  const claudeMode = host.querySelector<HTMLSelectElement>('#claude-connection-mode')!;
  const claudeSource = host.querySelector<HTMLElement>('.claude-auth-source')!;
  const claudeCheck = host.querySelector<HTMLButtonElement>('[data-check-claude]')!;
  let claudeEdited = false, claudeRevision = 0;
  async function checkClaude(): Promise<void> {
    const ticket = ++claudeRevision;
    claudeSource.textContent = tr('modules.common.checking_claude_login'); claudeCheck.disabled = true;
    for (const node of host.querySelectorAll<HTMLElement>('.claude-auth-endpoint,.claude-auth-conflict,.claude-auth-login')) node.hidden = true;
    host.querySelector('.claude-auth-details')!.replaceChildren();
    try {
      const status = await call<ClaudeStatus>('provider_claude_status');
      if (disposed || ticket !== claudeRevision) return;
      if (!claudeEdited) claudeMode.value = status.mode;
      claudeSource.textContent = status.source;
      const endpoint = host.querySelector<HTMLElement>('.claude-auth-endpoint')!;
      endpoint.textContent = status.endpoint ? tr('modules.providers.endpoint', { endpoint: status.endpoint }) : ''; endpoint.hidden = !status.endpoint;
      host.querySelector<HTMLElement>('.claude-auth-conflict')!.hidden = !status.conflict;
      const details = status.environmentVariables.length ? status.mode === 'subscription' ? tr('modules.providers.ignoredCredentials', { names: status.environmentVariables.join(', ') }) : tr('modules.providers.detectedCredentials', { names: status.environmentVariables.join(', ') }) : tr('modules.providers.noCredentials');
      host.querySelector<HTMLElement>('.claude-auth-details')!.innerHTML = `${infoMark(details, tr('modules.common.claude_environment_details'))}<span class="sr-only">${escape(details)}</span>`;
      const login = host.querySelector<HTMLElement>('.claude-auth-login')!;
      login.textContent = status.savedLogin === 'notSignedIn' ? tr('modules.common.saved_login_not_found_run_claude_auth_login_then_check_again') : status.savedLogin === 'unknown' ? tr('modules.common.saved_login_could_not_be_verified_run_claude_auth_status_to_check') : status.savedLogin === 'otherCredentials' ? tr('modules.common.saved_credentials_use_an_api_key_sign_in_to_claude_code_with') : '';
      login.hidden = !login.textContent;
    } catch { if (!disposed && ticket === claudeRevision) claudeSource.textContent = tr('modules.common.claude_login_could_not_be_checked_try_check_login_again'); }
    finally { if (!disposed && ticket === claudeRevision) claudeCheck.disabled = pending; }
  }
  let endpointEdited = false;
  function message(text: string, error = false): void { feedback.textContent = text; feedback.hidden = false; feedback.classList.toggle('error', error); }
  function keysDisabled(config: Configuration): boolean { return !config.secureStorageAvailable || preview; }
  function render(config: Configuration): void {
    if (!claudeEdited) claudeMode.value = config.claudeConnectionMode ?? 'inherit';
    for (const input of host.querySelectorAll<HTMLInputElement>('[data-executable]')) {
      if (!editedPaths.has(input)) input.value = config.executablePaths[input.dataset.executable!] ?? '';
    }
    const envNames = (key: string) => key === '*' ? config.globalEnvironment ?? [] : config.environment?.[key] ?? [];
    for (const list of host.querySelectorAll<HTMLElement>('[data-env-list]')) {
      const key = list.dataset.envList!;
      list.replaceChildren(...envNames(key).map(name => {
        const row = document.createElement('span');
        row.className = 'connection-env-var';
        row.innerHTML = `<code>${escape(name)}</code><button type="button" class="secondary-button" data-remove-env="${key}" data-env-name="${escape(name)}" aria-label="${escape(tr('modules.providers.removeVariable', { name }))}">${escapeI18n(tr('modules.common.remove'))}</button>`;
        return row;
      }));
    }
    for (const toggle of host.querySelectorAll<HTMLInputElement>('[data-use-global]')) {
      toggle.checked = config.useGlobalEnvironment?.[toggle.dataset.useGlobal!] ?? true;
    }
    for (const provider of Object.keys(keyed) as KeyedProvider[]) {
      const spec = keyed[provider];
      const status = host.querySelector(`#${provider}-key-status`)!;
      status.textContent = config[spec.savedFlag] ? tr('modules.common.key_saved_in_secure_system_storage') : config[spec.envFlag] ? tr('modules.providers.usingEnvironment', { name: spec.env }) : tr('modules.common.no_api_key_configured');
      host.querySelector<HTMLButtonElement>(`#remove-${provider}-key`)!.hidden = !config[spec.savedFlag];
      keyInput(provider).disabled = keysDisabled(config);
      host.querySelector<HTMLButtonElement>(`#${provider}-key-form button`)!.disabled = keysDisabled(config);
      if (!config.secureStorageAvailable) status.textContent += tr('modules.providers.setEnvironment', { name: spec.env });
      else if (config.credentialStorageError) status.textContent += tr('modules.providers.storageError', { error: config.credentialStorageError, name: spec.env });
    }
    // The native side is the authority on which MiMo clusters exist.
    if (!endpointEdited) {
      endpoint.replaceChildren(new Option(tr('modules.common.choose_your_cluster'), ''), ...config.mimoEndpoints.map(entry => new Option(entry.label, entry.id)));
      endpoint.value = config.mimoEndpoint ?? '';
    }
    const chosen = config.mimoEndpoints.find(entry => entry.id === config.mimoEndpoint);
    endpointHint.textContent = chosen ? chosen.url : tr('modules.common.required_before_mimo_tasks_can_start_the_token_plan_page_shows_your');
    endpointHint.classList.toggle('error', !chosen);
  }
  async function perform(operation: () => Promise<Configuration>, success: string, submittedInput?: HTMLInputElement, onFailure?: () => void): Promise<boolean> {
    if (pending || disposed) return false;
    const submittedValue = submittedInput?.value;
    pending = true; host.setAttribute('aria-busy', 'true');
    claudeMode.disabled = true;
    host.querySelectorAll<HTMLButtonElement>('button').forEach(button => button.disabled = true);
    host.querySelectorAll<HTMLInputElement>('[data-use-global]').forEach(toggle => toggle.disabled = true);
    try {
      const configuration = await operation();
      if (disposed) return false;
      configurationRevision++;
      if (submittedInput && submittedInput.value === submittedValue) {
        editedPaths.delete(submittedInput);
        if (keyInputs.includes(submittedInput)) submittedInput.value = '';
      }
      render(configuration); message(success);
      await saved();
      return true;
    } catch (error) { if (!disposed) { message(String(error), true); onFailure?.(); } return false; }
    finally {
      pending = false;
      if (!disposed) { claudeMode.disabled = false; host.removeAttribute('aria-busy'); host.querySelectorAll<HTMLButtonElement>('button').forEach(button => button.disabled = false); host.querySelectorAll<HTMLInputElement>('[data-use-global]').forEach(toggle => toggle.disabled = false); for (const input of keyInputs) host.querySelector<HTMLButtonElement>(`#${input.id}-form button`)!.disabled = input.disabled; }
    }
  }
  const submit = (event: Event) => {
    const form = (event.target as HTMLElement).closest<HTMLFormElement>('form'); if (!form || !host.contains(form)) return;
    event.preventDefault(); event.stopPropagation();
    const envKey = form.dataset.envProvider;
    if (envKey !== undefined) {
      const name = form.querySelector<HTMLInputElement>('.connection-env-name')!;
      const value = form.querySelector<HTMLInputElement>('.connection-env-value')!;
      const variable = name.value.trim();
      if (!variable) { name.focus(); return; }
      const saved = () => { name.value = ''; value.value = ''; name.focus(); };
      const operation = envKey === '*'
        ? () => call<Configuration>('provider_set_global_environment_variable', { name: variable, value: value.value })
        : () => call<Configuration>('provider_set_environment_variable', { provider: envKey, name: variable, value: value.value });
      // The entered variable survives a refused save (validation, storage budget).
      void perform(operation, envKey === '*' ? tr('modules.providers.globalSaved') : tr('modules.providers.environmentSaved')).then(ok => { if (ok) saved(); });
      return;
    }
    const keyedProvider = form.dataset.keyProvider as KeyedProvider | undefined;
    if (keyedProvider) {
      const key = keyInput(keyedProvider);
      if (preview) { key.value = ''; message(tr('modules.providers.desktopKeys')); return; }
      const secret = key.value.trim(); if (!secret) { key.focus(); return; }
      void perform(() => call(keyed[keyedProvider].save, { key: secret }), keyed[keyedProvider].saved, key);
    } else {
      const provider = form.dataset.provider!;
      const input = form.querySelector<HTMLInputElement>('input')!;
      const path = input.value.trim();
      void perform(() => call('provider_set_executable', { provider, path }), path ? tr('modules.providers.executableSaved') : tr('modules.providers.discoveryRestored'), input);
    }
  };
  const click = async (event: MouseEvent) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('button'); if (!target) return;
    if (target.hasAttribute('data-check-claude')) { void checkClaude(); return; }
    const removingEnv = target.dataset.removeEnv;
    // Only the provider env lists use valued data-remove-env buttons; the named
    // connection editor's row Remove carries no value and must not match.
    if (removingEnv !== undefined && target.dataset.envName && target.closest('[data-env-list]')) {
      const name = target.dataset.envName!;
      const operation = removingEnv === '*'
        ? () => call<Configuration>('provider_remove_global_environment_variable', { name })
        : () => call<Configuration>('provider_remove_environment_variable', { provider: removingEnv, name });
      void perform(operation, tr('modules.providers.environmentRemoved'));
      return;
    }
    const removing = target.dataset.removeKey as KeyedProvider | undefined;
    if (removing) { void perform(() => call(keyed[removing].remove), tr('modules.providers.keyRemoved')); return; }
    if (target.dataset.chooseExecutable) {
      event.preventDefault();
      if (preview) { message(tr('modules.providers.desktopExecutable')); return; }
      try {
        const path = await (await import('@tauri-apps/plugin-dialog')).open({ directory: false, multiple: false, title: tr('modules.common.choose_agent_executable') });
        if (!disposed && typeof path === 'string') {
          const input = host.querySelector<HTMLInputElement>(`[data-executable="${target.dataset.chooseExecutable}"]`)!;
          input.value = path; editedPaths.add(input);
        }
      } catch (error) { if (!disposed) message(String(error), true); }
    }
  };
  const input = (event: Event) => {
    const target = event.target;
    if (target instanceof HTMLInputElement && target.dataset.executable) editedPaths.add(target);
  };
  const change = (event: Event) => {
    const target = event.target as HTMLElement;
    if (target instanceof HTMLInputElement && target.matches('[data-use-global]')) {
      if (pending) { target.checked = !target.checked; return; }
      const provider = target.dataset.useGlobal!;
      const useGlobal = target.checked;
      void perform(
        () => call<Configuration>('provider_set_use_global_environment', { provider, useGlobal }),
        useGlobal ? tr('modules.providers.globalEnabled') : tr('modules.providers.globalDisabled'),
        undefined,
        // perform only reports the failure; the checkbox returns to the saved state.
        () => { target.checked = !useGlobal; },
      );
      return;
    }
    if (event.target === claudeMode) {
      if (pending) return;
      claudeEdited = true; claudeRevision++;
      void perform(() => call('provider_set_claude_connection_mode', { mode: claudeMode.value }), tr('modules.providers.claudeSaved')).finally(() => {
        claudeEdited = false;
        if (!disposed) void checkClaude();
      });
      return;
    }
    if (event.target !== endpoint || !endpoint.value) return;
    if (preview) { message(tr('modules.providers.desktopEndpoint')); return; }
    endpointEdited = true;
    const chosen = endpoint.value;
    void perform(() => call('provider_set_mimo_endpoint', { endpoint: chosen }), tr('modules.providers.endpointSaved')).finally(() => { endpointEdited = false; });
  };
  // The source template is evaluated again, but only static copy is morphed.
  // Never remount forms or the named-connections child; unsaved secrets stay in their inputs.
  const disposeLocale = onLocaleChange(() => {
    const next = document.createElement('div'); next.innerHTML = markup();
    const intro = host.querySelector(':scope > .dialog-description');
    if (intro) morph(intro, next.querySelector(':scope > .dialog-description')!.innerHTML, 20);
    const currentCards = [...host.querySelectorAll(':scope > .connection-card')];
    const nextCards = [...next.querySelectorAll(':scope > .connection-card')];
    const selector = ':scope > h3, :scope > p:not([class]):not([id]), :scope > a, .connection-model-actions a, form > label, form button:not([data-choose-executable]), .connection-path > summary, .connection-env > summary, .connection-env > small, .connection-auth-label, .connection-path form > small, [data-remove-key], [data-check-claude]';
    currentCards.forEach((card, index) => {
      const copy = nextCards[index]; if (!copy) return;
      const fresh = [...copy.querySelectorAll(selector)];
      card.querySelectorAll(selector).forEach((element, n) => { if (fresh[n]) morph(element, fresh[n].innerHTML, 20); });
      const freshInputs = [...copy.querySelectorAll('input')];
      card.querySelectorAll('input').forEach((input, n) => { const replacement = freshInputs[n]; if (!replacement) return; for (const attr of ['placeholder', 'aria-label']) if (replacement.hasAttribute(attr)) input.setAttribute(attr, replacement.getAttribute(attr)!); });
      card.querySelectorAll('[data-choose-executable]').forEach(button => { const copyButton = copy.querySelector('[data-choose-executable="' + button.getAttribute('data-choose-executable') + '"]'); if (copyButton) button.setAttribute('aria-label', copyButton.getAttribute('aria-label')!); });
    });
    for (const option of [...claudeMode.options]) option.textContent = option.value === 'inherit' ? tr('modules.common.use_current_environment') : tr('modules.common.prefer_saved_claude_login');
    const emptyEndpoint = endpoint.querySelector('option[value=""]'); if (emptyEndpoint) emptyEndpoint.textContent = tr('modules.common.choose_your_cluster');
  });
  host.addEventListener('submit', submit); host.addEventListener('click', click); host.addEventListener('input', input); host.addEventListener('change', change);
  void call<Configuration>('provider_configuration').then(config => { if (!disposed && configurationRevision === 0) render(config); }).catch(error => { if (!disposed && configurationRevision === 0) message(String(error), true); });
  void checkClaude();
  if (named) void import('./connections').then(({ mountConnections }) => { if (!disposed) unmountNamed = mountConnections(host.querySelector<HTMLElement>('#named-connections')!, named.harnesses, named.saved); });
  return () => { disposed = true; disposeLocale(); unmountNamed?.(); for (const input of keyInputs) input.value = ''; editedPaths.clear(); host.removeEventListener('submit', submit); host.removeEventListener('click', click); host.removeEventListener('input', input); host.removeEventListener('change', change); };
}

function pathForm(provider: string, label: string, placeholder: string): string {
  return `<details class="connection-path"><summary>${escape(tr('modules.providers.executableLocation'))} ${icon('down')}</summary><form data-provider="${provider}"><label for="executable-${provider}">${escape(label)}</label><div class="connection-input-row"><input id="executable-${provider}" data-executable="${provider}" placeholder="${escape(placeholder)}" autocomplete="off" spellcheck="false"><button type="button" class="secondary-button" data-choose-executable="${provider}" aria-label="${escape(tr('modules.providers.choose', { label }))}">${icon('folder')}</button><button class="secondary-button" type="submit">${escapeI18n(tr('modules.common.apply'))}</button></div><small>${escapeI18n(tr('modules.common.leave_empty_to_find_it_automatically'))}</small></form></details>`;
}
