import type { ConfigContext, ExpoConfig } from 'expo/config';

// Connect build config. Both names must also be present when Gradle invokes Metro.
const ALIASES = { EXPO_PUBLIC_PANDACODE_RELAY_URL: 'PANDACODE_RELAY_URL', EXPO_PUBLIC_PANDACODE_GITHUB_CLIENT_ID: 'PANDACODE_GITHUB_CLIENT_ID' };
for (const [expo, desktop] of Object.entries(ALIASES)) {
  if (!process.env[expo] && process.env[desktop]) process.env[expo] = process.env[desktop];
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const preview = process.env.PANDACODE_ANDROID_PREVIEW === '1';
  const versionCode = Number(process.env.PANDACODE_ANDROID_VERSION_CODE ?? config.android?.versionCode ?? 1);
  if (preview && (!Number.isSafeInteger(versionCode) || versionCode < 1 || versionCode > 2_100_000_000)) {
    throw new Error('PANDACODE_ANDROID_VERSION_CODE must be a positive Android version code.');
  }
  const extra: NonNullable<ExpoConfig['extra']> = {
    ...config.extra,
    relayUrl: process.env.EXPO_PUBLIC_PANDACODE_RELAY_URL ?? '',
    githubClientId: process.env.EXPO_PUBLIC_PANDACODE_GITHUB_CLIENT_ID ?? '',
  };
  if (preview) delete extra.eas;
  return {
    ...config,
    name: preview ? 'PandaCode 中文预览' : config.name ?? 'PandaCode',
    slug: preview ? 'pandacode-zh-preview' : config.slug ?? 'pandacode',
    ...(preview ? {
      owner: undefined,
      platforms: ['android'],
      plugins: config.plugins?.filter(plugin => (Array.isArray(plugin) ? plugin[0] : plugin) !== 'expo-widgets'),
      android: {
        ...config.android,
        package: 'io.github.norecall.pandacode.zhpreview',
        versionCode,
      },
    } : {}),
    extra,
  };
};
