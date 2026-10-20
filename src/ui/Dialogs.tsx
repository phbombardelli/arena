import { useEditorStore } from '@store/editorStore';
import { Dialog } from '@ui/common/Popover';
import { ArenaLibraryPanel } from '@ui/inspector/ArenaLibraryPanel';
import { SheetSettings } from '@ui/inspector/SheetSettings';

const ATALHOS: [string, string][] = [
  ['Ferramentas', ''],
  ['V', 'Selecionar'],
  ['H  ou  espaço segurado', 'Mover a vista'],
  ['O', 'Obstáculo'],
  ['T', 'Traçado à mão'],
  ['X', 'Texto'],
  ['Esc', 'Volta a Selecionar e limpa a seleção'],
  ['Vista', ''],
  ['roda do mouse', 'Zoom sob o cursor'],
  ['botão do meio', 'Mover a vista'],
  ['Ctrl+0', 'Ajustar à página'],
  ['G', 'Mostrar ou esconder a grade'],
  ['S', 'Ligar ou desligar o ímã'],
  ['Alt segurado', 'Soltar o ímã na hora'],
  ['Edição', ''],
  ['Ctrl+Z  /  Ctrl+Y', 'Desfazer  /  refazer'],
  ['Ctrl+C  /  V  /  D', 'Copiar  /  colar  /  duplicar'],
  ['Ctrl+V com um print copiado', 'Colar como imagem de fundo'],
  ['Ctrl+A', 'Selecionar tudo do modo atual'],
  ['setas  /  Shift+setas', 'Mover pelo passo do ímã  /  10 vezes'],
  ['Delete', 'Excluir a seleção'],
  ['Arquivo', ''],
  ['Ctrl+N  /  Ctrl+O', 'Novo  /  abrir'],
  ['Ctrl+S  /  Ctrl+Shift+S', 'Salvar  /  salvar como'],
  ['Ctrl+E', 'Exportar PDF'],
  ['Ctrl+P', 'Imprimir'],
];

/** As janelas abertas por menu. Só uma de cada vez. */
export function Dialogs() {
  const { dialog, setDialog } = useEditorStore();
  const fecha = () => setDialog(null);

  if (dialog === 'atalhos') {
    return (
      <Dialog title="Atalhos do teclado" onClose={fecha}>
        <table className="shortcuts">
          <tbody>
            {ATALHOS.map(([tecla, acao], i) =>
              acao === '' ? (
                <tr key={i} className="group">
                  <th colSpan={2}>{tecla}</th>
                </tr>
              ) : (
                <tr key={i}>
                  <td><kbd>{tecla}</kbd></td>
                  <td>{acao}</td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </Dialog>
    );
  }
  if (dialog === 'modelos') {
    return (
      <Dialog title="Modelos de pista" onClose={fecha}>
        <ArenaLibraryPanel />
      </Dialog>
    );
  }
  if (dialog === 'folha') {
    return (
      <Dialog title="Configurar folha" onClose={fecha}>
        <SheetSettings />
      </Dialog>
    );
  }
  if (dialog === 'sobre') {
    return (
      <Dialog title="Sobre o Percurso" onClose={fecha}>
        <p>Editor de croquis de percurso de salto. Funciona offline, sem servidor e sem nuvem.</p>
        <p className="note">O arquivo do croqui (.pcs) fica no seu computador.</p>
      </Dialog>
    );
  }
  return null;
}
