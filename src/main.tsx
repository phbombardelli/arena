import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@ui/App';
import { setupPwa } from '@platform/pwa';
import { initTemplateStore } from '@platform/templateStore';
import { setupCloud } from '@platform/cloud';
import { setupLangPrefs } from '@platform/langPrefs';
import '@fontsource-variable/manrope';
import './styles.css';

setupLangPrefs();
setupPwa();
void initTemplateStore();
setupCloud();

// Ponte de verificação automatizada: só existe em desenvolvimento.
if (import.meta.env.DEV) {
  void import('@platform/devBridge').then((m) => m.installDevBridge());
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
