'use no memo';
// Translation helpers read the subscribed locale; React Compiler must not cache constant-key calls.
import { errorText, t as msg } from '../../../i18n.ts';
import { setLocale, useLocale } from '../../../ui/locale.ts';

import Constants from 'expo-constants';
import { Image } from 'expo-image';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { connect } from '../../../connect/client.ts';
import { enableNotifications, notificationsGranted } from '../../../ui/push.ts';
import { useStatus } from '../../../store/index.ts';
import { clearLocal } from '../../../store/local.ts';
import { APPEARANCES, setAppearance, useAppearance } from '../../../ui/appearance.ts';
import { useBackdrop } from '../../../ui/Backdrop.tsx';
import { WallpaperSettings } from '../../../ui/WallpaperSettings.tsx';

const SOURCE = 'https://github.com/aicodeking/pandacode';
const SUPPORT = `${SOURCE}/issues`;
// The website (website/, Worker pandacode-site) has no domain in the repo; confirm this one before release.
const SITE = 'https://pandacode.bambooed.ai';
const PRIVACY = `${SITE}/privacy`;

export default function Settings() {
  const locale = useLocale();
  const colors = useBackdrop();
  const status = useStatus();
  const insets = useSafeAreaInsets();
  const appearance = useAppearance(s => s.choice);
  const [pushOn, setPushOn] = useState<boolean | null>(null);
  useEffect(() => { void notificationsGranted().then(setPushOn).catch(() => undefined); }, []);
  const enable = () => { void (async () => {
    try {
      const ok = await enableNotifications();
      setPushOn(ok);
      if (!ok) Alert.alert(msg("mobile.text.notifications_are_off"), msg("mobile.text.allow_them_in_ios_settings_to_hear_when_a_task_needs_you"), [{ text: msg('mobile.text.ok') }]);
    } catch { setPushOn(false); }
  })(); };
  const [deleting, setDeleting] = useState(false);
  const signOut = () => Alert.alert(msg("mobile.text.sign_out"), msg("mobile.text.this_phone_stops_seeing_your_computers_until_you_sign_in_again"), [
    { text: msg("mobile.text.cancel"), style: 'cancel' },
    { text: msg("mobile.text.sign_out_dc1649"), style: 'destructive', onPress: () => void connect.signOut() },
  ]);
  const remove = async () => {
    setDeleting(true);
    try {
      await connect.deleteAccount();
      await clearLocal();
    } catch (error) {
      setDeleting(false);
      Alert.alert(msg("mobile.text.could_not_delete_the_account"), errorText(error), [{ text: msg('mobile.text.ok') }]);
    }
  };
  const deleteAccount = () => Alert.alert(
    msg("mobile.text.delete_your_account"),
    msg("mobile.text.this_removes_your_account_and_every_device_signed_in_to_it_phones_and_computers_from_the_p"),
    [{ text: msg("mobile.text.cancel"), style: 'cancel' }, { text: msg("mobile.text.delete_account"), style: 'destructive', onPress: () => void remove() }],
  );
  const link = (label: string, url: string) => (
    <Pressable onPress={() => void WebBrowser.openBrowserAsync(url)} accessibilityRole="link"><Text style={[styles.value, { color: colors.tint }]}>{label}</Text></Pressable>
  );
  return (
    <ScrollView style={{ backgroundColor: colors.grouped }} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={[styles.page, { paddingLeft: 16 + insets.left, paddingRight: 16 + insets.right }]}>
      {status.demo ? (
        <Section title={msg("mobile.text.account")} footer={msg("mobile.text.sample_computers_and_tasks_on_this_phone_only_nothing_is_sent_anywhere")}>
          <View style={styles.row}>
            <Text style={[styles.badge, { backgroundColor: colors.tint, color: colors.onTint }]}>{msg("mobile.text.demo")}</Text>
            <Text style={[styles.value, { flex: 1, color: colors.text }]}>{msg("mobile.text.exploring_the_demo")}</Text>
          </View>
          <Pressable onPress={() => void connect.leaveDemo()} accessibilityRole="button"><Text style={[styles.value, { color: colors.tint }]}>{msg("mobile.text.leave_demo")}</Text></Pressable>
        </Section>
      ) : (
      <Section title={msg("mobile.text.account")}>
        <View style={styles.row}>
          {!!status.account?.avatarUrl && <Image source={status.account.avatarUrl} style={styles.avatar} />}
          <View style={{ flex: 1 }}>
            <Text style={[styles.value, { color: colors.text }]}>{status.account?.login ?? '—'}</Text>
            <Text style={[styles.small, { color: status.error ? colors.red : colors.secondary }]}>{(status.error ? errorText(status.error) : undefined) ?? (status.connected ? msg("mobile.text.connected") : msg("mobile.text.connecting"))}</Text>
          </View>
        </View>
        {deleting ? <ActivityIndicator /> : (
          <Pressable onPress={deleteAccount} accessibilityRole="button"><Text style={[styles.value, { color: colors.red }]}>{msg("mobile.text.delete_account_864027")}</Text></Pressable>
        )}
      </Section>
      )}
      <Section title={msg("mobile.text.notifications")} footer={msg("mobile.text.wake_this_phone_when_a_task_needs_approval_or_finishes_the_relay_learns_that_something_hap")}>
        <Pressable onPress={enable} accessibilityRole="button">
          <View style={styles.row}>
            <Text style={[styles.value, { color: colors.text, flex: 1 }]}>{pushOn ? msg("mobile.text.enabled") : msg("mobile.text.enable_notifications")}</Text>
            {!pushOn && <Text style={[styles.badge, { color: colors.tint }]}>{msg("mobile.text.enable")}</Text>}
          </View>
        </Pressable>
      </Section>
      <Section title={msg('mobile.settings.language')} footer={msg('mobile.settings.language_help')}>
        <View style={styles.chips} accessibilityRole="radiogroup">
          {([{ id: 'zh-CN', label: '简体中文' }, { id: 'en', label: 'English' }] as const).map(language => (
            <Pressable key={language.id} onPress={() => setLocale(language.id)} accessibilityRole="radio" accessibilityState={{ selected: locale === language.id }}
              style={[styles.chip, { backgroundColor: locale === language.id ? colors.tint : colors.fill }]}>
              <Text style={[styles.chipText, { color: locale === language.id ? colors.onTint : colors.text }]}>{language.label}</Text>
            </Pressable>
          ))}
        </View>
      </Section>
      <Section title={msg("mobile.text.appearance")} footer={msg("mobile.text.applies_to_this_app_only_system_follows_the_phone_s_light_or_dark_setting")}>
        <View style={styles.chips} accessibilityRole="radiogroup">
          {APPEARANCES.map(a => {
            const selected = appearance === a.id;
            return (
              <Pressable key={a.id} onPress={() => setAppearance(a.id)} accessibilityRole="radio" accessibilityState={{ selected }}
                style={[styles.chip, { backgroundColor: selected ? colors.tint : colors.fill }]}>
                <Text style={[styles.chipText, { color: selected ? colors.onTint : colors.text }]}>{a.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </Section>
      <Section title={msg("mobile.text.wallpaper")} footer={msg("mobile.text.the_desktop_s_daily_scenes_in_step_with_your_computer_each_day_has_a_morning_afternoon_and")}>
        <WallpaperSettings />
      </Section>
      {!status.demo && <Section>
        <Pressable onPress={signOut} accessibilityRole="button"><Text style={[styles.value, { color: colors.red }]}>{msg("mobile.text.sign_out_dc1649")}</Text></Pressable>
      </Section>}
      <Section title={msg("mobile.text.about")} footer={msg("mobile.text.pandacode_is_open_source_this_app_has_no_telemetry_it_talks_only_to_the_pandacode_connect_")}>
        <Text style={[styles.value, { color: colors.text }]}>PandaCode {Constants.expoConfig?.version ?? ''}</Text>
        {link(msg("mobile.text.privacy_policy"), PRIVACY)}
        {link(msg("mobile.text.support"), SUPPORT)}
        <Text style={[styles.small, { color: colors.secondary }]}>This is a fork of PandaCode</Text>
        {link('PandaCode', SOURCE)}
        {link(msg("mobile.text.source_code"), 'https://github.com/No-needto-recall/pandacode/tree/feat/zh-cn-localization')}
      </Section>
    </ScrollView>
  );
}

function Section({ title, footer, children }: { title?: string; footer?: string; children: ReactNode }) {
  useLocale();
  const colors = useBackdrop();
  return (
    <View style={styles.section}>
      {!!title && <Text style={[styles.header, { color: colors.secondary }]}>{title}</Text>}
      <View style={[styles.card, { backgroundColor: colors.card }]}>{children}</View>
      {!!footer && <Text style={[styles.small, styles.footer, { color: colors.secondary }]}>{footer}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 24 },
  section: { gap: 6 },
  header: { fontSize: 13, fontWeight: '600', textTransform: 'uppercase', marginLeft: 14 },
  card: { borderRadius: 16, padding: 14, gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  badge: { fontSize: 13, fontWeight: '600', borderRadius: 8, overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 2 },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  value: { fontSize: 17 },
  small: { fontSize: 13, lineHeight: 18 },
  footer: { marginHorizontal: 14 },
  chips: { flexDirection: 'row', gap: 8 },
  chip: { flex: 1, alignItems: 'center', borderRadius: 16, paddingVertical: 8 },
  chipText: { fontSize: 15, fontWeight: '500' },
});
