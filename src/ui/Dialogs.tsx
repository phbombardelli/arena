import { HeightsEditor } from '@ui/inspector/HeightsEditor';
import { useEditorStore } from '@store/editorStore';
import { Dialog } from '@ui/common/Popover';
import { NewCourseDialogBody, OpenCourseDialogBody, OtherKindDialogBody, PistasDialogBody } from '@ui/files/FileDialogs';
import { SheetSettings } from '@ui/inspector/SheetSettings';
import { AdminPanelBody, CloudConsentBody } from '@ui/cloud/CloudUI';
import { t } from '@core/i18n/i18n';
import { APP_VERSION } from '@core/persistence/serialize';
import { ContactForm } from '@ui/help/ContactForm';

/** A lista na língua atual: montada a cada abertura, não no carregamento. */
const atalhos = (): [string, string][] => [
  [t('atalho.grupoFerramentas'), ''],
  ['V', t('atalho.selecionar')],
  [t('atalho.teclaH'), t('atalho.moverVista')],
  ['O', t('atalho.obstaculo')],
  ['T', t('atalho.tracadoMao')],
  ['X', t('atalho.texto')],
  ['M', t('atalho.trena')],
  ['Esc', t('atalho.esc')],
  [t('atalho.grupoVista'), ''],
  [t('atalho.roda'), t('atalho.zoomCursor')],
  [t('atalho.botaoMeio'), t('atalho.moverVista')],
  ['Ctrl+0', t('atalho.ajustar')],
  ['G', t('atalho.grade')],
  [t('atalho.grupoEdicao'), ''],
  ['Ctrl+Z  /  Ctrl+Y', t('atalho.desfazer')],
  ['Ctrl+C  /  V  /  D', t('atalho.copiar')],
  [t('atalho.ctrlVPrint'), t('atalho.colarFundo')],
  ['Ctrl+A', t('atalho.selecionarTudo')],
  ['Ctrl+G  /  Ctrl+Shift+G', t('atalho.vincular')],
  [t('atalho.altClique'), t('atalho.pegarUm')],
  [t('atalho.setas'), t('atalho.mover')],
  [t('atalho.altSetas'), t('atalho.desliza')],
  ['Delete', t('atalho.excluir')],
  [t('atalho.grupoArquivo'), ''],
  ['Ctrl+N  /  Ctrl+O', t('atalho.novo')],
  ['Ctrl+S  /  Ctrl+Shift+S', t('atalho.salvar')],
  ['Ctrl+E', t('atalho.exportar')],
  ['Ctrl+P', t('atalho.imprimir')],
];

/** As janelas abertas por menu. Só uma de cada vez. */
export function Dialogs() {
  const { dialog, setDialog } = useEditorStore();
  const fecha = () => setDialog(null);

  if (dialog === 'atalhos') {
    return (
      <Dialog title={t('dialogo.atalhos')} onClose={fecha}>
        <table className="shortcuts">
          <tbody>
            {atalhos().map(([tecla, acao], i) =>
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
      <Dialog title={t('dialogo.pistas')} onClose={fecha}>
        <PistasDialogBody />
      </Dialog>
    );
  }
  if (dialog === 'novo') {
    return (
      <Dialog title={t('dialogo.novoPercurso')} onClose={fecha}>
        <NewCourseDialogBody />
      </Dialog>
    );
  }
  if (dialog === 'nova-ginastica') {
    return (
      <Dialog title={t('dialogo.novaGinastica')} onClose={fecha}>
        <NewCourseDialogBody kind="ginastica" />
      </Dialog>
    );
  }
  if (dialog === 'outro-ginastica' || dialog === 'outro-percurso') {
    const kind = dialog === 'outro-ginastica' ? 'ginastica' : 'percurso';
    return (
      <Dialog title={kind === 'ginastica' ? t('dialogo.ginastica') : t('dialogo.percurso')} onClose={fecha}>
        <OtherKindDialogBody kind={kind} />
      </Dialog>
    );
  }
  if (dialog === 'nuvem') {
    return (
      <Dialog title={t('dialogo.backup')} onClose={fecha}>
        <CloudConsentBody />
      </Dialog>
    );
  }
  if (dialog === 'admin') {
    return (
      <Dialog title={t('dialogo.admin')} onClose={fecha}>
        <AdminPanelBody />
      </Dialog>
    );
  }
  if (dialog === 'abrir') {
    return (
      <Dialog title={t('dialogo.abrirPercurso')} onClose={fecha}>
        <OpenCourseDialogBody />
      </Dialog>
    );
  }
  if (dialog === 'folha') {
    return (
      <Dialog title={t('dialogo.configurarFolha')} onClose={fecha}>
        <SheetSettings />
      </Dialog>
    );
  }
  if (dialog === 'alturas') {
    return (
      <Dialog title={t('dialogo.alturas')} onClose={fecha} fundoClaro>
        <HeightsEditor />
      </Dialog>
    );
  }
  if (dialog === 'contato') {
    return (
      <Dialog title={t('dialogo.contato')} onClose={fecha}>
        <ContactForm />
      </Dialog>
    );
  }
  if (dialog === 'sobre') {
    return (
      <Dialog title={t('dialogo.sobre')} onClose={fecha}>
        <section className="about">
          <p>{t('sobre.intro')}</p>
          <ul>
            <li><strong>{t('sobre.pista')}</strong> {t('sobre.pistaTexto')}</li>
            <li><strong>{t('sobre.percurso')}</strong> {t('sobre.percursoTexto')}</li>
            <li><strong>{t('sobre.ginastica')}</strong> {t('sobre.ginasticaTexto')}</li>
          </ul>
          <p>{t('sobre.arquivos')}</p>
          <p className="note">Português · English · Español</p>
          <p className="note dim">{t('sobre.versao', { versao: APP_VERSION.replace(/\.0$/, '') })} · Pedro H Bombardelli</p>
          <div className="row-buttons">
            <button onClick={() => setDialog('contato')}>{t('dialogo.contato')}</button>
          </div>
        </section>
      </Dialog>
    );
  }
  return null;
}
