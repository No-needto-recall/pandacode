'use no memo';
// Translation helpers read the subscribed locale; React Compiler must not cache constant-key calls.
import { useLocale } from '../ui/locale.ts';
import { statusText, t as msg } from '../i18n.ts';
// One agent working for a task. A team worker: its assignment, checkpoint, result, files and its
// own transcript (task.workerMessages, refreshed while it runs, plus its live tools). A subagent:
// its prompt, tools and reply from the task's live subagent state.
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { connect } from '../connect/client.ts';
import type { Message, ToolActivity } from '../connect/types.ts';
import { elapsedLabel } from '../store/inbox.ts';
import { mergeMessages } from '../store/reduce.ts';
import { taskKey, useConnect } from '../store/index.ts';
import { parseToolMessage, subagentActive, subagentName } from '../store/trace.ts';
import { workerActive, workerLabel, type Team, type TeamWorker } from '../store/team.ts';
import { useBackdrop } from '../ui/Backdrop.tsx';
import { harnessName } from '../ui/harness.tsx';
import { Markdown } from '../ui/Markdown.tsx';
import { ModelBadge, WorkerNamesContext } from '../ui/ToolCards.tsx';
import { StatusMark, ToolRow, useNow } from '../ui/Trace.tsx';
import { mono, useColors } from '../ui/theme.ts';
import { useNames, useTeam } from '../ui/useTeam.ts';
import { WorkerMark } from './agents.tsx';

const REFRESH_MS = 5000;

function Card({ title, children, tone }: { title: string; children: React.ReactNode; tone?: string }) {
  useLocale();
  const colors = useColors();
  const backdrop = useBackdrop();
  return (
    <View style={[styles.card, { backgroundColor: backdrop.card }]}>
      <Text style={[styles.cardTitle, { color: tone ?? colors.secondary }]}>{title}</Text>
      {children}
    </View>
  );
}

function Plain({ text, color }: { text: string; color?: string }) {
  useLocale();
  const colors = useColors();
  return <Text selectable style={[styles.body, { color: color ?? colors.text }]}>{text}</Text>;
}

/** The worker's transcript: stored messages, then live tools the store doesn't hold yet. */
function Transcript({ deviceId, sessionId, worker }: { deviceId: string; sessionId: string; worker: TeamWorker }) {
  useLocale();
  const colors = useColors();
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [error, setError] = useState('');
  const running = workerActive(worker);
  const live = useConnect(s => (worker.sessionId ? s.live[taskKey(deviceId, worker.sessionId)] : undefined));
  // The newest id held, across refreshes (the component is keyed by worker).
  const last = useRef(0);
  useEffect(() => {
    let alive = true;
    const load = () => connect.workerMessages(deviceId, sessionId, worker.id, last.current).then(fresh => {
      if (!alive || !fresh.length) { if (alive) setMessages(m => m ?? []); return; }
      last.current = fresh[fresh.length - 1].id;
      setMessages(m => mergeMessages(m ?? [], fresh));
      setError('');
    }, (e: Error) => alive && setError(e.message));
    void load();
    const timer = running ? setInterval(load, REFRESH_MS) : undefined;
    return () => { alive = false; if (timer) clearInterval(timer); };
  }, [deviceId, sessionId, worker.id, running]);
  const rows = useMemo(() => (messages ?? []).filter(m => m.role === 'user' || m.role === 'assistant' || m.role === 'tool'), [messages]);
  const stored = useMemo(() => new Set(rows.filter(m => m.role === 'tool').map(m => parseToolMessage(m.content).id).filter(Boolean)), [rows]);
  const liveTools = (live?.items ?? []).flatMap(i => (i.kind === 'tool' && !stored.has(i.tool.id) ? [i] : []));
  if (error && !messages) return <Plain text={error} color={colors.secondary as string} />;
  if (!messages) return <ActivityIndicator style={styles.spinner} />;
  if (!rows.length && !liveTools.length) return <Plain text={msg("mobile.text.no_messages_yet")} color={colors.secondary as string} />;
  return (
    <View style={styles.transcript}>
      {rows.map(m => m.role === 'tool' ? <ToolRow key={m.id} tool={parseToolMessage(m.content)} />
        : m.role === 'user' ? <View key={m.id} style={[styles.prompt, { backgroundColor: colors.fill }]}><Text selectable style={[styles.body, { color: colors.text }]} numberOfLines={12}>{m.content}</Text></View>
        : <Markdown key={m.id} text={m.content} />)}
      {liveTools.map(i => <ToolRow key={i.tool.id} tool={i.tool} startedAt={i.startedAt} endedAt={i.endedAt} />)}
    </View>
  );
}

