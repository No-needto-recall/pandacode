import { getLocale } from './i18n.ts';
import { escape as escapeI18n } from './dom.ts';
import { t as tr } from './i18n.ts';
import { escape, icon } from './dom';
import { infoMark } from './tooltip';
import type { Activity, BotDetail, Channel, Schedule } from './bots';
import { channelGuide, connectChange, connectClick, connectSection, connectSubmit, kindLabel } from './bots-connect';

export type Tab = 'skills' | 'conversations' | 'memory' | 'schedules' | 'channels' | 'rules' | 'activity';
export interface PanelContext {
  call<T>(command: string, args?: Record<string, unknown>): Promise<T>;
  notify(text: string): void;
  openTask(sessionId: string): void;
  running(sessionId: string): boolean;
  detail(): BotDetail | null;
  reload(): Promise<void>;
  rerender(): void;
  work(action: () => Promise<void>): Promise<void>;
  confirm(title: string | (() => string), text: string | (() => string), button: string | (() => string), action: () => Promise<void>): void;
}

const ACTIVITY_ICONS: Record<string, string> = { inbound: 'chat', reply: 'arrow', notify: 'spark', scheduled: 'refresh', approval: 'unlock', memory: 'leaf', schedule: 'refresh', channel: 'globe', pairing: 'check', rule: 'select', error: 'alert', stopped: 'stop', created: 'plus', updated: 'edit', reset: 'reset' };

/** "5 min. ago", "in 2 hr.": short relative times for lists. */
export function age(at: number | null, now = Date.now()): string {
  if (!at) return '';
  const minutes = Math.round((at - now) / 60000);
  const format = new Intl.RelativeTimeFormat(getLocale(), { numeric: 'auto', style: 'short' });
  if (Math.abs(minutes) < 1) return at > now ? tr('bots.panels.soon') : tr('bots.panels.now');
  if (Math.abs(minutes) < 60) return format.format(minutes, 'minute');
  if (Math.abs(minutes) < 1440) return format.format(Math.round(minutes / 60), 'hour');
  return format.format(Math.round(minutes / 1440), 'day');
}

let scheduleKind: Schedule['kind'] = 'daily';

let activity: { botId: string; items: Activity[]; done: boolean; loading: boolean } = { botId: '', items: [], done: false, loading: false };

function threadLabel(detail: BotDetail, channelId: string, externalId: string): string {
  if (channelId === 'desktop') return tr('bots.panels.app');
  if (channelId === 'schedule') return tr('bots.panels.scheduled');
  const channel = detail.channels.find(item => item.id === channelId);
  const kind = channel ? kindLabel(channel.kind) : tr('bots.panels.removed');
  return channel?.kind === 'web' ? kind : `${kind} · ${externalId.length > 14 ? `…${externalId.slice(-8)}` : externalId}`;
}

/** Every conversation the bot has: this app, each channel thread, and its scheduled work. Each opens as a task. */
function conversationsPanel(detail: BotDetail, context: PanelContext): string {
  const threads = [...detail.threads].sort((a, b) => Number(b.channelId === 'desktop') - Number(a.channelId === 'desktop') || b.updatedAt - a.updatedAt);
  const web = detail.channels.find(item => item.kind === 'web' && item.enabled);
  const row = (thread: BotDetail['threads'][number]) => `<li><span class="bots-item-main"><b>${escape(threadLabel(detail, thread.channelId, thread.externalId))}</b><small>${escape(context.running(thread.sessionId) ? tr('bots.panels.working') : age(thread.updatedAt))}</small></span><button type="button" class="secondary-button" data-open-task="${escape(thread.sessionId)}">${escapeI18n(tr('modules.common.open'))}</button></li>`;
  return `${threads.length ? `<ul class="bots-items">${threads.map(row).join('')}</ul>` : `<p class="bots-empty-note">${escapeI18n(tr('modules.common.no_conversations_yet_open_chat_to_start_one'))}</p>`}
    ${web ? `<div class="bots-callout">${icon('globe')}<span>${escapeI18n(tr('modules.common.also_chat_from_any_browser_on_this_computer'))}</span><button type="button" class="secondary-button" data-web-open="${escape(web.id)}">${escapeI18n(tr('modules.common.open_web_chat'))}</button></div>` : ''}`;
}

