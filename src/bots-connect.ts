import { escape as escapeI18n } from './dom.ts';
import { t as tr } from './i18n.ts';
/** Guided channel setup: numbered steps with links, copy buttons, a live credential
 * check, and what to do next once a channel is connected. */
import { escape, icon } from './dom';
import type { BotDetail, Channel, ChannelKind } from './bots';
import type { PanelContext } from './bots-panels';

export interface Identity { name: string; link: string | null; invite: string | null; warnings: string[] }
interface Field { name: string; label: string; secret: boolean; placeholder: string; config?: boolean }
interface Step { title: string; body: string; field?: Field }
interface Kind { id: ChannelKind; label: string; blurb: string; minutes: string }

export const KINDS: Kind[] = [
  { id: 'web', get label() { return tr('modules.common.web_chat'); }, get blurb() { return tr('bots.connect.blurb_web'); }, get minutes() { return tr('bots.connect.time_Instant'); } },
  { id: 'telegram', label: 'Telegram', get blurb() { return tr('bots.connect.blurb_telegram'); }, get minutes() { return tr('bots.connect.time_2_min'); } },
  { id: 'slack', label: 'Slack', get blurb() { return tr('bots.connect.blurb_slack'); }, get minutes() { return tr('bots.connect.time_4_min'); } },
  { id: 'discord', label: 'Discord', get blurb() { return tr('bots.connect.blurb_discord'); }, get minutes() { return tr('bots.connect.time_4_min'); } },
  { id: 'whatsapp', label: 'WhatsApp', get blurb() { return tr('bots.connect.blurb_whatsapp'); }, get minutes() { return tr('bots.connect.time_15_min'); } },
];
export const kindLabel = (kind: string | undefined) => KINDS.find(item => item.id === kind)?.label ?? tr('bots.connect.channel');

const PORT_DEFAULT = 47321;
const link = (url: string, label: string, primary = false) => `<button type="button" class="${primary ? 'primary-button' : 'secondary-button'} bots-step-button" data-open-url="${escape(url)}">${escape(label)}${icon('forward')}</button>`;
const copy = (value: string, label = tr('bots.connect.copy'), caption = '') => `<span class="bots-copy-row">${caption ? `<span class="bots-copy-caption">${escape(caption)}</span>` : ''}<code>${escape(value)}</code><button type="button" class="secondary-button" data-copy="${escape(value)}">${escape(label)}</button></span>`;
const handle = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 20) || 'my';

/** A Slack app manifest with every scope, event and Socket Mode already set. */
export function slackManifest(botName: string): Record<string, unknown> {
  const name = botName.trim().slice(0, 35) || 'PandaCode bot';
  return {
    display_information: { name, description: 'An always-on assistant running on my computer through PandaCode.' },
    features: { bot_user: { display_name: name, always_online: true }, app_home: { messages_tab_enabled: true, messages_tab_read_only_enabled: false } },
    oauth_config: { scopes: { bot: ['app_mentions:read', 'chat:write', 'im:history', 'im:read', 'im:write', 'users:read'] } },
    settings: { event_subscriptions: { bot_events: ['app_mention', 'message.im'] }, interactivity: { is_enabled: false }, org_deploy_enabled: false, socket_mode_enabled: true, token_rotation_enabled: false },
  };
}
export const slackCreateUrl = (botName: string) => `https://api.slack.com/apps?new_app=1&manifest_json=${encodeURIComponent(JSON.stringify(slackManifest(botName)))}`;

