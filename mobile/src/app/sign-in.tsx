'use no memo';
// Translation helpers read the subscribed locale; React Compiler must not cache constant-key calls.
import { errorText, t as msg } from '../i18n.ts';
import { useLocale } from '../ui/locale.ts';
// GitHub device flow: show the code, copy it, open the verification page, wait for approval.
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { connect } from '../connect/client.ts';
import type { SignInCode } from '../connect/auth.ts';
import { useStatus } from '../store/index.ts';
import { Glass } from '../ui/Glass.tsx';
import { Button } from '../ui/requests.tsx';
import { mono, useColors } from '../ui/theme.ts';
import { configProblem } from '../connect/config.ts';

const icon = require('../../assets/images/icon.png');

export default function SignIn() {
  useLocale();
  const colors = useColors();
  const status = useStatus();
  const [code, setCode] = useState<SignInCode | null>(null);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);
  const [copied, setCopied] = useState(false);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; connect.signInCancel(); }, []);

  const start = async () => {
    setError('');
    setStarting(true);
    try {
      const next = await connect.signInStart();
      setCode(next);
      setStarting(false);
      await connect.signInFinish(next);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      if (!alive.current) return;
      setCode(null);
      setStarting(false);
      setError(errorText(e));
    }
  };
  const cancel = () => { connect.signInCancel(); setCode(null); };
  const demo = () => connect.enterDemo().catch(e => setError(errorText(e)));
  const explore = <Button label={msg("mobile.text.explore_the_demo")} onPress={demo} />;
  const copy = async () => {
    if (!code) return;
    await Clipboard.setStringAsync(code.userCode);
    void Haptics.selectionAsync();
    setCopied(true);
  };

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={styles.top}>
        <Image source={icon} style={styles.icon} accessibilityIgnoresInvertColors />
        <Text style={[styles.title, { color: colors.text }]}>PandaCode</Text>
        <Text style={[styles.lead, { color: colors.secondary }]}>{msg("mobile.text.see_and_steer_the_tasks_running_on_your_computers_tasks_never_run_on_this_phone")}</Text>
      </View>
      {!status.configured ? (
        <Glass style={styles.card}>
          <Text style={[styles.body, { color: colors.text }]}>{msg("mobile.text.pandacode_connect_is_not_configured_in_this_build")}</Text>
          <Text style={[styles.small, { color: colors.secondary }]}>{configProblem()} {msg("mobile.text.put_pandacode_relay_url_and_pandacode_github_client_id_in_mobile_env_or_the_shell_then_res")}</Text>
          {explore}
        </Glass>
      ) : code ? (
        <Glass style={styles.card}>
          <Text style={[styles.small, { color: colors.secondary }]}>{msg("mobile.text.enter_this_code_on_github")}</Text>
          <Pressable onPress={copy} accessibilityRole="button" accessibilityLabel={msg('mobile.signin.copy_code', { code: code.userCode })}>
            <Text selectable style={[styles.code, { color: colors.text }]}>{code.userCode}</Text>
          </Pressable>
          <View style={styles.actions}>
            <Button label={copied ? msg("mobile.text.copied") : msg("mobile.text.copy_code")} onPress={copy} />
            <Button label={msg("mobile.text.open_github")} kind="primary" onPress={() => { void copy(); void WebBrowser.openBrowserAsync(code.verificationUri); }} />
          </View>
          <View style={styles.waiting}>
            <ActivityIndicator />
            <Text style={[styles.small, { color: colors.secondary }]}>{msg("mobile.text.waiting_for_github")}</Text>
          </View>
          <Button label={msg("mobile.text.cancel")} onPress={cancel} />
        </Glass>
      ) : (
        <View style={styles.bottom}>
          {!!(error || status.error) && <Text style={[styles.small, { color: colors.red, textAlign: 'center' }]}>{errorText(error || status.error)}</Text>}
          {starting ? <ActivityIndicator /> : <Button label={msg("mobile.text.sign_in_with_github")} kind="primary" onPress={start} />}
          {!starting && explore}
          <Text style={[styles.small, styles.hint, { color: colors.secondary }]}>{msg("mobile.text.no_computer_yet_the_demo_shows_sample_computers_and_tasks_with_nothing_sent_anywhere")}</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 24, justifyContent: 'space-between' },
  top: { alignItems: 'center', gap: 10, marginTop: 48 },
  icon: { width: 96, height: 96, borderRadius: 22 },
  title: { fontSize: 34, fontWeight: '700' },
  lead: { fontSize: 17, textAlign: 'center', lineHeight: 23 },
  card: { borderRadius: 28, padding: 20, gap: 14, alignItems: 'center' },
  body: { fontSize: 17, textAlign: 'center' },
  small: { fontSize: 14, lineHeight: 19 },
  code: { fontFamily: mono, fontSize: 34, fontWeight: '600', letterSpacing: 4 },
  actions: { flexDirection: 'row', gap: 10 },
  waiting: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  bottom: { gap: 14, marginBottom: 12 },
  hint: { textAlign: 'center' },
});