function WorkerDetail({ deviceId, sessionId, worker, team }: { deviceId: string; sessionId: string; worker: TeamWorker; team: Team }) {
  useLocale();
  const colors = useColors();
  const active = workerActive(worker);
  const now = useNow(active);
  const elapsed = worker.createdAt ? elapsedLabel((active ? now : worker.updatedAt || now) - worker.createdAt) : '';
  const names = useNames(team);
  const deps = worker.dependsOn.map(id => names[id] || id);
  return (
    <>
      <Stack.Screen options={{ title: worker.name }} />
      <View style={styles.status}>
        <WorkerMark worker={worker} team={team} />
        <Text style={[styles.statusText, { color: worker.status === 'failed' ? colors.red : colors.secondary }]}>{[workerLabel(worker, team), elapsed, worker.attempt > 1 && msg('mobile.agents.attempt', { count: worker.attempt })].filter(Boolean).join(' · ')}</Text>
        <ModelBadge provider={worker.provider} model={worker.model || harnessName(worker.provider)} />
      </View>
      {!!worker.error && <Card title={msg("mobile.text.error")} tone={colors.red as string}><Plain text={worker.error} /></Card>}
      {!!worker.checkpoint && (
        <Card title={msg("mobile.text.checkpoint")}>
          {!!worker.checkpoint.summary && <Plain text={worker.checkpoint.summary} />}
          {!!worker.checkpoint.nextSteps && <><Text style={[styles.sub, { color: colors.secondary }]}>{msg("mobile.text.next")}</Text><Plain text={worker.checkpoint.nextSteps} /></>}
          {!!worker.checkpoint.blocker && <><Text style={[styles.sub, { color: colors.orange }]}>{msg("mobile.text.blocker")}</Text><Plain text={worker.checkpoint.blocker} /></>}
        </Card>
      )}
      {!!worker.summary && <Card title={msg("mobile.text.summary")}><Markdown text={worker.summary} /></Card>}
      {(worker.files.length > 0 || worker.readOnly || deps.length > 0) && (
        <Card title={worker.readOnly ? msg("mobile.text.files_read_only") : msg("mobile.text.files")}>
          <Text selectable style={[styles.files, { color: colors.text }]}>{worker.files.length ? worker.files.join('\n') : msg("mobile.text.whole_checkout")}</Text>
          {deps.length > 0 && <Text style={[styles.sub, { color: colors.secondary }]}>{msg('mobile.agents.after', { names: deps.join(', ') })}</Text>}
        </Card>
      )}
      <Text style={[styles.heading, { color: colors.secondary }]}>{msg("mobile.text.transcript")}</Text>
      <WorkerNamesContext.Provider value={names}>
        <Transcript key={worker.id} deviceId={deviceId} sessionId={sessionId} worker={worker} />
      </WorkerNamesContext.Provider>
    </>
  );
}

export default function AgentScreen() {
  useLocale();
  const { device = '', session = '', kind = 'worker', id = '' } = useLocalSearchParams<{ device: string; session: string; kind: string; id: string }>();
  const colors = useColors();
  const backdrop = useBackdrop();
  const team = useTeam(device, session, kind === 'worker');
  const worker = team && team !== 'outdated' ? team.workers.find(w => w.id === id) : undefined;
  const agent = useConnect(s => (kind === 'subagent' ? s.live[taskKey(device, session)]?.subagents?.find(a => a.id === id) : undefined));
  const now = useNow(!!agent && subagentActive(agent));
  return (
    <ScrollView style={{ backgroundColor: backdrop.background }} contentContainerStyle={styles.page} contentInsetAdjustmentBehavior="automatic">
      {worker && team && team !== 'outdated' && <WorkerDetail deviceId={device} sessionId={session} worker={worker} team={team} />}
      {agent && (
        <>
          <Stack.Screen options={{ title: subagentName(agent) }} />
          <View style={styles.status}>
            <StatusMark status={agent.status} color={colors.green} />
            <Text style={[styles.statusText, { color: colors.secondary }]}>{[statusText(agent.status), agent.startedAt && elapsedLabel((subagentActive(agent) ? now : agent.updatedAt || now) - agent.startedAt)].filter(Boolean).join(' · ')}</Text>
          </View>
          {!!agent.prompt && <Card title={msg("mobile.text.prompt")}><Plain text={agent.prompt} /></Card>}
          <View style={styles.transcript}>{agent.tools.map((t: ToolActivity) => <ToolRow key={t.id} tool={t} />)}</View>
          {!!agent.response.trim() && <Card title={msg("mobile.text.reply")}><Markdown text={agent.response} /></Card>}
        </>
      )}
      {!worker && !agent && (kind === 'worker' && team === undefined ? <ActivityIndicator style={styles.spinner} />
        : <Plain text={msg("mobile.text.this_agent_is_no_longer_listed")} color={colors.secondary as string} />)}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 12, paddingBottom: 48 },
  spinner: { marginTop: 40 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 },
  statusText: { flex: 1, fontSize: 14, fontVariant: ['tabular-nums'], textTransform: 'capitalize' },
  card: { borderRadius: 16, padding: 14, gap: 6, borderCurve: 'continuous' },
  cardTitle: { fontSize: 12.5, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3 },
  sub: { fontSize: 12.5, fontWeight: '600', marginTop: 4 },
  body: { fontSize: 15, lineHeight: 21 },
  files: { fontFamily: mono, fontSize: 12.5, lineHeight: 18 },
  heading: { fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3, paddingHorizontal: 6, marginTop: 6 },
  transcript: { gap: 6 },
  prompt: { borderRadius: 14, padding: 12, borderCurve: 'continuous' },
});
