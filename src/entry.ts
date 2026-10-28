import { initLocale } from './i18n';

// Keep the launcher and menu bar popover isolated: importing main loads the full workspace and its listeners.
void initLocale().catch(error => console.error('Could not load language preference', error)).then(() => {
  const view = new URLSearchParams(location.search).get('view');
  if (view === 'launcher') {
    return import('./overlay');
  } else if (view === 'tray') {
    return import('./tray-popover');
  }
  return import('./main');
});
