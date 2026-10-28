'use no memo';
// Translation helpers read the subscribed locale; React Compiler must not cache constant-key calls.
import { useLocale } from '../../../ui/locale.ts';
import { t as msg } from '../../../i18n.ts';
import { router } from 'expo-router';
import { memo, useCallback } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { connect } from '../../../connect/client.ts';
import { useDevices, useStatus, type DeviceRow } from '../../../store/index.ts';
import { useBackdrop } from '../../../ui/Backdrop.tsx';

const Row = memo(function Row({ device }: { device: DeviceRow }) {
  useLocale();
  const colors = useBackdrop();
  const open = device.host;
  return (
    <Pressable disabled={!open} onPress={() => router.navigate('/inbox')}
      style={({ pressed }) => [styles.row, { backgroundColor: colors.card, opacity: pressed ? 0.7 : 1 }]} accessibilityRole={open ? 'button' : undefined}>
      <View style={[styles.dot, { backgroundColor: device.online ? colors.green : colors.tertiary }]} accessibilityLabel={device.online ? msg("mobile.text.online") : msg("mobile.text.offline")} />
      <View style={styles.main}>
        <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>{device.name}</Text>
        <Text style={[styles.detail, { color: colors.secondary }]}>{device.platform}{device.online ? ' ' + msg('mobile.text.online_415416') : ' ' + msg('mobile.text.offline_584fb6')}</Text>
        {!device.host && <Text style={[styles.detail, { color: colors.orange }]}>{msg("mobile.text.remote_control_is_off_on_this_computer_turn_on_allow_remote_control_in_settings_remote_acc")}</Text>}
      </View>
    </Pressable>
  );
});

export default function Computers() {
  useLocale();
  const colors = useBackdrop();
  const all = useDevices();
  const { connected } = useStatus();
  const insets = useSafeAreaInsets();
  const devices = all.filter(d => !d.current);
  const refresh = useCallback(() => { connect.refreshDevices().catch(() => undefined); }, []);
  return (
    <FlatList
      style={{ backgroundColor: colors.grouped }}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={[styles.list, { paddingLeft: 16 + insets.left, paddingRight: 16 + insets.right }]}
      data={devices}
      keyExtractor={d => d.id}
      renderItem={({ item }) => <Row device={item} />}
      onRefresh={refresh}
      refreshing={false}
      ItemSeparatorComponent={() => <View style={styles.gap} />}
      ListEmptyComponent={<Text style={[styles.empty, { color: colors.secondary }]}>{connected ? msg("mobile.text.no_other_devices_on_this_account_yet_sign_in_to_pandacode_connect_on_your_computer") : msg("mobile.text.connecting")}</Text>}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, padding: 14 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  main: { flex: 1, gap: 2 },
  name: { fontSize: 17, fontWeight: '600' },
  detail: { fontSize: 13 },
  gap: { height: 10 },
  empty: { fontSize: 15, textAlign: 'center', marginTop: 40 },
});
