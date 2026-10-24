import { HeightsEditor } from '@ui/inspector/HeightsEditor';
import { useEditorStore } from '@store/editorStore';
import { Dialog } from '@ui/common/Popover';
import { NewCourseDialogBody, OpenCourseDialogBody, PistasDialogBody } from '@ui/files/FileDialogs';
import { SheetSettings } from '@ui/inspector/SheetSettings';
import { AdminPanelBody, CloudConsentBody } from '@ui/cloud/CloudUI';

const ATALHOS: [string, string][] = [
  ['Ferramentas', ''],
  ['V', 'Selecionar'],
  ['H  ou  espaço segurado', 'Mover a vista'],
  ['O', 'Obstáculo'],
  ['T', 'Traçado à mão'],
  ['X', 'Texto'],
  ['M', 'Trena (Shift: perpendicular ou paralela à cerca)'],
  ['Esc', 'Volta a Selecionar e limpa a seleção'],
  ['Vista', ''],
  ['roda do mouse', 'Zoom sob o cursor'],
  ['botão do meio', 'Mover a vista'],
  ['Ctrl+0', 'Ajustar à página'],
  ['G', 'Mostrar ou esconder a grade'],
  ['Edição', ''],
  ['Ctrl+Z  /  Ctrl+Y', 'Desfazer  /  refazer'],
  ['Ctrl+C  /  V  /  D', 'Copiar  /  colar  /  duplicar'],
  ['Ctrl+V com um print copiado', 'Colar como imagem de fundo'],
  ['Ctrl+A', 'Selecionar tudo do modo atual'],
  ['Ctrl+G  /  Ctrl+Shift+G', 'Vincular  /  desvincular'],
  ['Alt + clique', 'Pegar só um elemento vinculado'],
  ['setas  /  Shift+setas', 'Mover 10 cm  /  1 m'],
  ['Alt+setas', 'Obstáculo preso desliza sobre o traçado'],
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
      <Dialog title="Pistas" onClose={fecha}>
        <PistasDialogBody />
      </Dialog>
    );
  }
  if (dialog === 'novo') {
    return (
      <Dialog title="Novo percurso" onClose={fecha}>
        <NewCourseDialogBody />
      </Dialog>
    );
  }
  if (dialog === 'nova-ginastica') {
    return (
      <Dialog title="Nova ginástica" onClose={fecha}>
        <NewCourseDialogBody kind="ginastica" />
      </Dialog>
    );
  }
  if (dialog === 'nuvem') {
    return (
      <Dialog title="Backup na nuvem" onClose={fecha}>
        <CloudConsentBody />
      </Dialog>
    );
  }
  if (dialog === 'admin') {
    return (
      <Dialog title="Painel de admin" onClose={fecha}>
        <AdminPanelBody />
      </Dialog>
    );
  }
  if (dialog === 'abrir') {
    return (
      <Dialog title="Abrir percurso" onClose={fecha}>
        <OpenCourseDialogBody />
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
  if (dialog === 'alturas') {
    return (
      <Dialog title="Alturas dos obstáculos" onClose={fecha}>
        <HeightsEditor />
      </Dialog>
    );
  }
  if (dialog === 'sobre') {
    return (
      <Dialog title="Sobre o Arena" onClose={fecha}>
        <p>Editor de croquis de percurso de salto. Funciona offline, sem servidor e sem nuvem.</p>
        <p className="note">O arquivo do croqui (.pcs) fica no seu computador.</p>
      </Dialog>
    );
  }
  return null;
}
