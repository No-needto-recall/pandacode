import { initLocale } from './i18n';

void initLocale().catch(error => console.error('Could not load language preference', error))
  .then(() => import('./agents-dock-window'));
