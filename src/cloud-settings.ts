import { escape as escapeI18n } from './dom.ts';
import { t as tr, onLocaleChange } from './i18n.ts';
/* Settings → Agents → Cloud sandboxes: connect Daytona, Cloudflare, AWS and the keyed sandbox
 * providers so agents can create and use cloud machines (and run on them as cloud agents), and
 * Vercel, Railway, Netlify and Google Cloud for deploys. Keys go straight to the OS keychain natively;
 * this view never reads them back. */
import './cloud-settings.css';
import { escape, morph } from './dom';
import { infoMark } from './tooltip';

export type CloudConnection = { provider: 'daytona' | 'cloudflare' | 'aws' | 'vercel' | 'railway' | 'netlify' | 'gcloud' | 'docker' | KeyedProvider; connected: boolean; detail: string | null; sandboxes?: boolean; inheritEnvironment?: boolean };
export type CloudSettingsHost = {
  call<T>(command: string, args?: Record<string, unknown>): Promise<T>;
  listen(name: 'cloud-setup', callback: (event: { provider: string; label: string }) => void): Promise<() => void>;
};

/** `sparse` options are sent only when filled (the cloud agent fields added to deploy providers). */
type Field = { name: string; label: string; placeholder: string; secret?: boolean; optional?: boolean; sparse?: boolean };
/* Sandbox providers that connect with one API key (docs/cloud-agents.md → Provider settings). */
const KEYED = {
  get digitalocean() { return { name: 'DigitalOcean', get key() { return tr('modules.common.api_token'); }, docs: 'cloud.digitalocean.com/account/api/tokens', fields: [{ name: 'region', label: tr('modules.common.region'), placeholder: tr('modules.common.optional_e_g_nyc1'), optional: true }] }; },
  get vultr() { return { name: 'Vultr', get key() { return tr('modules.common.api_key'); }, docs: 'my.vultr.com/settings → API', fields: [{ name: 'region', label: tr('modules.common.region'), placeholder: tr('modules.common.optional_e_g_ewr'), optional: true }] }; },
  get hetzner() { return { name: 'Hetzner', get key() { return tr('modules.common.api_token'); }, docs: 'console.hetzner.cloud → Security → API tokens', fields: [{ name: 'location', label: tr('modules.common.location'), placeholder: tr('modules.common.optional_e_g_fsn1'), optional: true }] }; },
  get runpod() { return { name: 'RunPod', get key() { return tr('modules.common.api_key'); }, docs: 'runpod.io → Settings → API Keys', fields: [{ name: 'gpu', label: tr('modules.common.gpu_type'), placeholder: tr('modules.common.optional_e_g_nvidia_rtx_3090'), optional: true }, { name: 'image', label: tr('modules.common.image'), placeholder: tr('modules.common.optional_an_image_with_ssh_built_in'), optional: true }] }; },
  e2b: { name: 'E2B', get key() { return tr('modules.common.api_key'); }, docs: 'e2b.dev/dashboard → API keys', fields: [] },
  get modal() { return { name: 'Modal', get key() { return tr('modules.cloud.tokenSecret'); }, docs: 'modal.com/settings/tokens', fields: [{ name: 'tokenId', label: tr('modules.common.token_id'), placeholder: 'ak-…' }, { name: 'environment', label: tr('modules.common.environment'), placeholder: tr('modules.common.optional'), optional: true }] }; },
  codesandbox: { name: 'CodeSandbox', get key() { return tr('modules.common.api_key'); }, docs: 'codesandbox.io/t/api', fields: [] },
  runloop: { name: 'Runloop', get key() { return tr('modules.common.api_key'); }, docs: 'platform.runloop.ai → Settings', fields: [] },
  get blaxel() { return { name: 'Blaxel', get key() { return tr('modules.common.api_key'); }, docs: 'app.blaxel.ai → Workspace settings → API keys', fields: [{ name: 'workspace', label: tr('modules.common.workspace'), placeholder: tr('modules.common.workspace_name') }] }; },
  tensorlake: { name: 'Tensorlake', get key() { return tr('modules.common.api_key'); }, docs: 'cloud.tensorlake.ai → API keys', fields: [] },
  freestyle: { name: 'Freestyle', get key() { return tr('modules.common.api_key'); }, docs: 'admin.freestyle.sh → API keys', fields: [] },
  get boat() { return { name: 'boat', get key() { return tr('modules.common.api_key'); }, docs: 'your boat dashboard', fields: [{ name: 'apiUrl', label: tr('modules.common.api_url'), placeholder: tr('modules.common.optional'), optional: true }] }; },
  instabox: { name: 'InstaBox', get key() { return tr('modules.common.api_key'); }, docs: 'instabox.sh → API keys', fields: [] },
} satisfies Record<string, { name: string; key: string; docs: string; fields: Field[] }>;
type KeyedProvider = keyof typeof KEYED;
const providers = (): Record<CloudConnection['provider'], { name: string; summary: string; key?: Field; fields: Field[]; note: string; connect: string }> => ({
  get daytona() { return {
    name: 'Daytona', summary: tr('modules.cloud.linux'),
    key: { name: 'key', label: tr('modules.common.api_key'), placeholder: 'dtn_…', secret: true },
    fields: [{ name: 'organization', label: tr('modules.common.organization_id'), placeholder: tr('modules.common.optional'), optional: true }, { name: 'apiUrl', label: tr('modules.common.api_url'), placeholder: 'https://app.daytona.io/api', optional: true }],
    note: tr('modules.cloud.daytonaNote'), connect: tr('modules.common.connect'),
  }; },
  get cloudflare() { return {
    name: 'Cloudflare', summary: tr('modules.cloud.cloudflare'),
    key: { name: 'key', label: tr('modules.common.api_token'), placeholder: 'Workers Scripts, Pages and Containers: Edit', secret: true },
    fields: [{ name: 'account', label: tr('modules.common.account_id'), placeholder: tr('modules.common.32_hexadecimal_characters') }],
    note: tr('modules.cloud.cloudflareNote'), connect: tr('modules.common.connect'),
  }; },
  get aws() { return {
    name: 'AWS', summary: tr('modules.cloud.aws'),
    fields: [{ name: 'region', label: tr('modules.common.region'), placeholder: 'us-east-1' }, { name: 'profile', label: tr('modules.common.cli_profile'), placeholder: tr('modules.common.optional'), optional: true }],
    note: tr('modules.cloud.awsNote'), connect: tr('modules.common.connect'),
  }; },
  get vercel() { return {
    name: 'Vercel', summary: tr('modules.cloud.vercel'),
    key: { name: 'key', label: tr('modules.common.access_token'), placeholder: 'vercel.com/account/tokens', secret: true },
    fields: [{ name: 'team', label: tr('modules.common.team_slug'), placeholder: tr('modules.common.optional'), optional: true }, { name: 'projectId', label: tr('modules.common.sandbox_project_id'), placeholder: tr('modules.common.optional_for_cloud_agents'), optional: true, sparse: true }, { name: 'teamId', label: tr('modules.common.sandbox_team_id'), placeholder: tr('modules.common.optional_for_cloud_agents'), optional: true, sparse: true }],
    note: tr('modules.cloud.vercelNote'), connect: tr('modules.common.connect'),
  }; },
  get railway() { return {
    name: 'Railway', summary: tr('modules.cloud.railway'),
    key: { name: 'key', label: tr('modules.common.api_token'), placeholder: 'railway.com/account/tokens', secret: true },
    fields: [{ name: 'workspace', label: tr('modules.common.workspace_id'), placeholder: tr('modules.common.optional_needed_for_a_workspace_token'), optional: true }],
    note: tr('modules.cloud.railwayNote'), connect: tr('modules.common.connect'),
  }; },
  get netlify() { return {
    name: 'Netlify', summary: tr('modules.cloud.netlify'),
    key: { name: 'key', label: tr('modules.common.personal_access_token'), placeholder: tr('modules.common.netlify_user_settings_applications'), secret: true },
    fields: [{ name: 'siteId', label: tr('modules.common.project_id'), placeholder: tr('modules.common.optional_from_project_configuration'), optional: true }],
    note: tr('modules.cloud.netlifyNote'), connect: tr('modules.common.connect'),
  }; },
  get gcloud() { return {
    name: 'Google Cloud', summary: tr('modules.cloud.gcloud'),
    fields: [{ name: 'project', label: tr('modules.common.project_id'), placeholder: 'my-app-123456' }, { name: 'region', label: tr('modules.common.region'), placeholder: tr('modules.common.optional_such_as_us_central1'), optional: true }, { name: 'zone', label: tr('modules.common.zone'), placeholder: tr('modules.common.optional_for_cloud_agent_vms_such_as_us_central1_a'), optional: true, sparse: true }],
    note: tr('modules.cloud.gcloudNote'), connect: tr('modules.common.connect'),
  }; },
  get docker() { return {
    name: 'Docker', summary: tr('modules.cloud.docker'),
    fields: [{ name: 'engine', label: tr('modules.common.engine'), placeholder: tr('modules.common.optional_docker_default_podman_apple_or_lxc'), optional: true }, { name: 'endpoint', label: tr('modules.common.docker_host'), placeholder: tr('modules.common.optional_empty_for_this_machine_ssh_user_host_or_tcp_host_2376'), optional: true }, { name: 'image', label: tr('modules.common.image'), placeholder: tr('modules.common.optional_e_g_ubuntu_24_04'), optional: true }, { name: 'tlsCa', label: tr('modules.common.tls_ca_path'), placeholder: tr('modules.common.optional_for_tcp_docker_hosts'), optional: true, sparse: true }, { name: 'tlsCert', label: tr('modules.common.tls_cert_path'), placeholder: tr('modules.common.optional_for_tcp_docker_hosts'), optional: true, sparse: true }, { name: 'tlsKey', label: tr('modules.common.tls_key_path'), placeholder: tr('modules.common.optional_for_tcp_docker_hosts'), optional: true, sparse: true }],
    note: tr('modules.cloud.dockerNote'), connect: tr('modules.common.connect'),
  }; },
  ...Object.fromEntries(Object.entries(KEYED).map(([id, provider]) => [id, {
    name: provider.name, summary: tr('modules.cloud.machines'),
    key: { name: 'key', label: provider.key, placeholder: provider.docs, secret: true }, fields: provider.fields,
    note: tr('modules.cloud.keyAt', { location: provider.docs }), connect: tr('modules.common.connect'),
  }])) as Record<KeyedProvider, { name: string; summary: string; key?: Field; fields: Field[]; note: string; connect: string }>,
});
/** `cloud_instabox_images`: what new InstaBox machines can start from, and the saved choice. */
type InstaboxImages = { images: { value: string; label: string }[]; selected: string };
const IMAGE_HELP = () => tr('modules.cloud.imageHelp');
const CLAUDE_TOKEN_HELP = () => tr('modules.cloud.claudeHelp');
const INHERIT_HELP = () => tr('modules.cloud.inheritHelp');

