'use no memo';
// Translation helpers read the subscribed locale; React Compiler must not cache constant-key calls.
import { useLocale } from './locale.ts';
import { t as msg } from '../i18n.ts';
// Expanded views for MCP tool calls: PandaCode's team tools get proper cards (a card per
// dispatched assignment, the finish summary as Markdown, a message with its recipient), screenshot
// tools show their image when the result carries the bytes, and any other MCP call shows
// `server › tool` with its arguments pretty-printed.
import { Image } from 'expo-image';
import { createContext, useContext, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ToolActivity } from '../connect/types.ts';
import { assignmentsOf, imageOf, type Assignment, type WorkerNames } from '../store/pandacode-tools.ts';
import { mcpParts } from '../store/trace.ts';
import { HarnessLogo, harnessName } from './harness.tsx';
import { Icon } from './Icon.tsx';
import { Markdown } from './Markdown.tsx';
import { mono, useColors } from './theme.ts';

/** Worker id → name for the task on screen (from its team), so sentences read `Asked GPT-6…`. */
export const WorkerNamesContext = createContext<WorkerNames>({});
export const useWorkerNames = () => useContext(WorkerNamesContext);

type Fields = Record<string, unknown>;
const MAX_ARGS = 6000;
const str = (f: Fields, key: string) => (typeof f[key] === 'string' ? f[key] as string : '');

/** Pretty JSON for arguments, else the raw text. */
function pretty(input: string, fields: Fields): string {
  const text = Object.keys(fields).length ? JSON.stringify(fields, null, 2) : input;
  return text.length > MAX_ARGS ? `${text.slice(0, MAX_ARGS)}\n…` : text;
}

function Label({ children }: { children: string }) {
  useLocale();
  const colors = useColors();
  return <Text style={[styles.label, { color: colors.secondary }]}>{children}</Text>;
}

function Mono({ text }: { text: string }) {
  useLocale();
  const colors = useColors();
  return <Text selectable style={[styles.code, { color: colors.text }]}>{text}</Text>;
}

/** A model badge: the harness logo, then the model (or profile) name. */
export function ModelBadge({ provider, model }: { provider: string; model: string }) {
  useLocale();
  const colors = useColors();
  if (!provider && !model) return null;
  return (
    <View style={[styles.badge, { backgroundColor: colors.fill }]} accessible accessibilityLabel={[model, provider && harnessName(provider)].filter(Boolean).join(', ')}>
      {!!provider && <HarnessLogo id={provider} size={12} />}
      <Text style={[styles.badgeText, { color: colors.secondary }]} numberOfLines={1}>{model || harnessName(provider)}</Text>
    </View>
  );
}

function AssignmentCard({ a, names }: { a: Assignment; names: WorkerNames }) {
  useLocale();
  const colors = useColors();
  const [open, setOpen] = useState(false);
  const deps = a.dependsOn.map(id => names[id] || id);
  return (
    <View style={[styles.card, { borderColor: colors.separator }]}>
      <View style={styles.row}>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>{a.name}</Text>
        <ModelBadge provider={a.provider} model={a.model || a.profileId} />
      </View>
      <Text style={[styles.meta, { color: colors.tertiary }]} numberOfLines={3}>
        {[a.key && msg('mobile.agents.key', { key: a.key }), a.readOnly && 'read-only', a.files.length ? a.files.join(', ') : msg("mobile.text.whole_checkout_0fe278"), deps.length && msg('mobile.agents.after_lower', { names: deps.join(', ') })].filter(Boolean).join(' · ')}
      </Text>
      {!!a.prompt && (
        <Pressable onPress={() => setOpen(o => !o)} accessibilityRole="button" accessibilityState={{ expanded: open }} style={styles.fold}>
          <Icon ios={open ? 'chevron.down' : 'chevron.right'} android={open ? 'expand_more' : 'chevron_right'} size={10} color={colors.secondary} />
          <Text style={[styles.meta, { color: colors.secondary }]}>{msg("mobile.text.assignment")}</Text>
        </Pressable>
      )}
      {open && <Markdown text={a.prompt} />}
    </View>
  );
}

