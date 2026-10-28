import { t as tr } from './i18n.ts';
import { call } from './bridge';

interface SupportDetails { version: string; platform: string; architecture: string; }

/** Fetch only when expanded; copying is explicit and the exact text stays visible. */
export function mountSupportDetails(host: HTMLDetailsElement): () => void {
  const output = host.querySelector<HTMLTextAreaElement>('textarea')!;
  const copy = host.querySelector<HTMLButtonElement>('.support-copy')!;
  const retry = host.querySelector<HTMLButtonElement>('.support-retry')!;
  const status = host.querySelector<HTMLElement>('[role="status"]')!;
  let disposed = false, loading = false, loaded = false, copying = false;

  async function load(): Promise<void> {
    if (disposed || loaded || loading || !host.open) return;
    loading = true; retry.hidden = true; status.textContent = tr('modules.common.loading_app_details');
    try {
      const data = await call<SupportDetails>('support_details');
      if (disposed) return;
      output.value = `PandaCode: ${data.version}\nPlatform: ${data.platform}\nArchitecture: ${data.architecture}`;
      loaded = true; copy.disabled = false; status.textContent = '';
    } catch {
      if (!disposed) { status.textContent = tr('modules.common.could_not_load_app_details'); retry.hidden = false; }
    } finally { loading = false; }
  }
  async function copyDetails(): Promise<void> {
    if (!loaded || disposed || copying) return;
    copying = true; copy.setAttribute('aria-busy', 'true');
    try {
      await navigator.clipboard.writeText(output.value);
      if (!disposed) status.textContent = tr('modules.common.app_details_copied_paste_them_into_your_support_request');
    } catch {
      if (!disposed) {
        output.focus(); output.select();
        status.textContent = tr('modules.common.copy_the_selected_app_details_using_your_keyboard');
      }
    } finally { copying = false; copy.removeAttribute('aria-busy'); }
  }
  host.addEventListener('toggle', load); retry.addEventListener('click', load); copy.addEventListener('click', copyDetails);
  return () => { disposed = true; host.removeEventListener('toggle', load); retry.removeEventListener('click', load); copy.removeEventListener('click', copyDetails); };
}
