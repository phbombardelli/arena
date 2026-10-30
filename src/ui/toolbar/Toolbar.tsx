import { useState } from 'react';
import { exportDocumentPdf } from '@platform/exportPdf';
import { printDocument } from '@platform/print';
import { installApp, usePwa } from '@platform/pwa';
import { AccountButton } from '@ui/cloud/CloudUI';
import {
  saveCourse,
  saveDocumentAs,
  switchKind,
} from '@ui/actions/documentActions';
import {
  bringSelectionToFront,
  copySelection,
  deleteSelection,
  duplicateSelection,
  linkSelection,
  pasteClipboard,
  selectAll,
  sendSelectionToBack,
  unlinkSelection,
} from '@ui/actions/editActions';
import { actualSize, fitPage, toggleBackgroundImage, toggleGrid, zoomBy } from '@ui/actions/viewActions';
import { insertHeightTable, insertInfoBox } from '@ui/actions/annotationActions';
import { insertTimingLine } from '@ui/actions/timingActions';
import { importBackgroundImage, pasteImageFromSystemClipboard, startMapWizard } from '@ui/actions/imageActions';
import { insertLogo } from '@ui/actions/logoActions';
import { ZOOM_ACTUAL_SIZE } from '@core/scale/viewport';
import { hasLinked } from '@core/commands/groupOps';
import { isLayerVisible } from '@core/model/document';
import { useDocumentStore } from '@store/documentStore';
import { useEditorStore } from '@store/editorStore';
import { Popover } from '@ui/common/Popover';
import { SheetSettings } from '@ui/inspector/SheetSettings';
import { t } from '@core/i18n/i18n';
import { LanguageSwitcher } from '@ui/i18n/LanguageSwitcher';
import { Menu, type MenuEntry } from './Menu';
import { abrirTutoriais, publicados } from '@ui/help/Tutorials';

/**
 * Barra de cima: o arquivo e a vista.
 *
 * As ferramentas de desenhar moram na barra da esquerda; as propriedades,
 * no painel da direita. Aqui ficam os menus, desfazer, o modo Pista/Percurso,
 * a folha e o zoom — o que vale para o croqui inteiro.
 */
