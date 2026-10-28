import { MapWizardHost } from '@ui/mapWizard/MapWizard';
import { useEffect } from 'react';
import { installUnloadGuard } from './actions/documentActions';
import { Canvas } from './canvas/Canvas';
import { Dialogs } from './Dialogs';
import { DocumentPanel } from './inspector/DocumentPanel';
import { Sidebar } from './sidebar/Sidebar';
import { StatusBar } from './StatusBar';
import { Toolbar } from './toolbar/Toolbar';
import { ExerciseDialog } from './gym/ExerciseDialog';
import { applyUpdate, usePwa } from '@platform/pwa';
import { useLang } from './i18n/useLang';
import { t } from '@core/i18n/i18n';

export function App() {
  useEffect(installUnloadGuard, []);
  // Trocar a língua remonta a interface inteira: todo texto sai de novo do
  // catálogo. O croqui e o estado do editor moram nos stores e ficam.
  const lang = useLang();

  return (
    <div className="app" key={lang}>
      <Toolbar />
      <div className="workspace">
        <Sidebar />
        <Canvas />
        <DocumentPanel />
      </div>
      <StatusBar />
      <Dialogs />
      <MapWizardHost />
      <UpdateNotice />
      <ExerciseDialog />
    </div>
  );
}

/** Versão nova baixada: avisa, e só recarrega quando o usuário pedir. */
function UpdateNotice() {
  const { atualizacao } = usePwa();
  if (!atualizacao) return null;
  return (
    <div className="update-notice" role="status">
      <span>{t('aviso.versaoNova')}</span>
      <button className="primary" onClick={applyUpdate}>
        {t('aviso.recarregar')}
      </button>
    </div>
  );
}
