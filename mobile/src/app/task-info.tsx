'use no memo';
// Translation helpers read the subscribed locale; React Compiler must not cache constant-key calls.
import { useLocale } from '../ui/locale.ts';
import { date, t as msg } from '../i18n.ts';
// Task info sheet: project, branch, computer, harness, status and when it last ran.
import { useLocalSearchParams } from 'expo-router';
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { taskKey, useConnect } from '../store/index.ts';
import { HarnessLogo, harnessName } from '../ui/harness.tsx';
import { Icon } from '../ui/Icon.tsx';
import { ProjectTile } from '../ui/ProjectTile.tsx';
import { mono, useColors } from '../ui/theme.ts';

const STATUS: Record<string, string> = { get idle() { return msg("mobile.text.finished"); }, get running() { return msg("mobile.text.working"); }, get waiting() { return msg("mobile.text.needs_you"); }, get failed() { return msg("mobile.text.failed"); }, get stopped() { return msg("mobile.text.stopped"); }, get interrupted() { return msg("mobile.text.interrupted"); } };

export default function TaskInfo() {
  useLocale();
  const { device = '', session = '' } = useLocalSearchParams<{ device: string; session: string }>();
  const colors = useColors();
  const task = useConnect(s => s.tasks[device]?.tasks.find(t => t.sessionId === session));
  const computer = useConnect(s => s.devices.find(d => d.id === device));
  const live = useConnect(s => s.live[taskKey(device, session)]?.status);
  if (!task) return <Text style={[styles.empty, { color: colors.secondary }]}>{msg("mobile.text.this_task_is_not_loaded_yet")}</Text>;
  const status = live && live !== 'idle' ? live : task.status;
  const project = task.chat ? msg("mobile.text.chat") : task.projectName;
  const at = task.lastPromptAt ?? task.updatedAt;
  return (
    <ScrollView style={{ backgroundColor: colors.grouped }} contentContainerStyle={styles.page} contentInsetAdjustmentBehavior="automatic">
      <Text style={[styles.title, { color: colors.text }]} selectable>{task.title || msg("mobile.text.untitled_task")}</Text>
      <View style={[styles.group, { backgroundColor: colors.card }]}>
        <Row icon={<ProjectTile deviceId={device} projectId={task.chat ? undefined : task.projectId} name={project} />} label={msg("mobile.text.project")} value={project} />
        <Row icon={<Icon ios="arrow.triangle.branch" android="call_split" size={16} color={colors.tint} />} label={msg("mobile.text.branch")} value={task.branch || '—'} mono />
        <Row icon={<Icon ios="desktopcomputer" android="computer" size={16} color={colors.tint} />} label={msg("mobile.text.computer")} value={`${computer?.name ?? '—'}${computer && !computer.online ? msg('mobile.computer.offline_suffix') : ''}`} />
        <Row icon={<HarnessLogo id={task.provider} size={18} />} label={msg("mobile.text.harness")} value={`${harnessName(task.provider)}${task.model !== 'default' ? ` · ${task.model}` : ''}`} />
        <Row icon={<Icon ios="circle.dotted.circle" android="radio_button_checked" size={16} color={colors.tint} />} label={msg("mobile.text.status")} value={STATUS[status] ?? status} />
        <Row icon={<Icon ios="clock" android="schedule" size={16} color={colors.tint} />} label={msg("mobile.text.last_active")} value={date(at, { dateStyle: 'medium', timeStyle: 'short' })} last />
      </View>
    </ScrollView>
  );
}

function Row({ icon, label, value, mono: monospace, last }: { icon: ReactNode; label: string; value: string; mono?: boolean; last?: boolean }) {
  useLocale();
  const colors = useColors();
  return (
    <View style={[styles.row, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.separator }]}>
      <View style={styles.icon}>{icon}</View>
      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
      <Text style={[styles.value, { color: colors.secondary }, monospace && { fontFamily: mono, fontSize: 13 }]} numberOfLines={1} selectable>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 12 },
  title: { fontSize: 20, fontWeight: '700', marginHorizontal: 4 },
  group: { borderRadius: 16, paddingHorizontal: 14, borderCurve: 'continuous' },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 48, gap: 10 },
  icon: { width: 22, alignItems: 'center' },
  label: { fontSize: 16 },
  value: { flex: 1, textAlign: 'right', fontSize: 15 },
  empty: { fontSize: 15, textAlign: 'center', marginTop: 40 },
});
