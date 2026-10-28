import { escape as escapeI18n } from './dom.ts';
import { t as tr, onLocaleChange } from './i18n.ts';
import { call } from './bridge';
interface Readiness { installed: boolean; acpReady: boolean; sessionReady: boolean; state: string; message: string; }
/** Explicit, metadata-only connection check. Installation alone cannot establish sign-in. */
export function mountProviderReadiness(host: HTMLElement): () => void {
  let disposed = false, pending = false, checkedOnce = false, failed = false;
  let lastResult: Readiness | null = null;
  host.classList.add('provider-readiness');
  host.innerHTML = `<div><span role="status">${escapeI18n(tr('modules.common.connection_not_checked'))}</span><button type="button" class="secondary-button">${escapeI18n(tr('modules.common.check_connection'))}</button></div><p hidden></p>`;
  const status = host.querySelector<HTMLElement>('[role="status"]')!;
  const button = host.querySelector<HTMLButtonElement>('button')!;
  const detail = host.querySelector<HTMLParagraphElement>('p')!;
  const check = async () => {
    if (pending || disposed) return;
    checkedOnce = true; failed = false; pending = true; button.disabled = true; button.textContent = tr('modules.common.checking');
    status.textContent = tr('modules.common.starting_acp'); detail.hidden = true;
    try {
      const result = await call<Readiness>('provider_check_connection', {provider:'antigravity'});
      if (disposed) return;
      lastResult = result;
      status.textContent = result.sessionReady ? tr('modules.common.connection_ready') : result.state === 'authenticationRequired' ? tr('modules.common.sign_in_required') : !result.installed ? tr('modules.common.acp_executable_missing') : result.acpReady ? tr('modules.common.session_unavailable') : tr('modules.common.acp_startup_failed');
      detail.textContent = result.message; detail.hidden = false;
    } catch (error) { failed = true; if (!disposed) { status.textContent = tr('modules.common.could_not_check_connection'); detail.textContent = String(error); detail.hidden = false; } }
    finally { pending = false; if (!disposed) { button.disabled = false; button.textContent = tr('modules.common.check_again'); } }
  };
  const disposeLocale = onLocaleChange(() => {
    button.textContent = pending ? tr('modules.common.checking') : checkedOnce ? tr('modules.common.check_again') : tr('modules.common.check_connection');
    const result = lastResult;
    status.textContent = pending ? tr('modules.common.starting_acp') : failed ? tr('modules.common.could_not_check_connection') : !result ? tr('modules.common.connection_not_checked') : result.sessionReady ? tr('modules.common.connection_ready') : result.state === 'authenticationRequired' ? tr('modules.common.sign_in_required') : !result.installed ? tr('modules.common.acp_executable_missing') : result.acpReady ? tr('modules.common.session_unavailable') : tr('modules.common.acp_startup_failed');
  });
  button.addEventListener('click', check);
  return () => { disposed = true; disposeLocale(); button.removeEventListener('click', check); };
}
