import { t as msg } from '../i18n.ts';
// Build config (docs/remote-access.md, Accounts). Values come from app.config.ts `extra`
// (read when Metro starts or the app is built), or EXPO_PUBLIC_* inlined into the bundle.
import Constants from 'expo-constants';

export interface Build { relay: string; clientId: string }

const extra = (Constants.expoConfig?.extra ?? {}) as { relayUrl?: string; githubClientId?: string };
const relay = (process.env.EXPO_PUBLIC_PANDACODE_RELAY_URL || extra.relayUrl || '').trim().replace(/\/+$/, '');
const clientId = (process.env.EXPO_PUBLIC_PANDACODE_GITHUB_CLIENT_ID || extra.githubClientId || '').trim();

/** Why Connect is off in this build, or '' when it is configured. */
export const configProblem = () =>
  !relay ? msg("mobile.text.no_relay_url_was_set_pandacode_relay_url")
  : !/^https:\/\/[^/\s]+$/.test(relay) ? msg('mobile.error.relay_url', { url: relay })
  : !clientId ? msg("mobile.text.no_github_client_id_was_set_pandacode_github_client_id")
  : '';

export const build: Build | null = configProblem() ? null : { relay, clientId };
export const NOT_CONFIGURED = "PandaCode Connect is not configured in this build.";