function steps(kind: ChannelKind, botName: string): Step[] {
  switch (kind) {
    case 'telegram': return [
      { title: tr('modules.common.open_botfather_in_telegram'), body: `${escape(tr('bots.connect.botfather'))} ${link('https://t.me/BotFather', tr('bots.connect.open_botfather'), true)}` },
      { title: tr('modules.common.create_the_bot'), body: `${escape(tr('bots.connect.newbot', { name: botName }))}${copy('/newbot', undefined, tr('bots.connect.send'))}${copy(`${handle(botName)}_pandacode_bot`, undefined, tr('bots.connect.username'))}` },
      { title: tr('modules.common.paste_the_token_botfather_sends_back'), body: `${escape(tr('bots.connect.token_warning'))}`, field: { name: 'token', label: tr('modules.common.bot_token'), secret: true, placeholder: '123456789:AAE…' } },
    ];
    case 'slack': return [
      { title: tr('modules.common.create_the_slack_app_in_one_click'), body: `${escape(tr('bots.connect.slack_create'))} ${link(slackCreateUrl(botName), tr('bots.connect.slack_button'), true)} <button type="button" class="bots-text-button" data-copy="${escape(JSON.stringify(slackManifest(botName), null, 2))}">${escape(tr('modules.common.copy_manifest_instead'))}</button>` },
      { title: tr('modules.common.install_it_and_copy_the_bot_token'), body: `${escape(tr('bots.connect.slack_install'))}`, field: { name: 'token', label: tr('modules.common.bot_token'), secret: true, placeholder: 'xoxb-…' } },
      { title: tr('modules.common.create_an_app_level_token'), body: `${escape(tr('bots.connect.slack_app_token'))}`, field: { name: 'app_token', label: tr('modules.common.app_level_token'), secret: true, placeholder: 'xapp-…' } },
    ];
    case 'discord': return [
      { title: tr('modules.common.create_an_application'), body: `${escape(tr('bots.connect.discord_create', { name: botName }))} ${link('https://discord.com/developers/applications', tr('bots.connect.discord_portal'), true)}` },
      { title: tr('modules.common.let_it_read_messages'), body: `${escape(tr('bots.connect.discord_read'))}` },
      { title: tr('modules.common.copy_the_bot_token'), body: `${escape(tr('bots.connect.discord_token'))}`, field: { name: 'token', label: tr('modules.common.bot_token'), secret: true, placeholder: 'MTA…' } },
      { title: tr('modules.common.add_it_to_your_server'), body: `${escape(tr('bots.connect.discord_invite'))}` },
    ];
    case 'whatsapp': return [
      { title: tr('modules.common.create_a_meta_app_with_whatsapp'), body: `${escape(tr('bots.connect.meta_create'))} ${link('https://developers.facebook.com/apps/creation/', tr('bots.connect.meta_portal'), true)}` },
      { title: tr('modules.common.copy_the_phone_number_id'), body: `${escape(tr('bots.connect.meta_phone'))}`, field: { name: 'phoneNumberId', label: tr('bots.connect.phone_id'), secret: false, placeholder: '123456789012345', config: true } },
      { title: tr('modules.common.copy_an_access_token'), body: `${escape(tr('bots.connect.meta_access'))} ${link('https://business.facebook.com/settings/system-users', tr('bots.connect.system_users'))}`, field: { name: 'access_token', label: tr('modules.common.access_token'), secret: true, placeholder: 'EAAG…' } },
      { title: tr('modules.common.copy_the_app_secret'), body: `${escape(tr('bots.connect.meta_secret'))}`, field: { name: 'signing_secret', label: tr('modules.common.app_secret'), secret: true, placeholder: tr('modules.common.32_characters') } },
      { title: tr('modules.common.connect_then_point_meta_at_this_computer'), body: `${escape(tr('bots.connect.meta_next'))}` },
    ];
    default: return [];
  }
}

// Typed values survive re-renders (bots-changed refreshes the panel while you paste).
let adding: ChannelKind | null = null;
const values = new Map<string, string>();
let tested: { kind: ChannelKind; identity?: Identity; error?: string } | null = null;
// Guides the user opened or closed keep that state across re-renders.
const guides = new Map<string, boolean>();
export function guideToggled(details: HTMLDetailsElement): void {
  // Browsers also fire `toggle` when a guide renders open; only a change from the default is a choice.
  const id = details.dataset.guide;
  if (!id) return;
  if (details.open === (details.dataset.default === 'open')) guides.delete(id); else guides.set(id, details.open);
}

function input(kind: ChannelKind, form: HTMLFormElement | null): { kind: ChannelKind; label: string; config: Record<string, string>; secrets: Record<string, string> } {
  const all = steps(kind, '').flatMap(step => step.field ? [step.field] : []);
  const read = (name: string) => (form?.querySelector<HTMLInputElement>(`[name="${name}"]`)?.value ?? values.get(`${kind}:${name}`) ?? '').trim();
  return { kind, label: read('label'), config: Object.fromEntries(all.filter(field => field.config).map(field => [field.name, read(field.name)])), secrets: Object.fromEntries(all.filter(field => !field.config).map(field => [field.name, read(field.name)])) };
}

