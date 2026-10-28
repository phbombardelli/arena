import { clamp } from '@core/geometry/vec';
import { pageRectMm } from '@core/model/document';
import { fitToRect, MAX_ZOOM, MIN_ZOOM, ZOOM_ACTUAL_SIZE } from '@core/scale/viewport';
import { useDocumentStore } from '@store/documentStore';
import { useEditorStore } from '@store/editorStore';
import { t } from '@core/i18n/i18n';

/** Comandos de vista, compartilhados pelo menu Exibir, o zoom e o teclado. */

export function fitPage(): void {
  const el = document.querySelector('.canvas-svg') as SVGSVGElement | null;
  if (!el) return;
  const { doc } = useDocumentStore.getState();
  useEditorStore
    .getState()
    .setViewport(fitToRect(pageRectMm(doc), { width: el.clientWidth, height: el.clientHeight }));
}

export function zoomBy(factor: number): void {
  const { viewport, setViewport } = useEditorStore.getState();
  setViewport({ ...viewport, zoom: clamp(viewport.zoom * factor, MIN_ZOOM, MAX_ZOOM) });
}

export function actualSize(): void {
  const { viewport, setViewport } = useEditorStore.getState();
  setViewport({ ...viewport, zoom: ZOOM_ACTUAL_SIZE });
}

/**
 * Esconde ou mostra a imagem de fundo (o print do mapa). Ela nasce
 * vinculada ao cenário pelo assistente, então selecioná-la sozinha para
 * apagar dava trabalho; aqui é um clique, e dá para voltar a conferir.
 * Escondida, também não sai na folha.
 */
export function toggleBackgroundImage(): void {
  useDocumentStore.getState().apply(t('exibir.imagemFundo'), (d) => {
    const camada = d.layers.find((l) => l.id === 'background');
    if (camada) camada.visible = !camada.visible;
  });
}

export function toggleGrid(): void {
  useDocumentStore.getState().apply('Alternar grade', (d) => {
    d.grid.visible = !d.grid.visible;
  });
}