function memoryPanel(detail: BotDetail): string {
  const items = [...detail.memories].reverse();
  return `<form class="bots-inline-form bots-memory"><input name="content" maxlength="2000" placeholder="${escapeI18n(tr('modules.common.add_a_memory'))}" aria-label="${escapeI18n(tr('modules.common.new_memory'))}" autocomplete="off"><button type="submit" class="secondary-button">${escapeI18n(tr('modules.common.remember'))}</button></form>
    ${items.length ? `<ul class="bots-items">${items.map(memory => `<li><span class="bots-item-main"><span>${escape(memory.content)}</span><small>${escape(memory.source === 'bot' ? tr('bots.panels.learned') : tr('bots.panels.added'))} · ${escape(age(memory.createdAt))}</small></span><button type="button" class="icon-button" data-forget="${escape(memory.id)}" aria-label="${escape(tr('bots.panels.forget_memory'))}" title="${escape(tr('bots.panels.forget'))}">${icon('trash')}</button></li>`).join('')}</ul>` : `<p class="bots-empty-note">${escapeI18n(tr('modules.common.no_memories_yet'))}</p>`}`;
}

export function describeSchedule(schedule: Pick<Schedule, 'kind' | 'intervalMinutes' | 'timeOfDay' | 'nextRunAt'>): string {
  switch (schedule.kind) {
    case 'interval': { const minutes = schedule.intervalMinutes ?? 0; return minutes % 60 === 0 ? tr(minutes === 60 ? 'bots.panels.every_hour' : 'bots.panels.every_hours', { count: minutes / 60 }) : tr('bots.panels.every_minutes', { count: minutes }); }
    case 'daily': return tr('bots.panels.daily_at', { time: schedule.timeOfDay ?? '' });
    case 'weekdays': return tr('bots.panels.weekdays_at', { time: schedule.timeOfDay ?? '' });
    default: return schedule.nextRunAt ? tr('bots.panels.once_at', { time: new Date(schedule.nextRunAt).toLocaleString(getLocale(), { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) }) : tr('bots.panels.once');
  }
}

function schedulesPanel(detail: BotDetail): string {
  const field = (kinds: Schedule['kind'][], html: string) => `<div class="bots-when" data-kinds="${kinds.join(' ')}" ${kinds.includes(scheduleKind) ? '' : 'hidden'}>${html}</div>`;
  const soon = new Date(Date.now() + 3600000);
  const local = new Date(soon.getTime() - soon.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  return `<form class="bots-schedule">
      <label class="bots-field"><span>${escapeI18n(tr('modules.common.what_should_it_do'))}</span><textarea name="prompt" rows="2" maxlength="8000" placeholder="${escape(tr('bots.panels.schedule_prompt'))}"></textarea></label>
      <div class="bots-grid three"><label class="bots-field"><span>${escapeI18n(tr('modules.common.name'))}</span><input name="title" maxlength="120" placeholder="${escape(tr('bots.panels.schedule_name'))}" autocomplete="off"></label>
      <label class="bots-field"><span>${escapeI18n(tr('modules.common.repeat'))}</span><select name="kind">${[['daily', tr('bots.panels.every_day')], ['weekdays', tr('bots.panels.weekdays')], ['interval', tr('bots.panels.interval')], ['once', tr('bots.panels.once')]].map(([id, label]) => `<option value="${id}" ${id === scheduleKind ? 'selected' : ''}>${escape(label)}</option>`).join('')}</select></label>
      ${field(['daily', 'weekdays'], `<label class="bots-field"><span>${escapeI18n(tr('modules.common.time'))}</span><input type="time" name="timeOfDay" value="09:00"></label>`)}
      ${field(['interval'], `<label class="bots-field"><span>${escapeI18n(tr('modules.common.every_minutes'))}</span><input type="number" name="intervalMinutes" min="5" max="10080" step="5" value="60"></label>`)}
      ${field(['once'], `<label class="bots-field"><span>${escapeI18n(tr('modules.common.at'))}</span><input type="datetime-local" name="runAt" value="${local}"></label>`)}</div>
      <div class="dialog-footer"><button type="submit" class="secondary-button">${icon('plus')}${escape(tr('bots.panels.add_schedule'))}</button></div></form>
    ${detail.schedules.length ? `<ul class="bots-items">${detail.schedules.map(schedule => `<li class="${schedule.enabled ? '' : 'off'}"><span class="bots-item-main"><b>${escape(schedule.title)}${schedule.createdBy === 'bot' ? ` <span class="bots-chip">${escapeI18n(tr('modules.common.set_by_bot'))}</span>` : ''}</b><small>${escape(describeSchedule(schedule))}${schedule.enabled && schedule.nextRunAt ? ` · ${escape(tr('bots.panels.next_run', { time: age(schedule.nextRunAt) }))}` : schedule.enabled ? '' : ` · ${escape(tr('bots.panels.off'))}`}</small></span>
      <input type="checkbox" class="bots-switch" data-schedule-toggle="${escape(schedule.id)}" ${schedule.enabled ? 'checked' : ''} aria-label="${escape(tr('bots.panels.schedule_on', { name: schedule.title }))}">
      <button type="button" class="icon-button" data-run-schedule="${escape(schedule.id)}" aria-label="${escape(tr('bots.panels.run_schedule', { name: schedule.title }))}" title="${escape(tr('bots.panels.run_now'))}">${icon('play')}</button>
      <button type="button" class="icon-button" data-delete-schedule="${escape(schedule.id)}" aria-label="${escape(tr('bots.panels.delete_schedule', { name: schedule.title }))}" title="${escape(tr('bots.panels.delete'))}">${icon('trash')}</button></li>`).join('')}</ul>` : `<p class="bots-empty-note">${escapeI18n(tr('modules.common.no_schedules_yet_the_bot_can_also_schedule_work_for_itself'))}</p>`}`;
}

/** Translate only the channel protocol's known status templates; preserve remote errors/names. */
function channelStatus(status: string): string {
  switch (status) {
    case 'Off': return tr('bots.channel_status.off');
    case 'Starting…': return tr('bots.channel_status.starting');
    case 'Ready on this computer': return tr('bots.channel_status.ready_local');
    case 'Waiting for webhook calls': return tr('bots.channel_status.waiting_webhook');
    case 'Webhook verified': return tr('bots.channel_status.webhook_verified');
    case 'Receiving messages': return tr('bots.channel_status.receiving');
    case 'Reconnecting': return tr('bots.channel_status.reconnecting');
  }
  if (status.startsWith('Connected as ')) return tr('bots.channel_status.as', { name: status.slice(13) });
  if (status.startsWith('Connected to ')) return tr('bots.channel_status.to', { name: status.slice(13) });
  if (status.startsWith('Reconnecting: ')) return tr('bots.channel_status.retry', { error: status.slice(14) });
  return status;
}

function channelCard(detail: BotDetail, channel: Channel): string {
  const label = kindLabel(channel.kind);
  const actions = channel.kind === 'web' ? `<button type="button" class="secondary-button" data-web-copy="${escape(channel.id)}">${escapeI18n(tr('modules.common.copy_link'))}</button><button type="button" class="icon-button" data-web-rotate="${escape(channel.id)}" aria-label="${escape(tr('bots.panels.new_link'))}" title="${escape(tr('bots.panels.new_link_warning'))}">${icon('refresh')}</button>` : '';
  const identity = (channel.config.identity as { name?: string } | undefined)?.name;
  return `<li class="bots-channel ${channel.enabled ? '' : 'off'}" data-kind="${channel.kind}"><div class="bots-channel-row"><span class="bots-kind" data-kind="${channel.kind}" aria-hidden="true">${escape(label.slice(0, 1))}</span><span class="bots-item-main"><b>${escape(channel.label || label)}${identity && channel.kind !== 'web' ? ` <small class="bots-identity">${escape(identity)}</small>` : ''}</b><small>${escape(channel.enabled ? channelStatus(channel.status) || tr('bots.panels.starting') : tr('bots.panels.off'))}</small></span>${actions}
    <input type="checkbox" class="bots-switch" data-channel-toggle="${escape(channel.id)}" ${channel.enabled ? 'checked' : ''} aria-label="${escape(tr('bots.panels.channel_on', { name: channel.label || label }))}">
    <button type="button" class="icon-button" data-remove-channel="${escape(channel.id)}" aria-label="${escape(tr('bots.panels.remove_channel', { name: channel.label || label }))}" title="${escape(tr('bots.panels.remove'))}">${icon('trash')}</button></div>${channel.enabled ? channelGuide(detail, channel) : ''}</li>`;
}

function pairingsList(detail: BotDetail): string {
  if (!detail.pairings.length) return '';
  const label = (channelId: string) => kindLabel(detail.channels.find(channel => channel.id === channelId)?.kind);
  return `<h4>${escape(tr('bots.panels.people'))} ${infoMark(tr('modules.common.unknown_senders_get_a_four_digit_code_approve_it_here_to_let'), tr('modules.common.about_pairing'))}</h4><ul class="bots-items">${detail.pairings.map(pairing => {
    const id = `data-channel="${escape(pairing.channelId)}" data-sender="${escape(pairing.senderId)}"`;
    const actions = pairing.status === 'pending' ? `<button type="button" class="primary-button" data-pairing="approved" ${id}>${escapeI18n(tr('modules.common.approve'))}</button><button type="button" class="secondary-button" data-pairing="blocked" ${id}>${escapeI18n(tr('modules.common.block'))}</button>`
      : `<button type="button" class="secondary-button" data-pairing="removed" ${id}>${escape(pairing.status === 'blocked' ? tr('bots.panels.unblock') : tr('bots.panels.remove'))}</button>`;
    return `<li class="bots-pairing ${pairing.status}"><span class="bots-item-main"><b>${escape(pairing.senderName || pairing.senderId)}</b><small>${escape(label(pairing.channelId))} · ${pairing.status === 'pending' ? `${escape(tr('bots.panels.pair_code', { code: pairing.code }))}` : escape(pairing.status === 'approved' ? tr('bots.panels.approved') : tr('bots.panels.blocked'))}</small></span>${actions}</li>`;
  }).join('')}</ul>`;
}

function channelsPanel(detail: BotDetail): string {
  return `${detail.channels.length ? `<ul class="bots-items">${detail.channels.map(channel => channelCard(detail, channel)).join('')}</ul>` : ''}
    ${pairingsList(detail)}<h4>${escape(detail.channels.length ? tr('bots.panels.add_another') : tr('bots.panels.add_channel'))}</h4>${connectSection(detail)}`;
}

function rulesPanel(detail: BotDetail): string {
  return `<form class="bots-inline-form bots-rule"><input name="pattern" maxlength="200" placeholder="git status*" aria-label="${escapeI18n(tr('modules.common.pattern'))}" autocomplete="off"><select name="decision" aria-label="${escapeI18n(tr('modules.common.decision'))}"><option value="allow">${escape(tr('bots.panels.allow'))}</option><option value="ask">${escapeI18n(tr('modules.common.ask'))}</option><option value="deny">${escapeI18n(tr('modules.common.deny'))}</option></select><button type="submit" class="secondary-button">${escapeI18n(tr('modules.common.add_rule'))}</button></form>
    ${detail.rules.length ? `<ul class="bots-items">${detail.rules.map(rule => `<li><span class="bots-chip ${rule.decision}">${escape(rule.decision === 'allow' ? tr('bots.panels.allow') : rule.decision === 'ask' ? tr('modules.common.ask') : tr('modules.common.deny'))}</span><span class="bots-item-main"><code>${escape(rule.pattern)}</code></span><button type="button" class="icon-button" data-delete-rule="${escape(rule.id)}" aria-label="${escape(tr('bots.panels.delete_rule', { pattern: rule.pattern }))}" title="${escape(tr('bots.panels.delete'))}">${icon('trash')}</button></li>`).join('')}</ul>` : `<p class="bots-empty-note">${escapeI18n(tr('modules.common.no_rules_reply_always_to_an_approval_request_to_add_one'))}</p>`}`;
}

function activityPanel(detail: BotDetail, context: PanelContext): string {
  if (activity.botId !== detail.bot.id) { activity = { botId: detail.bot.id, items: [], done: false, loading: false }; void loadActivity(context, false); }
  if (!activity.items.length) return (activity.loading || !activity.done ? `<p class="dialog-loading" role="status">${escapeI18n(tr('modules.common.loading_activity'))}</p>` : `<p class="bots-empty-note">${escapeI18n(tr('modules.common.nothing_yet'))}</p>`);
  return `<ul class="bots-activity">${activity.items.map(item => `<li data-kind="${escape(item.kind)}">${icon(ACTIVITY_ICONS[item.kind] ?? 'info')}<span>${escape(item.summary)}</span><time datetime="${new Date(item.at).toISOString()}">${escape(age(item.at))}</time></li>`).join('')}</ul>
    ${activity.done ? '' : `<div class="dialog-footer"><button type="button" class="secondary-button" data-more-activity>${escapeI18n(tr('modules.common.show_older'))}</button></div>`}`;
}

async function loadActivity(context: PanelContext, older: boolean): Promise<void> {
  const botId = activity.botId;
  activity.loading = true;
  try {
    const before = older ? activity.items.at(-1)?.id : undefined;
    const items = await context.call<Activity[]>('bot_activity', { botId, before: before ?? null });
    if (activity.botId !== botId) return;
    activity = { botId, items: older ? [...activity.items, ...items] : items, done: items.length < 100, loading: false };
  } catch (cause) {
    activity = { ...activity, done: true, loading: false };
    context.notify(cause instanceof Error ? cause.message : String(cause));
  }
  context.rerender();
}

/** Library skills and configured MCP servers, read once per settings visit. Names only, never definitions. */
let capabilities: { skills: { id: string; name: string; description: string }[]; mcp: { harness: string; name: string; source: string }[] } | null = null;
let capabilitiesLoad: Promise<void> | null = null;
/** Harnesses that read skill folders; the rest get skills in the bot's brief. */
const SKILL_FOLDERS = ['claude', 'codex'];

function loadCapabilities(context: PanelContext): void {
  capabilitiesLoad ??= (async () => {
    const [items, inventory] = await Promise.all([
      context.call<{ id: string; name: string; kind: string; description: string }[]>('skills_list').catch(() => []),
      context.call<{ entries: { harness: string; kind: string; name: string; source: string }[] }>('capabilities_inventory', { taskId: null }).catch(() => ({ entries: [] })),
    ]);
    capabilities = { skills: items.filter(item => item.kind === 'skill'), mcp: inventory.entries.filter(entry => entry.kind === 'mcp server') };
    context.rerender();
  })();
}

function skillsPanel(detail: BotDetail, context: PanelContext): string {
  if (!capabilities) { loadCapabilities(context); return `<p class="dialog-loading" role="status">${escapeI18n(tr('modules.common.loading_skills'))}</p>`; }
  const bot = detail.bot;
  const delivery = SKILL_FOLDERS.includes(bot.provider) ? tr('bots.panels.skill_files') : tr('bots.panels.skill_brief');
  const known = new Set(capabilities.skills.map(skill => skill.id));
  const skills = [...capabilities.skills, ...bot.skills.filter(id => !known.has(id)).map(id => ({ id, name: id, description: '' }))];
  const skillRow = (skill: { id: string; name: string; description: string }) => {
    const on = bot.skills.includes(skill.id), missing = !known.has(skill.id);
    return `<li><span class="bots-item-main"><b>${escape(skill.name)}</b><small>${escape(missing ? tr('bots.panels.missing_skill') : on ? delivery : skill.description)}</small></span><input type="checkbox" class="bots-switch" data-bot-skill="${escape(skill.id)}" ${on ? 'checked' : ''} aria-label="${escape(tr('bots.panels.use_skill', { name: skill.name }))}"></li>`;
  };
  const names = [...new Set([...capabilities.mcp.map(entry => entry.name), ...bot.mcp])];
  const mcpRow = (name: string) => {
    const own = capabilities!.mcp.find(entry => entry.name === name && entry.harness === bot.provider);
    const status = own ? tr('bots.panels.mcp_source', { source: own.source }) : tr('bots.panels.mcp_unsupported');
    return `<li class="${own ? '' : 'off'}"><span class="bots-item-main"><b>${escape(name)}</b><small data-mcp-status>${escape(status)}</small></span><input type="checkbox" class="bots-switch" data-bot-mcp="${escape(name)}" ${bot.mcp.includes(name) ? 'checked' : ''} aria-label="${escape(tr('bots.panels.use_mcp', { name }))}"></li>`;
  };
  return `<h4>${escape(tr('bots.panels.skills'))} ${infoMark(tr('modules.common.chosen_skills_are_turned_on_only_in_this_bot_s_workspace_or'), tr('modules.common.about_bot_skills'))}</h4>
    ${skills.length ? `<ul class="bots-items bots-skills">${skills.map(skillRow).join('')}</ul>` : `<p class="bots-empty-note">${escapeI18n(tr('modules.common.the_skills_library_is_empty_import_skills_in_settings_skills_rules'))}</p>`}
    <h4>${escape(tr('bots.panels.mcp_servers'))} ${infoMark(tr('modules.common.servers_come_from_each_harness_s_own_configuration_and_keep_their_credentials'), tr('modules.common.about_mcp_servers'))}</h4>
    ${names.length ? `<ul class="bots-items bots-mcp">${names.map(mcpRow).join('')}</ul>` : `<p class="bots-empty-note">${escapeI18n(tr('modules.common.no_mcp_servers_are_configured_in_your_harnesses'))}</p>`}`;
}

/** Saves the checked skills and MCP servers. */
function saveCapabilities(target: HTMLElement, context: PanelContext): void {
  const detail = context.detail(); if (!detail) return;
  const panel = target.closest('.bots-panel')!;
  const checked = (key: string) => [...panel.querySelectorAll<HTMLInputElement>(`input[data-${key}]`)].filter(input => input.checked).map(input => input.getAttribute(`data-${key}`)!);
  void context.work(async () => { await context.call('bot_set_capabilities', { botId: detail.bot.id, skills: checked('bot-skill'), mcp: checked('bot-mcp') }); invalidateActivity(); context.notify(tr('modules.common.saved')); await context.reload(); });
}

export function renderPanel(tab: Tab, detail: BotDetail, context: PanelContext): string {
  switch (tab) {
    case 'skills': return skillsPanel(detail, context);
    case 'conversations': return conversationsPanel(detail, context);
    case 'memory': return memoryPanel(detail);
    case 'schedules': return schedulesPanel(detail);
    case 'channels': return channelsPanel(detail);
    case 'rules': return rulesPanel(detail);
    case 'activity': return activityPanel(detail, context);
  }
}

/** Fresh activity after any change, so the Activity tab never shows a stale page. */
export function invalidateActivity(): void { activity = { botId: '', items: [], done: false, loading: false }; }
/** Re-read the skills library and MCP inventory next time the Skills section opens. */
export function invalidateCapabilities(): void { capabilities = null; capabilitiesLoad = null; }

export function panelClick(target: HTMLElement, _tab: Tab, context: PanelContext): void {
  const detail = context.detail(); if (!detail) return;
  const bot = detail.bot;
  const data = target.dataset;
  const done = async (text: string) => { invalidateActivity(); context.notify(text); await context.reload(); };
  if (connectClick(target, context)) return;
  if (data.openTask) context.openTask(data.openTask);
  else if (data.forget) void context.work(async () => { await context.call('bot_forget', { botId: bot.id, memoryId: data.forget }); await done(tr('bots.panels.forgotten')); });
  else if (data.runSchedule) void context.work(async () => { await context.call('bot_run_schedule_now', { scheduleId: data.runSchedule }); await done(tr('bots.panels.started')); });
  else if (data.deleteSchedule) void context.work(async () => { await context.call('bot_schedule_delete', { botId: bot.id, scheduleId: data.deleteSchedule }); await done(tr('bots.panels.schedule_deleted')); });
  else if (data.deleteRule) void context.work(async () => { await context.call('bot_rule_delete', { botId: bot.id, ruleId: data.deleteRule }); await done(tr('bots.panels.rule_deleted')); });
  else if (data.removeChannel) {
    const channel = detail.channels.find(item => item.id === data.removeChannel);
    context.confirm(() => tr('bots.panels.remove_title'), () => tr('bots.panels.remove_body', { name: bot.name, channel: channel?.label || kindLabel(channel?.kind) }), () => tr('bots.panels.remove'), async () => { await context.call('bot_channel_remove', { channelId: data.removeChannel }); await done(tr('bots.panels.channel_removed')); });
  }
  else if (data.pairing) void context.work(async () => { await context.call('bot_pairing_decide', { channelId: data.channel, senderId: data.sender, decision: data.pairing }); await done(data.pairing === 'approved' ? tr('bots.panels.paired') : data.pairing === 'blocked' ? tr('bots.panels.blocked') : tr('bots.panels.removed_done')); });
  else if (target.hasAttribute('data-more-activity')) void loadActivity(context, true);
}

export function panelChange(target: HTMLElement, _tab: Tab, context: PanelContext): void {
  const detail = context.detail(); if (!detail) return;
  const input = target as HTMLInputElement;
  if (connectChange(target, context)) return;
  if (input.dataset.botSkill !== undefined || input.dataset.botMcp !== undefined) saveCapabilities(target, context);
  else if (target.matches('.bots-schedule select[name=kind]')) {
    scheduleKind = (target as HTMLSelectElement).value as Schedule['kind'];
    target.closest('form')?.querySelectorAll<HTMLElement>('.bots-when').forEach(element => { element.hidden = !element.dataset.kinds!.split(' ').includes(scheduleKind); });
  } else if (input.dataset.scheduleToggle) void context.work(async () => { await context.call('bot_schedule_set_enabled', { scheduleId: input.dataset.scheduleToggle, enabled: input.checked }); invalidateActivity(); await context.reload(); });
  else if (input.dataset.channelToggle) void context.work(async () => { await context.call('bot_channel_set_enabled', { channelId: input.dataset.channelToggle, enabled: input.checked }); invalidateActivity(); await context.reload(); });
}

export function panelSubmit(form: HTMLFormElement, _tab: Tab, context: PanelContext): void {
  const detail = context.detail(); if (!detail) return;
  const bot = detail.bot;
  const data = new FormData(form);
  const text = (name: string) => String(data.get(name) ?? '').trim();
  const done = async (message: string) => { invalidateActivity(); context.notify(message); await context.reload(); };
  if (form.matches('.bots-memory')) {
    const content = text('content'); if (!content) return;
    void context.work(async () => { await context.call('bot_remember', { botId: bot.id, content }); await done(tr('bots.panels.remembered')); });
  } else if (form.matches('.bots-rule')) {
    const pattern = text('pattern'); if (!pattern) return;
    void context.work(async () => { await context.call('bot_rule_add', { botId: bot.id, pattern, decision: text('decision') }); await done(tr('bots.panels.rule_added')); });
  } else if (form.matches('.bots-schedule')) {
    const kind = text('kind') as Schedule['kind'];
    const runAt = kind === 'once' ? new Date(text('runAt')).getTime() : null;
    if (kind === 'once' && !Number.isFinite(runAt)) { context.notify(tr('modules.common.choose_when_it_should_run')); return; }
    const input = { title: text('title'), prompt: text('prompt'), kind, intervalMinutes: kind === 'interval' ? Number(text('intervalMinutes')) : null, timeOfDay: kind === 'daily' || kind === 'weekdays' ? text('timeOfDay') : null, runAt };
    void context.work(async () => { await context.call('bot_schedule_create', { botId: bot.id, input }); await done(tr('bots.panels.schedule_added')); });
  } else connectSubmit(form, context);
}
