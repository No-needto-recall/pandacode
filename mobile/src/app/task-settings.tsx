'use no memo';
// Translation helpers read the subscribed locale; React Compiler must not cache constant-key calls.
import { errorText, t as msg } from '../i18n.ts';
import { useLocale } from '../ui/locale.ts';
// Model & permissions for one task, in a sheet: harness, model, effort and mode (task.configure).
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { connect } from '../connect/client.ts';
import type { TaskSummary } from '../connect/types.ts';
import { useConnect } from '../store/index.ts';
import { Choice } from '../ui/Choice.tsx';
import { HarnessLogo } from '../ui/harness.tsx';
import { Icon } from '../ui/Icon.tsx';
import { useModelOptions } from '../ui/models.ts';
import { MODES } from '../ui/status.tsx';
import { useColors } from '../ui/theme.ts';

type Settings = Pick<TaskSummary, 'provider' | 'model' | 'effort' | 'mode'>;

export default function TaskSettings() {
  useLocale();
  const { device = '', session = '' } = useLocalSearchParams<{ device: string; session: string }>();
  const task = useConnect(s => s.tasks[device]?.tasks.find(t => t.sessionId === session));
  const colors = useColors();
  if (!task) return <Text style={[styles.empty, { color: colors.secondary }]}>{msg("mobile.text.this_task_is_not_loaded_yet")}</Text>;
  return <Form deviceId={device} sessionId={session} task={task} />;
}

function Form({ deviceId, sessionId, task }: { deviceId: string; sessionId: string; task: TaskSummary }) {
  useLocale();
  const colors = useColors();
  const [settings, setSettings] = useState<Settings>({ provider: task.provider, model: task.model, effort: task.effort, mode: task.mode });
  const options = useModelOptions(deviceId, settings.provider);
  const configure = async (change: Partial<Settings>) => {
    const before = settings;
    setSettings(s => ({ ...s, ...change }));
    void Haptics.selectionAsync();
    try {
      await connect.configureTask(deviceId, { sessionId, ...change });
    } catch (error) {
      setSettings(before);
      Alert.alert(msg("mobile.text.could_not_change_settings"), errorText(error), [{ text: msg('mobile.text.ok') }]);
    }
  };
  const efforts = options.efforts(settings.model);
  return (
    <ScrollView style={{ backgroundColor: colors.grouped }} contentContainerStyle={styles.page} contentInsetAdjustmentBehavior="automatic">
      <View style={[styles.group, { backgroundColor: colors.card }]}>
        <Row icon={<HarnessLogo id={settings.provider} size={18} />} label={msg("mobile.text.harness")}>
          {options.harnesses.length > 0 ? <Choice value={settings.provider} options={options.harnesses} onChange={provider => provider !== settings.provider && configure({ provider, model: 'default', effort: null })} />
            : <Text style={{ color: colors.secondary }}>{settings.provider}</Text>}
        </Row>
        <Row icon={<Icon ios="cpu" android="memory" size={17} color={colors.tint} />} label={msg("mobile.text.model")}>
          {options.models.length > 0 ? <Choice value={settings.model} options={options.models} onChange={model => configure({ provider: settings.provider, model, effort: options.defaultEffort(model) })} />
            : <Text style={{ color: colors.secondary }}>{settings.model}</Text>}
        </Row>
        {efforts.length > 0 && (
          <Row icon={<Icon ios="gauge.with.dots.needle.67percent" android="speed" size={17} color={colors.tint} />} label={msg("mobile.text.effort")}>
            <Choice value={settings.effort ?? ''} options={efforts} onChange={effort => configure({ effort })} />
          </Row>
        )}
        <Row icon={<Icon ios="lock.shield" android="shield" size={17} color={colors.tint} />} label={msg("mobile.text.permissions")} last>
          <Choice value={settings.mode} options={MODES.map(m => ({ value: m.id, label: m.label }))} onChange={mode => configure({ mode })} />
        </Row>
      </View>
      <Text style={[styles.footer, { color: colors.secondary }]}>{msg("mobile.text.changes_apply_from_the_next_message")}</Text>
    </ScrollView>
  );
}

function Row({ icon, label, children, last }: { icon: ReactNode; label: string; children: ReactNode; last?: boolean }) {
  useLocale();
  const colors = useColors();
  return (
    <View style={[styles.row, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.separator }]}>
      <View style={styles.icon}>{icon}</View>
      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 8 },
  group: { borderRadius: 16, paddingHorizontal: 14, borderCurve: 'continuous' },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 50, gap: 10 },
  icon: { width: 22, alignItems: 'center' },
  label: { flex: 1, fontSize: 16 },
  footer: { fontSize: 13, marginHorizontal: 14 },
  empty: { fontSize: 15, textAlign: 'center', marginTop: 40 },
});
