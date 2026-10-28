'use no memo';
// Translation helpers read the subscribed locale; React Compiler must not cache constant-key calls.
import { errorText, t as msg } from '../i18n.ts';
import { useLocale } from '../ui/locale.ts';
// New task: computer, project, harness + model, effort, mode, worktree, prompt → task.start.
import { router, useLocalSearchParams } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { Choice } from '../ui/Choice.tsx';
import { ProjectTile } from '../ui/ProjectTile.tsx';
import { Button } from '../ui/requests.tsx';
import { MODES } from '../ui/status.tsx';
import { useColors } from '../ui/theme.ts';
import { useNewTask } from '../ui/useNewTask.ts';

export default function NewTask() {
  useLocale();
  const colors = useColors();
  const params = useLocalSearchParams<{ device?: string }>();
  const form = useNewTask(params.device);
  const { hosts, deviceId, list, projectId, provider, options, model, effort, efforts, mode, worktree, starting, pick } = form;
  const [prompt, setPrompt] = useState('');
  const start = async () => {
    try {
      const { sessionId: session, note } = await form.start(prompt);
      router.dismiss();
      router.push({ pathname: '/task/[device]/[session]', params: { device: deviceId, session } });
      if (note) Alert.alert(msg("mobile.text.started_in_a_worktree"), note.replace(/^Started in a worktree: /, ''), [{ text: msg('mobile.text.ok') }]);
    } catch (e) {
      Alert.alert(msg("mobile.text.could_not_start_the_task"), errorText(e), [{ text: msg('mobile.text.ok') }]);
    }
  };

  if (!hosts.length) return <Text style={[styles.empty, { color: colors.secondary }]}>{msg("mobile.text.no_computer_with_remote_access_is_online")}</Text>;
  return (
    <ScrollView style={{ backgroundColor: colors.grouped }} contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="automatic">
      <View style={[styles.group, { backgroundColor: colors.card }]}>
        <Row label={msg("mobile.text.computer")}><Choice value={deviceId} options={hosts.map(h => ({ value: h.id, label: h.name }))} onChange={form.pickDevice} /></Row>
        <Row label={msg("mobile.text.project")}>{list ? <View style={styles.project}><ProjectTile deviceId={deviceId} projectId={projectId} name={list.projects.find(p => p.id === projectId)?.name ?? ''} /><Choice value={projectId} options={list.projects.map(p => ({ value: p.id, label: p.name }))} onChange={id => pick({ projectId: id })} /></View> : <ActivityIndicator />}</Row>
        <Row label={msg("mobile.text.harness")}>{options.loaded ? <Choice value={provider} options={options.harnesses} onChange={form.pickProvider} /> : <ActivityIndicator />}</Row>
        <Row label={msg("mobile.text.model")}><Choice value={model} options={[{ value: 'default', label: msg("mobile.text.default") }, ...options.models.filter(m => m.value !== 'default')]} onChange={form.pickModel} /></Row>
        {efforts.length > 0 && <Row label={msg("mobile.text.effort")}><Choice value={effort ?? ''} options={efforts} onChange={e => pick({ effort: e })} /></Row>}
        <Row label={msg("mobile.text.permissions")}><Choice value={mode} options={MODES.map(m => ({ value: m.id, label: m.label }))} onChange={m => pick({ mode: m })} /></Row>
        <Row label={msg("mobile.text.new_worktree")} last><Switch value={worktree} onValueChange={form.setWorktree} /></Row>
      </View>
      <TextInput value={prompt} onChangeText={setPrompt} placeholder={msg("mobile.text.what_should_the_agent_do")} placeholderTextColor={colors.tertiary as string} multiline autoFocus
        style={[styles.prompt, { backgroundColor: colors.card, color: colors.text }]} accessibilityLabel={msg("mobile.text.prompt")} />
      {starting
        ? <View style={styles.starting}><ActivityIndicator /><Text style={{ color: colors.secondary }}>{msg("mobile.text.starting_on_the_computer")}</Text></View>
        : <Button label={msg("mobile.text.start_task")} kind="primary" onPress={start} disabled={!form.canStart(prompt)} />}
    </ScrollView>
  );
}

function Row({ label, children, last }: { label: string; children: ReactNode; last?: boolean }) {
  useLocale();
  const colors = useColors();
  return (
    <View style={[styles.row, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.separator }]}>
      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  form: { padding: 16, gap: 16 },
  group: { borderRadius: 16, paddingHorizontal: 14 },
  project: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48, gap: 12 },
  label: { fontSize: 16 },
  prompt: { borderRadius: 16, padding: 14, fontSize: 16, minHeight: 120, textAlignVertical: 'top' },
  starting: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
  empty: { fontSize: 15, textAlign: 'center', marginTop: 40 },
});