function result(): string {
  if (!tested || tested.kind !== adding) return '';
  if (tested.error) return `<div class="bots-check fail" role="alert">${icon('alert')}<span>${escape(tested.error)}</span></div>`;
  const identity = tested.identity!;
  return `<div class="bots-check ok" role="status">${icon('check')}<span>${escape(tr('bots.connect.works', { name: identity.name }))}${identity.warnings.map(warning => `<small>${escape(warning)}</small>`).join('')}</span></div>`;
}

export function connectSection(detail: BotDetail): string {
  const chooser = `<div class="bots-kind-grid" role="group" aria-label="${escapeI18n(tr('modules.common.add_a_channel'))}">${KINDS.map(kind => `<button type="button" data-add-kind="${kind.id}" aria-pressed="${kind.id === adding}"><span class="bots-kind" data-kind="${kind.id}" aria-hidden="true">${escape(kind.label.slice(0, 1))}</span><b>${escape(kind.label)}</b><small>${escape(kind.blurb)}</small><em>${escape(kind.minutes)}</em></button>`).join('')}</div>`;
  if (!adding) return chooser;
  if (adding === 'web') {
    return `${chooser}<form class="bots-connect" data-kind="web"><p class="bots-lede">${escapeI18n(tr('modules.common.a_chat_page_served_by_this_computer_only_people_with_the_private'))}</p>
      <div class="dialog-footer"><button type="button" class="secondary-button" data-add-kind="">${escapeI18n(tr('modules.common.cancel'))}</button><button type="submit" class="primary-button">${escapeI18n(tr('modules.common.turn_on_web_chat'))}</button></div></form>`;
  }
  const kind = adding;
  const list = steps(kind, detail.bot.name).map((step, index) => `<li><span class="bots-step-number" aria-hidden="true">${index + 1}</span><div><b>${escape(step.title)}</b><p>${step.body}</p>${step.field ? `<label class="bots-field"><span>${escape(step.field.label)}</span><input name="${step.field.name}" ${step.field.secret ? 'type="password" spellcheck="false"' : 'inputmode="numeric"'} autocomplete="off" placeholder="${escape(step.field.placeholder)}" value="${escape(values.get(`${kind}:${step.field.name}`) ?? '')}"></label>` : ''}</div></li>`).join('');
  return `${chooser}<form class="bots-connect" data-kind="${kind}"><ol class="bots-steps">${list}</ol>
    ${result()}
    <small class="bots-hint">${icon('unlock')}${escape(tr('bots.connect.storage'))}</small>
    <div class="dialog-footer"><button type="button" class="secondary-button" data-add-kind="">${escapeI18n(tr('modules.common.cancel'))}</button><button type="button" class="secondary-button" data-test-channel>${escapeI18n(tr('modules.common.test'))}</button><button type="submit" class="primary-button">${escape(tr('bots.connect.connect', { channel: kindLabel(kind) }))}</button></div></form>`;
}