export function Toolbar() {
  const { doc, apply, undo, redo, canUndo, canRedo, dirty, fileName } = useDocumentStore();
  const {
    viewport,
    showPageFrame,
    togglePageFrame,
    showInterference,
    toggleInterference,
    mode,
    setMode,
    setTool,
    selection,
    setDialog,
  } = useEditorStore();
  const [busy, setBusy] = useState(false);

  const exportPdf = async () => {
    setBusy(true);
    try {
      await exportDocumentPdf(doc, (fileName ?? 'croqui').replace(/\.[^.]+$/, ''));
    } catch (err) {
      console.error(err);
      window.alert(t('arquivo.falhaPdf'));
    } finally {
      setBusy(false);
    }
  };

  const check = (on: boolean, texto: string) => `${on ? '✓ ' : '   '}${texto}`;
  const nada = selection.length === 0;

  // Inserir algo do percurso a partir do modo Pista troca de modo antes:
  // o objeto novo não pode nascer esmaecido e intocável.
  const noPercurso = (fn: () => void) => () => {
    if (mode !== 'percurso') setMode('percurso');
    fn();
  };

  const pwa = usePwa();
  const arquivo: MenuEntry[] = [
    { label: t('arquivo.novoPercurso'), shortcut: 'Ctrl+N', onSelect: () => setDialog('novo') },
    { label: t('arquivo.novaGinastica'), onSelect: () => setDialog('nova-ginastica') },
    { label: t('arquivo.abrirPercurso'), shortcut: 'Ctrl+O', onSelect: () => setDialog('abrir') },
    { label: t('arquivo.salvarPercurso'), shortcut: 'Ctrl+S', onSelect: () => void saveCourse() },
    { label: t('arquivo.salvarComoArquivo'), shortcut: 'Ctrl+Shift+S', onSelect: () => void saveDocumentAs() },
    'separator',
    { label: t('arquivo.abrirPista'), onSelect: () => setDialog('modelos') },
    { label: t('arquivo.salvarPista'), onSelect: () => setDialog('modelos') },
    { label: t('arquivo.pistaPeloMapa'), onSelect: () => void startMapWizard() },
    'separator',
    {
      label: busy ? t('arquivo.exportando') : t('arquivo.exportarPdf'),
      shortcut: 'Ctrl+E',
      disabled: busy,
      onSelect: () => void exportPdf(),
    },
    { label: t('arquivo.imprimir'), shortcut: 'Ctrl+P', onSelect: () => printDocument(doc) },
    'separator',
    { label: t('arquivo.configurarFolha'), onSelect: () => setDialog('folha') },
    ...(pwa.instalavel
      ? (['separator', { label: t('arquivo.instalarApp'), onSelect: () => void installApp() }] as MenuEntry[])
      : []),
  ];

  const editar: MenuEntry[] = [
    { label: t('editar.desfazer'), shortcut: 'Ctrl+Z', disabled: !canUndo(), onSelect: undo },
    { label: t('editar.refazer'), shortcut: 'Ctrl+Y', disabled: !canRedo(), onSelect: redo },
    'separator',
    { label: t('editar.copiar'), shortcut: 'Ctrl+C', disabled: nada, onSelect: copySelection },
    {
      label: t('editar.colar'),
      shortcut: 'Ctrl+V',
      onSelect: () =>
        void pasteImageFromSystemClipboard().then((colou) => {
          if (!colou) pasteClipboard();
        }),
    },
    { label: t('editar.duplicar'), shortcut: 'Ctrl+D', disabled: nada, onSelect: duplicateSelection },
    { label: t('editar.excluir'), shortcut: 'Delete', disabled: nada, onSelect: deleteSelection },
    'separator',
    { label: t('editar.selecionarTudo'), shortcut: 'Ctrl+A', onSelect: selectAll },
    { label: t('editar.trazerFrente'), disabled: nada, onSelect: bringSelectionToFront },
    { label: t('editar.enviarTras'), disabled: nada, onSelect: sendSelectionToBack },
    'separator',
    { label: t('editar.vincular'), shortcut: 'Ctrl+G', disabled: selection.length < 2, onSelect: linkSelection },
    {
      label: t('editar.desvincular'),
      shortcut: 'Ctrl+Shift+G',
      disabled: !hasLinked(doc, selection),
      onSelect: unlinkSelection,
    },
  ];

  const inserir: MenuEntry[] = [
    { label: t('inserir.obstaculo'), shortcut: 'O', onSelect: noPercurso(() => setTool('obstacle')) },
    { label: t('inserir.texto'), shortcut: 'X', onSelect: noPercurso(() => setTool('text')) },
    { label: t('inserir.trena'), shortcut: 'M', onSelect: noPercurso(() => setTool('measure')) },
    'separator',
    { label: t('inserir.partida'), onSelect: noPercurso(() => insertTimingLine('start')) },
    { label: t('inserir.chegada'), onSelect: noPercurso(() => insertTimingLine('finish')) },
    'separator',
    { label: t('inserir.quadroTecnico'), onSelect: noPercurso(insertInfoBox) },
    { label: t('inserir.tabelaAlturas'), onSelect: noPercurso(insertHeightTable) },
    { label: t('inserir.logo'), onSelect: () => void insertLogo() },
    {
      label: check(doc.page.scaleLabel.visible, t('inserir.escala')),
      onSelect: () =>
        apply(doc.page.scaleLabel.visible ? t('inserir.ocultarEscala') : t('inserir.mostrarEscala'), (d) => {
          d.page.scaleLabel.visible = !d.page.scaleLabel.visible;
        }),
    },
    'separator',
    {
      label: t('inserir.imagemFundo'),
      onSelect: () => {
        if (mode !== 'pista') setMode('pista');
        void importBackgroundImage();
      },
    },
  ];

  const exibir: MenuEntry[] = [
    { label: check(doc.grid.visible, t('exibir.grade')), shortcut: 'G', onSelect: toggleGrid },
    ...(doc.objects.some((o) => o.kind === 'image')
      ? [{ label: check(isLayerVisible(doc, 'background'), t('exibir.imagemFundo')), onSelect: toggleBackgroundImage }]
      : []),
    { label: check(showPageFrame, t('exibir.limitesFolha')), onSelect: togglePageFrame },
    { label: check(showInterference, t('exibir.avisosInterferencia')), onSelect: toggleInterference },
    'separator',
    { label: t('exibir.ajustarPagina'), shortcut: 'Ctrl+0', onSelect: fitPage },
    { label: t('exibir.tamanhoReal'), onSelect: actualSize },
    { label: t('exibir.aproximar'), shortcut: '+', onSelect: () => zoomBy(1.25) },
    { label: t('exibir.afastar'), shortcut: '−', onSelect: () => zoomBy(1 / 1.25) },
  ];

  const ajuda: MenuEntry[] = [
    ...(publicados ? [{ label: t('tut.menu'), onSelect: () => abrirTutoriais() }] : []),
    { label: t('ajuda.atalhos'), shortcut: '?', onSelect: () => setDialog('atalhos') },
    { label: t('ajuda.contato'), onSelect: () => setDialog('contato') },
    { label: t('ajuda.sobre'), onSelect: () => setDialog('sobre') },
  ];

  const pct = Math.round((viewport.zoom / ZOOM_ACTUAL_SIZE) * 100);
  const folha = { formato: doc.page.format, escala: String(doc.page.printScale) };

  return (
    <header className="toolbar">
      <div className="toolbar-group">
        <img className="brand" src="brand/arena-logo.png" alt="Arena" />
        <Menu label={t('menu.arquivo')} entries={arquivo} />
        <Menu label={t('menu.editar')} entries={editar} />
        <Menu label={t('menu.inserir')} entries={inserir} />
        <Menu label={t('menu.exibir')} entries={exibir} />
        <Menu label={t('menu.ajuda')} entries={ajuda} />
      </div>

      <div className="toolbar-group">
        <button className="icon-button" onClick={undo} disabled={!canUndo()} title={`${t('editar.desfazer')} (Ctrl+Z)`}>↶</button>
        <button className="icon-button" onClick={redo} disabled={!canRedo()} title={`${t('editar.refazer')} (Ctrl+Y)`}>↷</button>
      </div>

      <div className="toolbar-group mode-switch" role="group" aria-label={t('modo.grupo')}>
        <button
          className={mode === 'pista' ? 'active' : ''}
          onClick={() => setMode('pista')}
          title={t('modo.pistaDica')}
        >
          {t('modo.pista')}
        </button>
        <button
          className={mode === 'percurso' && doc.kind !== 'ginastica' ? 'active' : ''}
          onClick={() => switchKind('percurso')}
          title={t('modo.percursoDica')}
        >
          {t('modo.percurso')}
        </button>
        <button
          className={mode === 'percurso' && doc.kind === 'ginastica' ? 'active' : ''}
          onClick={() => switchKind('ginastica')}
          title={t('modo.ginasticaDica')}
        >
          {t('modo.ginastica')}
        </button>
      </div>

      <span className="toolbar-spacer" />

      <div className="toolbar-group">
        <Popover
          className="sheet-popover"
          align="right"
          title={t(doc.page.orientation === 'landscape' ? 'folha.dicaPaisagem' : 'folha.dicaRetrato', folha)}
          trigger={
            <>
              {t('folha.botao', folha)} <span className="caret">▾</span>
            </>
          }
        >
          <SheetSettings />
        </Popover>

        <div className="zoom-control">
          <button className="icon-button" onClick={() => zoomBy(1 / 1.25)} title={t('exibir.afastar')}>−</button>
          <Popover
            align="right"
            title={t('zoom.titulo')}
            trigger={
              <>
                {pct}% <span className="caret">▾</span>
              </>
            }
          >
            {(fecha) => (
              <div className="menu-list">
                <button onClick={() => { fitPage(); fecha(); }}>
                  <span>{t('exibir.ajustarPagina')}</span><em>Ctrl+0</em>
                </button>
                <button onClick={() => { actualSize(); fecha(); }}>
                  <span>{t('exibir.tamanhoReal')}</span>
                </button>
              </div>
            )}
          </Popover>
          <button className="icon-button" onClick={() => zoomBy(1.25)} title={t('exibir.aproximar')}>+</button>
        </div>
      </div>

      {/* O nome do arquivo fica por último: é informação, não comando, e é
          o primeiro item que pode ser espremido numa janela estreita. */}
      <div className="toolbar-group doc-name-group">
        <span className="doc-name" title={fileName ?? t('arquivo.semTitulo')}>
          {fileName ?? t('arquivo.semTitulo')}
          {dirty ? ' •' : ''}
        </span>
      </div>
      <div className="toolbar-group">
        {publicados && (
          <button className="tutorials-button" onClick={() => abrirTutoriais()} title={t('tut.botaoDica')}>
            ▶<span className="rotulo"> {t('tut.botao')}</span>
          </button>
        )}
        <LanguageSwitcher />
        <AccountButton />
      </div>
    </header>
  );
}
