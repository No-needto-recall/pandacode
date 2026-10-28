'use no memo';
// Translation helpers read the subscribed locale; React Compiler must not cache constant-key calls.
import { useLocale } from '../../../ui/locale.ts';
import { t as msg } from '../../../i18n.ts';
import { Stack } from 'expo-router';
import { hasGlass } from '../../../ui/Glass.tsx';

export default function Layout() {
  useLocale();
  return (
    <Stack screenOptions={{ headerLargeTitle: true, headerTransparent: hasGlass, headerShadowVisible: false }}>
      <Stack.Screen name="index" options={{ title: msg("mobile.text.settings") }} />
    </Stack>
  );
}