/** Whether OwnCard draws something for this call (else the generic arguments view). */
function hasOwnCard(own: string, fields: Fields): boolean {
  switch (own) {
    case 'dispatch_workers': return assignmentsOf(fields).length > 0;
    case 'finish_team': return !!str(fields, 'summary');
    case 'followup_worker': case 'send_team_message': case 'checkpoint_worker': return true;
    default: return false;
  }
}

/** The tool's own card (only where hasOwnCard). */
function OwnCard({ own, fields, names }: { own: string; fields: Fields; names: WorkerNames }) {
  useLocale();
  const colors = useColors();
  switch (own) {
    case 'dispatch_workers': {
      const list = assignmentsOf(fields);
      return list.length ? <View style={styles.gap}>{list.map((a, i) => <AssignmentCard key={a.key || i} a={a} names={names} />)}</View> : null;
    }
    case 'finish_team':
      return str(fields, 'summary') ? <Markdown text={str(fields, 'summary')} /> : null;
    case 'followup_worker':
      return (
        <View style={styles.gap}>
          <Label>{msg('mobile.agents.to_readonly', { name: names[str(fields, 'workerId')] || msg('mobile.text.worker'), mode: fields.readOnly === true ? msg('mobile.text.read_only') : '' })}</Label>
          {!!str(fields, 'prompt') && <Markdown text={str(fields, 'prompt')} />}
        </View>
      );
    case 'send_team_message': {
      const to = str(fields, 'recipient');
      return (
        <View style={styles.gap}>
          <Label>{msg('mobile.agents.to', { name: to === 'architect' ? msg('mobile.text.the_architect') : names[to] || to || msg('mobile.text.a_teammate') })}</Label>
          <Markdown text={str(fields, 'message')} />
        </View>
      );
    }
    case 'checkpoint_worker':
      return (
        <View style={styles.gap}>
          {!!str(fields, 'summary') && <Text selectable style={[styles.body, { color: colors.text }]}>{str(fields, 'summary')}</Text>}
          {!!str(fields, 'nextSteps') && <><Label>{msg("mobile.text.next")}</Label><Text selectable style={[styles.body, { color: colors.text }]}>{str(fields, 'nextSteps')}</Text></>}
          {!!str(fields, 'blocker') && <><Label>{msg("mobile.text.blocker")}</Label><Text selectable style={[styles.body, { color: colors.red }]}>{str(fields, 'blocker')}</Text></>}
        </View>
      );
    default: return null;
  }
}

/** The expanded body of an MCP tool call. */
export function McpBody({ tool, fields, own }: { tool: ToolActivity; fields: Fields; own?: string }) {
  useLocale();
  const colors = useColors();
  const names = useWorkerNames();
  const image = useMemo(() => (own && /screenshot|control/.test(own) ? imageOf(tool.output) : undefined), [own, tool.output]);
  const { server, tool: name } = mcpParts(tool.name);
  const hasCard = !!own && hasOwnCard(own, fields);
  const card = hasCard ? <OwnCard own={own!} fields={fields} names={names} /> : null;
  return (
    <View style={styles.gap}>
      {!own && <Label>{`${server} › ${name}`}</Label>}
      {hasCard ? card : !!tool.input.trim() && tool.input.trim() !== '{}' && <Mono text={pretty(tool.input, fields)} />}
      {image ? <Image source={{ uri: image }} style={styles.shot} contentFit="contain" accessibilityLabel={msg("mobile.text.screenshot")} />
        : !hasCard && !!tool.output.trim() && <Mono text={tool.output.length > MAX_ARGS ? `${tool.output.slice(0, MAX_ARGS)}\n…` : tool.output} />}
      {!tool.output.trim() && !hasCard && <Text style={[styles.body, { color: colors.secondary }]}>{tool.status === 'running' ? msg("mobile.text.waiting_for_output") : msg("mobile.text.no_output_was_returned")}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  gap: { gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, padding: 10, gap: 4, borderCurve: 'continuous' },
  title: { flex: 1, fontSize: 14, fontWeight: '600' },
  meta: { fontSize: 12.5, lineHeight: 17 },
  fold: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 2 },
  label: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3 },
  body: { fontSize: 14, lineHeight: 19 },
  code: { fontFamily: mono, fontSize: 12, lineHeight: 16 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8, maxWidth: 150 },
  badgeText: { fontSize: 12, fontWeight: '500', flexShrink: 1 },
  shot: { width: '100%', aspectRatio: 0.5, borderRadius: 8 },
});
