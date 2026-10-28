'use no memo';
// Translation helpers read the subscribed locale; React Compiler must not cache constant-key calls.
import { errorText, t as msg } from '../i18n.ts';
import { useLocale } from './locale.ts';
// The iPhone Duo's empty right pane (split.tsx): "What should we work on?" with project and
// computer pickers, and a composer whose send starts the task (useNewTask) and opens it.
import { router, Stack } from 'expo-router';
import { frame } from '@expo/ui/swift-ui/modifiers';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Round, SIZE } from './Composer.tsx';
import { Glass } from './Glass.tsx';
import { ProjectTile } from './ProjectTile.tsx';
import { HarnessLogo, harnessName } from './harness.tsx';
import { Icon } from './Icon.tsx';
import { Menu, TextMenu, ViewMenu, type MenuItem } from './Menu.tsx';
import { interactiveGlass, nativeGlass } from './NativeGlass.tsx';
import { toggleSidebar, useSidebar } from './split.tsx';
import { MODES } from './status.tsx';
import { useBackdrop } from './Backdrop.tsx';
import { useColors } from './theme.ts';
import { useNewTask } from './useNewTask.ts';

export function NewThread() {
  useLocale();
  const colors = useColors();
  const backdrop = useBackdrop();
  const insets = useSafeAreaInsets();
  const form = useNewTask();
  const { hosts, deviceId, projects, projectId, provider, options, model, effort, efforts, mode, worktree, starting, pick } = form;
  const [prompt, setPrompt] = useState('');
  const host = hosts.find(h => h.id === deviceId);
  const project = projects.find(p => p.id === projectId);
  const collapsed = useSidebar(s => s.collapsed);

  const send = async () => {
    if (!form.canStart(prompt)) return;
    try {
      const { sessionId: session, note } = await form.start(prompt);
      setPrompt('');
      form.setStarting(false);
      router.push({ pathname: '/task/[device]/[session]', params: { device: deviceId, session } });
      if (note) Alert.alert(msg("mobile.text.started_in_a_worktree"), note.replace(/^Started in a worktree: /, ''), [{ text: msg('mobile.text.ok') }]);
    } catch (e) {
      Alert.alert(msg("mobile.text.could_not_start_the_task"), errorText(e), [{ text: msg('mobile.text.ok') }]);
    }
  };

  // Projectless chats live in their own "Chat" projects; they aren't something to pick here.
  const chats = new Set(form.list?.tasks.filter(t => t.chat).map(t => t.projectId));
  const projectItems: MenuItem[] = projects.filter(p => !chats.has(p.id)).map(p => ({ label: p.name, ios: 'folder', android: 'folder', checked: p.id === projectId, onPress: () => pick({ projectId: p.id }) }));
  const computerItems: MenuItem[] = hosts.map(h => ({ label: h.name, ios: 'desktopcomputer', android: 'computer', checked: h.id === deviceId, onPress: () => form.pickDevice(h.id) }));
  const optionItems: MenuItem[] = [
    { label: msg("mobile.text.new_worktree"), ios: 'arrow.triangle.branch', android: 'call_split', checked: worktree, onPress: () => form.setWorktree(w => !w) },
    ...MODES.map(m => ({ label: m.label, section: msg("mobile.text.permissions"), checked: m.id === mode, onPress: () => pick({ mode: m.id }) })),
    ...efforts.map(e => ({ label: e.label, section: msg("mobile.text.effort"), checked: e.value === effort, onPress: () => pick({ effort: e.value }) })),
  ];
  const harnessItems: MenuItem[] = [
    ...options.harnesses.map(h => ({ label: h.label, section: msg("mobile.text.harness"), checked: h.value === provider, onPress: () => form.pickProvider(h.value) })),
    ...[{ value: 'default', label: msg("mobile.text.default") }, ...options.models.filter(m => m.value !== 'default')]
      .map(m => ({ label: m.label, section: msg("mobile.text.model"), checked: m.value === model, onPress: () => form.pickModel(m.value) })),
  ];
  const ready = form.canStart(prompt);

  return (
    <KeyboardAvoidingView behavior="padding" style={[styles.pane, { paddingLeft: insets.left, paddingRight: insets.right, backgroundColor: backdrop.background }]}>
      <Stack.Screen options={{ title: msg("mobile.text.new_thread") }} />
      {/* Native items, so iOS puts them in the rail; only the Duo's split view shows this pane. */}
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button icon="sidebar.left" accessibilityLabel={collapsed ? msg("mobile.text.show_sidebar") : msg("mobile.text.hide_sidebar")} onPress={toggleSidebar} />
      </Stack.Toolbar>
      <View style={styles.center}>
        <Text style={[styles.title, { color: colors.text }]}>{msg("mobile.text.what_should_we_work_on")}</Text>
        {hosts.length ? (
          <View style={styles.pickers}>
            {project ? (
              <View style={styles.project}>
                <ProjectTile deviceId={deviceId} projectId={project.id} name={project.name} size={20} />
                <TextMenu text={project.name} label={msg("mobile.text.project")} items={projectItems} color={colors.secondary} />
              </View>
            ) : <TextMenu ios="folder" android="folder" text={msg("mobile.text.pick_a_project")} label={msg("mobile.text.project")} items={projectItems} color={colors.secondary} />}
            <TextMenu ios="desktopcomputer" android="computer" text={msg('mobile.computer.on', { name: host?.name ?? '' })} label={msg("mobile.text.computer")} items={computerItems} color={colors.secondary} />
          </View>
        ) : <Text style={[styles.note, { color: colors.secondary }]}>{msg("mobile.text.no_computer_with_remote_access_is_online")}</Text>}
      </View>
      <Glass style={[styles.bar, { marginBottom: Math.max(insets.bottom, 10) }]}>
        <TextInput value={prompt} onChangeText={setPrompt} placeholder={starting ? msg("mobile.text.starting_on_the_computer") : msg("mobile.text.ask_the_agent")} placeholderTextColor={colors.tertiary as string}
          multiline editable={!starting} style={[styles.input, { color: colors.text }]} accessibilityLabel={msg("mobile.text.message")} />
        <View style={styles.row}>
          <Menu ios="plus" android="add" color={colors.text} label={msg("mobile.text.more_options")} items={optionItems}
            modifiers={nativeGlass ? [frame({ width: SIZE, height: SIZE }), interactiveGlass('circle')] : undefined}>
            {icon => (nativeGlass ? icon : <View style={[styles.round, { backgroundColor: colors.fill }]}>{icon}</View>)}
          </Menu>
          <View style={styles.spacer} />
          {!!provider && (
            <ViewMenu label={`${harnessName(provider)} model`} items={harnessItems}>
              <View style={styles.harness}>
                <HarnessLogo id={provider} size={18} />
                <Icon ios="chevron.down" android="expand_more" size={11} color={colors.secondary} />
              </View>
            </ViewMenu>
          )}
          <Round label={msg("mobile.text.send")} ios="arrow.up" android="arrow_upward" onPress={send} disabled={!ready}
            bg={ready ? colors.tint : colors.fill} fg={ready ? colors.onTint : colors.tertiary} />
        </View>
      </Glass>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  pane: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 18, paddingHorizontal: 24 },
  title: { fontSize: 30, fontWeight: '700', letterSpacing: -0.5, textAlign: 'center' },
  project: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pickers: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 24 },
  note: { fontSize: 15 },
  bar: { borderRadius: 26, marginHorizontal: 12, padding: 8, gap: 4, borderCurve: 'continuous' },
  input: { fontSize: 16, maxHeight: 140, minHeight: SIZE, paddingTop: 6, paddingBottom: 6, paddingHorizontal: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  spacer: { flex: 1 },
  harness: { flexDirection: 'row', alignItems: 'center', gap: 4, height: SIZE, paddingHorizontal: 6 },
  round: { width: SIZE, height: SIZE, borderRadius: SIZE / 2, alignItems: 'center', justifyContent: 'center' },
});
