import { MapWizardHost } from '@ui/mapWizard/MapWizard';
import { useEffect } from 'react';
import { installUnloadGuard } from './actions/documentActions';
import { Canvas } from './canvas/Canvas';
import { Dialogs } from './Dialogs';
import { DocumentPanel } from './inspector/DocumentPanel';
import { Sidebar } from './sidebar/Sidebar';
import { StatusBar } from './StatusBar';
import { Toolbar } from './toolbar/Toolbar';
import { applyUpdate, usePwa } from '@platform/pwa';

export function App() {
  useEffect(installUnloadGuard, []);

  return (
    <div className="app">
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
    </div>
  );
}

/** Versão nova baixada: avisa, e só recarrega quando o usuário pedir. */
function UpdateNotice() {
  const { atualizacao } = usePwa();
  if (!atualizacao) return null;
  return (
    <div className="update-notice" role="status">
      <span>Há uma versão nova do Arena. Salve o croqui e recarregue quando quiser.</span>
      <button className="primary" onClick={applyUpdate}>
        Recarregar agora
      </button>
    </div>
  );
}
