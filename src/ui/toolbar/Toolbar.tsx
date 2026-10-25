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
import { actualSize, fitPage, toggleGrid, zoomBy } from '@ui/actions/viewActions';
import { insertHeightTable, insertInfoBox } from '@ui/actions/annotationActions';
import { insertTimingLine } from '@ui/actions/timingActions';
import { importBackgroundImage, pasteImageFromSystemClipboard, startMapWizard } from '@ui/actions/imageActions';
import { insertLogo } from '@ui/actions/logoActions';
import { ZOOM_ACTUAL_SIZE } from '@core/scale/viewport';
import { hasLinked } from '@core/commands/groupOps';
import { useDocumentStore } from '@store/documentStore';
import { useEditorStore } from '@store/editorStore';
import { Popover } from '@ui/common/Popover';
import { SheetSettings } from '@ui/inspector/SheetSettings';
import { Menu, type MenuEntry } from './Menu';

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
      window.alert('Não foi possível gerar o PDF. Detalhes no console.');
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
    { label: 'Novo percurso…', shortcut: 'Ctrl+N', onSelect: () => setDialog('novo') },
    { label: 'Nova ginástica…', onSelect: () => setDialog('nova-ginastica') },
    { label: 'Abrir percurso…', shortcut: 'Ctrl+O', onSelect: () => setDialog('abrir') },
    { label: 'Salvar percurso', shortcut: 'Ctrl+S', onSelect: () => void saveCourse() },
    { label: 'Salvar percurso como arquivo…', shortcut: 'Ctrl+Shift+S', onSelect: () => void saveDocumentAs() },
    'separator',
    { label: 'Abrir pista…', onSelect: () => setDialog('modelos') },
    { label: 'Salvar pista…', onSelect: () => setDialog('modelos') },
    { label: 'Pista pelo mapa…', onSelect: () => void startMapWizard() },
    'separator',
    {
      label: busy ? 'Exportando…' : 'Exportar PDF…',
      shortcut: 'Ctrl+E',
      disabled: busy,
      onSelect: () => void exportPdf(),
    },
    { label: 'Imprimir…', shortcut: 'Ctrl+P', onSelect: () => printDocument(doc) },
    'separator',
    { label: 'Configurar folha…', onSelect: () => setDialog('folha') },
    ...(pwa.instalavel
      ? (['separator', { label: 'Instalar como app…', onSelect: () => void installApp() }] as MenuEntry[])
      : []),
  ];

  const editar: MenuEntry[] = [
    { label: 'Desfazer', shortcut: 'Ctrl+Z', disabled: !canUndo(), onSelect: undo },
    { label: 'Refazer', shortcut: 'Ctrl+Y', disabled: !canRedo(), onSelect: redo },
    'separator',
    { label: 'Copiar', shortcut: 'Ctrl+C', disabled: nada, onSelect: copySelection },
    {
      label: 'Colar',
      shortcut: 'Ctrl+V',
      onSelect: () =>
        void pasteImageFromSystemClipboard().then((colou) => {
          if (!colou) pasteClipboard();
        }),
    },
    { label: 'Duplicar', shortcut: 'Ctrl+D', disabled: nada, onSelect: duplicateSelection },
    { label: 'Excluir', shortcut: 'Delete', disabled: nada, onSelect: deleteSelection },
    'separator',
    { label: 'Selecionar tudo', shortcut: 'Ctrl+A', onSelect: selectAll },
    { label: 'Trazer para frente', disabled: nada, onSelect: bringSelectionToFront },
    { label: 'Enviar para trás', disabled: nada, onSelect: sendSelectionToBack },
    'separator',
    { label: 'Vincular', shortcut: 'Ctrl+G', disabled: selection.length < 2, onSelect: linkSelection },
    {
      label: 'Desvincular',
      shortcut: 'Ctrl+Shift+G',
      disabled: !hasLinked(doc, selection),
      onSelect: unlinkSelection,
    },
  ];

  const inserir: MenuEntry[] = [
    { label: 'Obstáculo', shortcut: 'O', onSelect: noPercurso(() => setTool('obstacle')) },
    { label: 'Texto', shortcut: 'X', onSelect: noPercurso(() => setTool('text')) },
    { label: 'Trena', shortcut: 'M', onSelect: noPercurso(() => setTool('measure')) },
    'separator',
    { label: 'Partida', onSelect: noPercurso(() => insertTimingLine('start')) },
    { label: 'Chegada', onSelect: noPercurso(() => insertTimingLine('finish')) },
    'separator',
    { label: 'Quadro técnico', onSelect: noPercurso(insertInfoBox) },
    { label: 'Tabela de alturas', onSelect: noPercurso(insertHeightTable) },
    { label: 'Logo ou imagem…', onSelect: () => void insertLogo() },
    {
      label: check(doc.page.scaleLabel.visible, 'Escala'),
      onSelect: () =>
        apply(doc.page.scaleLabel.visible ? 'Ocultar escala' : 'Mostrar escala', (d) => {
          d.page.scaleLabel.visible = !d.page.scaleLabel.visible;
        }),
    },
    'separator',
    {
      label: 'Imagem de fundo…',
      onSelect: () => {
        if (mode !== 'pista') setMode('pista');
        void importBackgroundImage();
      },
    },
  ];

  const exibir: MenuEntry[] = [
    { label: check(doc.grid.visible, 'Grade'), shortcut: 'G', onSelect: toggleGrid },
    { label: check(showPageFrame, 'Limites da folha'), onSelect: togglePageFrame },
    { label: check(showInterference, 'Avisos de interferência'), onSelect: toggleInterference },
    'separator',
    { label: 'Ajustar à página', shortcut: 'Ctrl+0', onSelect: fitPage },
    { label: 'Tamanho real', onSelect: actualSize },
    { label: 'Aproximar', shortcut: '+', onSelect: () => zoomBy(1.25) },
    { label: 'Afastar', shortcut: '−', onSelect: () => zoomBy(1 / 1.25) },
  ];

  const ajuda: MenuEntry[] = [
    { label: 'Atalhos do teclado', shortcut: '?', onSelect: () => setDialog('atalhos') },
    { label: 'Sobre o Arena', onSelect: () => setDialog('sobre') },
  ];

  const pct = Math.round((viewport.zoom / ZOOM_ACTUAL_SIZE) * 100);
  const orient = doc.page.orientation === 'landscape' ? 'paisagem' : 'retrato';

  return (
    <header className="toolbar">
      <div className="toolbar-group">
        <img className="brand" src="brand/arena-logo.png" alt="Arena" />
        <Menu label="Arquivo" entries={arquivo} />
        <Menu label="Editar" entries={editar} />
        <Menu label="Inserir" entries={inserir} />
        <Menu label="Exibir" entries={exibir} />
        <Menu label="Ajuda" entries={ajuda} />
      </div>

      <div className="toolbar-group">
        <button className="icon-button" onClick={undo} disabled={!canUndo()} title="Desfazer (Ctrl+Z)">↶</button>
        <button className="icon-button" onClick={redo} disabled={!canRedo()} title="Refazer (Ctrl+Y)">↷</button>
      </div>

      <div className="toolbar-group mode-switch" role="group" aria-label="Modo de trabalho">
        <button
          className={mode === 'pista' ? 'active' : ''}
          onClick={() => setMode('pista')}
          title="Configurar o local: contorno, imagem de referência, árvores"
        >
          Pista
        </button>
        <button
          className={mode === 'percurso' && doc.kind !== 'ginastica' ? 'active' : ''}
          onClick={() => switchKind('percurso')}
          title="Desenhar a prova: obstáculos, traçados, partida e chegada"
        >
          Percurso
        </button>
        <button
          className={mode === 'percurso' && doc.kind === 'ginastica' ? 'active' : ''}
          onClick={() => switchKind('ginastica')}
          title="Montar ginásticas: cavaletes, pé de galinha, relógio, leque (arquivo à parte do percurso)"
        >
          Ginástica
        </button>
      </div>

      <span className="toolbar-spacer" />

      <div className="toolbar-group">
        <Popover
          className="sheet-popover"
          align="right"
          title={`Folha ${doc.page.format} ${orient}, escala 1:${doc.page.printScale}`}
          trigger={
            <>
              Folha {doc.page.format} · 1:{doc.page.printScale} <span className="caret">▾</span>
            </>
          }
        >
          <SheetSettings />
        </Popover>

        <div className="zoom-control">
          <button className="icon-button" onClick={() => zoomBy(1 / 1.25)} title="Afastar">−</button>
          <Popover
            align="right"
            title="Zoom"
            trigger={
              <>
                {pct}% <span className="caret">▾</span>
              </>
            }
          >
            {(fecha) => (
              <div className="menu-list">
                <button onClick={() => { fitPage(); fecha(); }}>
                  <span>Ajustar à página</span><em>Ctrl+0</em>
                </button>
                <button onClick={() => { actualSize(); fecha(); }}>
                  <span>Tamanho real</span>
                </button>
              </div>
            )}
          </Popover>
          <button className="icon-button" onClick={() => zoomBy(1.25)} title="Aproximar">+</button>
        </div>
      </div>

      {/* O nome do arquivo fica por último: é informação, não comando, e é
          o primeiro item que pode ser espremido numa janela estreita. */}
      <div className="toolbar-group doc-name-group">
        <span className="doc-name" title={fileName ?? 'Sem título'}>
          {fileName ?? 'Sem título'}
          {dirty ? ' •' : ''}
        </span>
      </div>
      <div className="toolbar-group">
        <AccountButton />
      </div>
    </header>
  );
}