export function mountCloudSettings(host: HTMLElement, options: CloudSettingsHost): () => void {
  const markup = () => `<div class="settings-group cloud-settings" aria-label="${escapeI18n(tr('modules.common.cloud_sandboxes'))}"><div class="cloud-provider cloud-claude">
      <div class="setting-row"><div><strong>${escapeI18n(tr('modules.common.claude_login_for_cloud_agents'))}</strong>${infoMark(CLAUDE_TOKEN_HELP(), tr('modules.common.about_the_claude_login'))}<small class="cloud-detail">${escapeI18n(tr('modules.common.optional_long_lived_token'))}</small></div></div>
      <form class="cloud-form cloud-claude-form" novalidate aria-label="${escapeI18n(tr('modules.common.claude_login_for_cloud_agents'))}">
        <label><span>${escapeI18n(tr('modules.common.token'))}</span><input name="token" type="password" autocomplete="off" spellcheck="false" placeholder="${escapeI18n(tr('modules.common.from_claude_setup_token'))}" aria-label="${escapeI18n(tr('modules.common.claude_token_for_cloud_agents'))}" required></label>
        <p class="cloud-progress" role="status" hidden></p>
        <p class="cloud-error" role="alert" hidden></p>
        <div class="cloud-actions"><button type="submit" class="primary-button">${escapeI18n(tr('modules.common.save_token'))}</button></div>
      </form>
    </div>${(Object.keys(providers()) as CloudConnection['provider'][]).map(id => {
    const provider = providers()[id];
    const fields = [...(provider.key ? [provider.key] : []), ...provider.fields];
    return `<div class="cloud-provider" data-provider="${id}">
      <div class="setting-row"><div><strong>${escape(provider.name)}</strong><small class="cloud-detail">${escape(provider.summary)}</small></div><div class="cloud-buttons">${id === 'cloudflare' ? `<button type="button" class="secondary-button" data-cloud="sandboxes" hidden>${escapeI18n(tr('modules.common.set_up_sandboxes'))}</button>` : ''}<button type="button" class="secondary-button" data-cloud="toggle">${escapeI18n(tr('modules.common.connect'))}</button></div></div>
      <p class="cloud-progress cloud-row-status" role="status" hidden></p>
      <label class="cloud-inherit" data-inherit-row hidden><input type="checkbox" data-cloud-inherit> <span>${escape(tr('modules.cloud.includeEnvironment'))}</span>${infoMark(INHERIT_HELP(), tr('modules.common.about_inheriting_environment_variables'))}</label>${id === 'instabox' ? `
      <div class="cloud-image" hidden>
        <div class="cloud-image-row"><label><span>${escapeI18n(tr('modules.common.machine_image'))}</span><select aria-label="${escapeI18n(tr('modules.common.instabox_machine_image'))}" disabled></select></label>${infoMark(IMAGE_HELP(), tr('modules.common.about_machine_images'))}</div>
        <p class="cloud-image-status" role="status" hidden></p>
        <p class="cloud-image-error" role="alert" hidden></p>
        <div class="cloud-actions" hidden><button type="button" class="secondary-button" data-cloud="images">${escapeI18n(tr('modules.common.try_again'))}</button></div>
      </div>` : ''}
      <form class="cloud-form" hidden novalidate aria-label="${escape(tr('modules.cloud.connectProvider', { name: provider.name }))}">
        ${fields.map(field => `<label><span>${escape(field.label)}</span><input name="${field.name}" type="${field.secret ? 'password' : 'text'}" autocomplete="off" spellcheck="false" placeholder="${escape(field.placeholder)}" aria-label="${escape(`${provider.name} ${field.label}`)}" ${field.optional ? '' : 'required'}></label>`).join('')}
        <p class="cloud-note">${escape(provider.note)}</p>
        <p class="cloud-progress" role="status" hidden></p>
        <p class="cloud-error" role="alert" hidden></p>
        <div class="cloud-actions"><button type="button" class="secondary-button" data-cloud="cancel">${escapeI18n(tr('modules.common.cancel'))}</button><button type="submit" class="primary-button">${escape(provider.connect)}</button></div>
      </form>
    </div>`;
  }).join('')}</div>`;
  host.innerHTML = markup();
  let connections: CloudConnection[] = [], disposed = false, busy = '';
  let stopListening: (() => void) | undefined;
  const section = (id: string) => host.querySelector<HTMLElement>(`.cloud-provider[data-provider="${id}"]`)!;

  function render(): void {
    for (const id of Object.keys(providers()) as CloudConnection['provider'][]) {
      const connection = connections.find(c => c.provider === id), root = section(id);
      const toggle = root.querySelector<HTMLButtonElement>('[data-cloud="toggle"]')!;
      const form = root.querySelector<HTMLFormElement>('form')!;
      const sandboxes = id === 'cloudflare' && connection?.connected ? (connection.sandboxes ? tr('modules.cloud.sandboxesReady') : tr('modules.cloud.sandboxesMissing')) : '';
      root.querySelector('.cloud-detail')!.textContent = connection?.connected ? tr('modules.cloud.connected', { detail: connection.detail ? ` · ${connection.detail}` : '', sandboxes }) : providers()[id].summary;
      const setup = root.querySelector<HTMLButtonElement>('[data-cloud="sandboxes"]');
      if (setup) { setup.hidden = !connection?.connected || Boolean(connection.sandboxes); setup.disabled = Boolean(busy); }
      toggle.textContent = connection?.connected ? tr('modules.common.disconnect') : form.hidden ? tr('modules.common.connect') : tr('modules.common.close');
      toggle.disabled = Boolean(busy);
      toggle.setAttribute('aria-label', `${toggle.textContent} ${providers()[id].name}`);
      form.querySelector<HTMLButtonElement>('[type="submit"]')!.disabled = Boolean(busy);
      const inheritRow = root.querySelector<HTMLElement>('[data-inherit-row]')!;
      const supported = connection?.inheritEnvironment !== undefined;
      inheritRow.hidden = !supported || !connection?.connected;
      if (supported) {
        const box = inheritRow.querySelector<HTMLInputElement>('[data-cloud-inherit]')!;
        box.checked = Boolean(connection?.inheritEnvironment);
        box.disabled = Boolean(busy);
      }
    }
  }
  // Re-evaluate the source template, morphing only copy-bearing leaves. Forms, keys,
  // pending state and server output retain their existing nodes and values.
  const disposeLocale = onLocaleChange(() => {
    const next = document.createElement('div'); next.innerHTML = markup();
    const selector = 'strong, .cloud-note, .info-mark, label > span, button[type="submit"], button[data-cloud="cancel"], button[data-cloud="images"], button[data-cloud="sandboxes"]';
    const fresh = [...next.querySelectorAll(selector)];
    host.querySelectorAll(selector).forEach((element, index) => {
      const copy = fresh[index]; if (!copy) return;
      morph(element, copy.innerHTML, 20);
      for (const name of ['aria-label', 'data-tip']) if (copy.hasAttribute(name)) element.setAttribute(name, copy.getAttribute(name)!);
    });
    for (const provider of [...host.querySelectorAll<HTMLElement>('.cloud-provider')]) {
      const id = provider.dataset.provider;
      const copy = next.querySelector<HTMLElement>(id ? '[data-provider="' + id + '"]' : '.cloud-claude')!;
      provider.querySelectorAll<HTMLInputElement>('input[name]').forEach(input => {
        const replacement = copy.querySelector<HTMLInputElement>('input[name="' + input.name + '"]');
        if (!replacement) return;
        input.placeholder = replacement.placeholder;
        input.setAttribute('aria-label', replacement.getAttribute('aria-label') ?? '');
      });
      const form = provider.querySelector('form'), replacement = copy.querySelector('form');
      if (form && replacement) form.setAttribute('aria-label', replacement.getAttribute('aria-label') ?? '');
    }
    render(); renderImages();
  });
  async function load(): Promise<void> {
    try { connections = await options.call<CloudConnection[]>('cloud_connections'); } catch { connections = []; }
    if (!disposed) { render(); syncImages(); }
  }

  /* InstaBox's machine image select, filled from the API once InstaBox is connected. */
  let images: InstaboxImages | null = null, imagesError = '', imagesLoading = false, imageSaving = false;
  function renderImages(): void {
    const root = section('instabox'), box = root.querySelector<HTMLElement>('.cloud-image')!;
    const select = box.querySelector('select')!, status = box.querySelector<HTMLElement>('.cloud-image-status')!;
    const error = box.querySelector<HTMLElement>('.cloud-image-error')!, retry = box.querySelector<HTMLElement>('.cloud-actions')!;
    box.hidden = !connections.find(c => c.provider === 'instabox')?.connected;
    select.innerHTML = images ? images.images.map(image => `<option value="${escape(image.value)}">${escape(image.label)}</option>`).join('') : `<option>${imagesLoading ? tr('modules.cloud.loadingImages') : tr('modules.cloud.unavailable')}</option>`;
    if (images) select.value = images.selected;
    select.disabled = !images || imageSaving;
    error.textContent = imagesError; error.hidden = !imagesError;
    retry.hidden = Boolean(images) || imagesLoading || !imagesError;
    if (!images || imagesError) status.hidden = true;
  }
  async function loadImages(): Promise<void> {
    imagesLoading = true; imagesError = ''; renderImages();
    try { images = await options.call<InstaboxImages>('cloud_instabox_images'); }
    catch (error) { images = null; imagesError = tr('modules.cloud.imageError', { error: error instanceof Error ? error.message : String(error) }); }
    finally { imagesLoading = false; if (!disposed) renderImages(); }
  }
  function syncImages(): void {
    if (!connections.find(c => c.provider === 'instabox')?.connected) { images = null; imagesError = ''; renderImages(); return; }
    if (!images && !imagesLoading) void loadImages();
  }
  async function saveImage(select: HTMLSelectElement): Promise<void> {
    if (!images) return;
    const status = section('instabox').querySelector<HTMLElement>('.cloud-image-status')!, value = select.value;
    imageSaving = true; imagesError = ''; status.hidden = false; status.textContent = tr('modules.common.checking'); renderImages();
    select.value = value;
    try {
      images = await options.call<InstaboxImages>('cloud_instabox_set_image', { image: value });
      status.textContent = tr('modules.cloud.imageSaved', { image: images.images.find(image => image.value === images!.selected)?.label ?? images.selected });
    } catch (error) {
      status.hidden = true;
      imagesError = error instanceof Error ? error.message : String(error);
    } finally { imageSaving = false; if (!disposed) renderImages(); }
  }
  function say(root: HTMLElement, kind: 'progress' | 'error', text: string): void {
    const line = root.querySelector<HTMLElement>(`.cloud-${kind}`)!;
    line.textContent = text; line.hidden = !text;
  }
  async function connect(id: CloudConnection['provider'], form: HTMLFormElement): Promise<void> {
    const root = section(id), data = new FormData(form);
    const value = (name: string) => String(data.get(name) ?? '').trim();
    const missing = [...(providers()[id].key ? [providers()[id].key!] : []), ...providers()[id].fields].find(field => !field.optional && !value(field.name));
    if (missing) { say(root, 'error', tr('modules.cloud.required', { field: missing.label.toLowerCase() })); return; }
    busy = id; say(root, 'error', ''); say(root, 'progress', id === 'cloudflare' ? tr('modules.cloud.preparing') : tr('modules.common.checking')); render();
    try {
      const fields = Object.fromEntries(providers()[id].fields.filter(field => !field.sparse || value(field.name)).map(field => [field.name, value(field.name)]));
      connections = await options.call<CloudConnection[]>('cloud_connect', { provider: id, key: value('key'), options: fields });
      if (disposed) return;
      form.reset(); form.hidden = true;
      say(root, 'progress', '');
    } catch (error) {
      if (!disposed) { say(root, 'progress', ''); say(root, 'error', error instanceof Error ? error.message : String(error)); }
    } finally { busy = ''; if (!disposed) { render(); syncImages(); } }
  }
  async function setupSandboxes(root: HTMLElement): Promise<void> {
    const line = root.querySelector<HTMLElement>('.cloud-row-status')!;
    busy = 'cloudflare'; line.hidden = false; line.textContent = tr('modules.common.preparing_the_sandbox_worker'); render();
    try { connections = await options.call<CloudConnection[]>('cloud_setup_sandboxes'); line.textContent = tr('modules.common.sandboxes_are_ready'); }
    catch (error) { line.textContent = error instanceof Error ? error.message : String(error); line.classList.add('cloud-error'); }
    finally { busy = ''; if (!disposed) render(); }
  }
  async function saveClaudeToken(form: HTMLFormElement): Promise<void> {
    const root = form.closest<HTMLElement>('.cloud-provider')!, input = form.querySelector<HTMLInputElement>('input')!, token = input.value.trim();
    say(root, 'progress', ''); say(root, 'error', '');
    if (!token) { say(root, 'error', tr('modules.cloud.pasteToken')); return; }
    try { await options.call('cloud_agent_set_claude_token', { token }); if (!disposed) { form.reset(); say(root, 'progress', tr('modules.cloud.tokenSaved')); } }
    catch (error) { if (!disposed) say(root, 'error', error instanceof Error ? error.message : String(error)); }
  }
  async function disconnect(id: CloudConnection['provider']): Promise<void> {
    busy = id; render();
    try { connections = await options.call<CloudConnection[]>('cloud_disconnect', { provider: id }); }
    catch (error) { say(section(id), 'error', error instanceof Error ? error.message : String(error)); }
    finally { busy = ''; if (!disposed) { render(); syncImages(); } }
  }

  host.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('[data-cloud]') : null;
    if (!target || target.disabled) return;
    const root = target.closest<HTMLElement>('.cloud-provider[data-provider]')!, id = root.dataset.provider as CloudConnection['provider'];
    const form = root.querySelector<HTMLFormElement>('form')!;
    if (target.dataset.cloud === 'cancel') { form.hidden = true; say(root, 'error', ''); render(); return; }
    if (target.dataset.cloud === 'sandboxes') { void setupSandboxes(root); return; }
    if (target.dataset.cloud === 'images') { void loadImages(); return; }
    if (connections.find(c => c.provider === id)?.connected) { void disconnect(id); return; }
    form.hidden = !form.hidden;
    render();
    if (!form.hidden) form.querySelector<HTMLInputElement>('input')!.focus();
  });
  host.addEventListener('submit', event => {
    event.preventDefault();
    const form = event.target as HTMLFormElement;
    if (form.classList.contains('cloud-claude-form')) { void saveClaudeToken(form); return; }
    const id = form.closest<HTMLElement>('.cloud-provider')!.dataset.provider as CloudConnection['provider'];
    void connect(id, form);
  });
  host.addEventListener('change', event => {
    const target = event.target;
    if (target instanceof HTMLInputElement && target.matches('[data-cloud-inherit]')) {
      const root = target.closest<HTMLElement>('.cloud-provider[data-provider]')!;
      const id = root.dataset.provider as CloudConnection['provider'];
      if (busy) { target.checked = !target.checked; return; }
      const inherit = target.checked;
      // Optimistic: render() must not read the checkbox back to the old state mid-save.
      const previous = connections;
      connections = connections.map(connection => connection.provider === id ? { ...connection, inheritEnvironment: inherit } : connection);
      busy = id; render();
      void options.call<CloudConnection[]>('cloud_set_inherit_environment', { provider: id, inherit }).then(next => {
        connections = next;
        say(root, 'progress', inherit ? tr('modules.cloud.inheritSaved') : tr('modules.cloud.inheritOff'));
      }).catch(error => {
        connections = previous; target.checked = !inherit;
        // The connect form's own error line is hidden while connected, so the
        // visible row status carries the failure.
        const line = root.querySelector<HTMLElement>('.cloud-row-status')!;
        line.hidden = false; line.classList.add('cloud-error');
        line.textContent = error instanceof Error ? error.message : String(error);
      }).finally(() => { busy = ''; if (!disposed) render(); });
      return;
    }
    if (target instanceof HTMLSelectElement && target.closest('.cloud-image')) void saveImage(target);
  });
  host.addEventListener('keydown', event => {
    const form = (event.target as Element).closest?.('.cloud-provider[data-provider] form.cloud-form') as HTMLFormElement | null;
    // Escape closes the form, not the Settings dialog around it.
    if (form && event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); form.hidden = true; render(); }
  });
  void options.listen('cloud-setup', event => {
    if (event.provider !== busy) return;
    const line = section(busy).querySelector<HTMLElement>('.cloud-row-status')!;
    line.hidden = false; line.classList.remove('cloud-error'); line.textContent = event.label;
  }).then(stop => { if (disposed) stop(); else stopListening = stop; });
  void load();
  return () => { disposed = true; disposeLocale(); stopListening?.(); host.replaceChildren(); };
}