/** What to do next, shown on each connected channel. */
export function channelGuide(detail: BotDetail, channel: Channel): string {
  const identity = channel.config.identity as Identity | undefined;
  const port = detail.serverPort || PORT_DEFAULT;
  const warnings = (identity?.warnings ?? []).map(warning => `<p class="bots-warning">${icon('alert')}${escape(warning)}</p>`).join('');
  const paired = detail.pairings.some(pairing => pairing.channelId === channel.id && pairing.status === 'approved');
  const pairStep = paired ? '' : `<li>${escape(tr('bots.connect.pair'))}</li>`;
  const publicUrl = String(channel.config.publicUrl ?? '');
  // What the user is typing into the address field survives a background refresh.
  const typedUrl = values.get(`public:${channel.id}`) ?? publicUrl;
  let body = '';
  switch (channel.kind) {
    case 'telegram':
      body = `<ol>${identity?.link ? `<li>${link(identity.link, tr('bots.connect.open_telegram', { name: identity.name }), true)}</li>` : ''}${pairStep}<li>${escapeI18n(tr('modules.common.in_groups_add_the_bot_and_mention_it_or_reply_to_it'))}</li></ol>`; break;
    case 'slack':
      body = `<ol>${identity?.link ? `<li>${link(identity.link, tr('bots.connect.open_slack'), true)}</li>` : ''}<li>${escape(tr('bots.connect.slack_chat'))}</li>${pairStep}</ol>`; break;
    case 'discord':
      body = `<ol>${identity?.invite ? `<li>${link(identity.invite, tr('bots.connect.add_server'), true)} ${escape(tr('bots.connect.authorize'))}</li>` : ''}<li>${escapeI18n(tr('modules.common.mention_it_in_a_channel_or_open_its_profile_and_send_a'))}</li>${pairStep}</ol>`; break;
    case 'whatsapp': {
      const callback = publicUrl ? `${publicUrl}/whatsapp/${channel.id}` : '';
      body = `<ol>
        <li><b>${escapeI18n(tr('modules.common.give_meta_a_way_in'))}</b> ${escape(tr('bots.connect.tunnel'))}${copy('brew install cloudflared', undefined, tr('bots.connect.caption_install'))}${copy(`cloudflared tunnel --url http://127.0.0.1:${port}`, undefined, tr('bots.connect.caption_start'))}${escape(tr('bots.connect.tunnel_address'))}${copy(`tailscale funnel --bg ${port}`, undefined, tr('bots.connect.caption_or'))}</li>
        <li><label class="bots-field"><span>${escapeI18n(tr('modules.common.paste_that_https_address'))}</span><span class="bots-inline-form"><input data-public-url="${escape(channel.id)}" placeholder="https://….trycloudflare.com" value="${escape(typedUrl)}" autocomplete="off" spellcheck="false"><button type="button" class="secondary-button" data-save-public="${escape(channel.id)}">${escapeI18n(tr('modules.common.save'))}</button></span></label></li>
        <li>${escape(tr('bots.connect.webhook_paste'))}${callback ? `${copy(callback, undefined, tr('bots.connect.caption_callback_url'))}` : ` <i>${escapeI18n(tr('modules.common.the_callback_url_appears_here_after_you_save_the_address'))}</i>`}${copy(String(channel.config.verifyToken ?? ''), undefined, tr('bots.connect.caption_verify_token'))}${escape(tr('bots.connect.webhook_verify'))}</li>
        <li>${identity?.link ? link(identity.link, tr('bots.connect.message_whatsapp')) : escape(tr('bots.connect.message_phone'))}</li>${pairStep}</ol>`; break;
    }
    case 'web':
      body = `<ol><li><button type="button" class="primary-button bots-step-button" data-web-open="${escape(channel.id)}">${escapeI18n(tr('modules.common.open_web_chat'))}</button> ${escapeI18n(tr('modules.common.on_this_computer_that_s_it'))}</li>
        <li><label class="bots-switch-row"><input type="checkbox" class="bots-switch" data-remote="${escape(channel.id)}" ${channel.config.remote ? 'checked' : ''}><span><b>${escapeI18n(tr('modules.common.use_from_my_phone_and_other_devices'))}</b><small>${escapeI18n(tr('modules.common.allows_the_page_through_a_private_tunnel_the_link_still_works_only'))}</small></span></label></li>
        ${channel.config.remote ? `<li>${escape(tr('bots.connect.tailscale'))}${copy(`tailscale serve --bg ${port}`, undefined, tr('bots.connect.caption_run'))}${escape(tr('bots.connect.tailscale_address'))}</li>
        <li><label class="bots-field"><span>${escapeI18n(tr('modules.common.paste_that_https_address'))}</span><span class="bots-inline-form"><input data-public-url="${escape(channel.id)}" placeholder="https://your-mac.tailnet.ts.net" value="${escape(typedUrl)}" autocomplete="off" spellcheck="false"><button type="button" class="secondary-button" data-save-public="${escape(channel.id)}">${escapeI18n(tr('modules.common.save'))}</button></span></label></li>
        ${publicUrl ? `<li><button type="button" class="primary-button bots-step-button" data-phone-link="${escape(channel.id)}">${escapeI18n(tr('modules.common.copy_link_for_my_phone'))}</button> ${escapeI18n(tr('modules.common.open_it_on_your_phone_add_it_to_your_home_screen_to'))}</li>` : ''}` : ''}</ol>`; break;
  }
  const fallback = channel.kind === 'web' ? Boolean(channel.config.remote) : !paired;
  const open = guides.get(channel.id) ?? fallback;
  return `${warnings}<details class="bots-guide" data-guide="${escape(channel.id)}" data-default="${fallback ? 'open' : 'closed'}" ${open ? 'open' : ''}><summary>${escape(channel.kind === 'web' || paired ? tr('bots.connect.how') : tr('bots.connect.finish'))}</summary>${body}</details>`;
}

async function webLink(context: PanelContext, channelId: string): Promise<string> { return context.call<string>('bot_web_link', { channelId }); }

/** Returns true when the click was a setup action. */
export function connectClick(target: HTMLElement, context: PanelContext): boolean {
  const data = target.dataset;
  const detail = context.detail(); if (!detail) return false;
  const done = async (text: string) => { context.notify(text); await context.reload(); };
  if (data.addKind !== undefined) { adding = (data.addKind || null) as ChannelKind | null; tested = null; context.rerender(); target.closest('.bots-panel')?.querySelector<HTMLInputElement>('.bots-connect input')?.focus(); return true; }
  if (data.openUrl) { void context.work(async () => { await context.call('open_external_url', { url: data.openUrl }); }); return true; }
  if (data.copy) { void context.work(async () => { await navigator.clipboard.writeText(data.copy!); context.notify(tr('modules.common.copied')); }); return true; }
  if (target.hasAttribute('data-test-channel') && adding) {
    const kind = adding, form = target.closest<HTMLFormElement>('form');
    void context.work(async () => {
      try { tested = { kind, identity: await context.call<Identity>('bot_channel_test', { input: input(kind, form) }) }; }
      catch (cause) { tested = { kind, error: cause instanceof Error ? cause.message : String(cause) }; }
      context.rerender();
    });
    return true;
  }
  if (data.webOpen) { void context.work(async () => { await context.call('open_external_url', { url: await webLink(context, data.webOpen!) }); }); return true; }
  if (data.webCopy) { void context.work(async () => { await navigator.clipboard.writeText(await webLink(context, data.webCopy!)); context.notify(tr('modules.common.private_link_copied_anyone_with_it_can_talk_to_this_bot')); }); return true; }
  if (data.webRotate) { context.confirm(() => tr('bots.connect.rotate_title'), () => tr('bots.connect.rotate_body'), () => tr('bots.connect.new_link'), async () => { await navigator.clipboard.writeText(await context.call<string>('bot_web_new_link', { channelId: data.webRotate })); await done(tr('bots.connect.rotated')); }); return true; }
  if (data.phoneLink) {
    const channel = detail.channels.find(item => item.id === data.phoneLink);
    void context.work(async () => {
      const local = new URL(await webLink(context, data.phoneLink!));
      await navigator.clipboard.writeText(`${String(channel?.config.publicUrl ?? '')}${local.pathname}${local.hash}`);
      context.notify(tr('modules.common.phone_link_copied_send_it_to_yourself_and_open_it_on_your'));
    });
    return true;
  }
  if (data.savePublic) {
    const field = target.closest('li')?.querySelector<HTMLInputElement>(`[data-public-url="${CSS.escape(data.savePublic)}"]`);
    void context.work(async () => { await context.call('bot_channel_configure', { channelId: data.savePublic, config: { publicUrl: field?.value ?? '' } }); values.delete(`public:${data.savePublic}`); await done(tr('bots.connect.address_saved')); });
    return true;
  }
  return false;
}

export function connectChange(target: HTMLElement, context: PanelContext): boolean {
  const input = target as HTMLInputElement;
  if (input.dataset.remote) { void context.work(async () => { await context.call('bot_channel_configure', { channelId: input.dataset.remote, config: { remote: input.checked } }); await context.reload(); }); return true; }
  return false;
}

/** Remembers typed setup values, so a refresh while pasting keeps them. */
export function connectInput(target: HTMLElement): void {
  const form = target.closest<HTMLFormElement>('.bots-connect');
  const field = target as HTMLInputElement;
  if (field.dataset.publicUrl) { values.set(`public:${field.dataset.publicUrl}`, field.value); return; }
  if (form?.dataset.kind && field.name) { values.set(`${form.dataset.kind}:${field.name}`, field.value); if (tested?.kind === form.dataset.kind) tested = null; }
}

export function connectSubmit(form: HTMLFormElement, context: PanelContext): boolean {
  if (!form.matches('.bots-connect')) return false;
  const detail = context.detail(); const kind = form.dataset.kind as ChannelKind;
  if (!detail || !kind) return true;
  void context.work(async () => {
    await context.call('bot_channel_add', { botId: detail.bot.id, input: kind === 'web' ? { kind, label: '', config: {}, secrets: {} } : input(kind, form) });
    for (const key of [...values.keys()]) if (key.startsWith(`${kind}:`)) values.delete(key);
    adding = null; tested = null;
    context.notify(tr('bots.connect.connected', { channel: kindLabel(kind) }));
    await context.reload();
  });
  return true;
}
