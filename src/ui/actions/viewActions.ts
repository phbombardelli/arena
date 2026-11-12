import { clamp } from '@core/geometry/vec';
import { desenhoNaFolhaMm, pageRectMm } from '@core/model/document';
import type { CourseDocument } from '@core/model/types';
import type { ModoEditor } from '@store/editorStore';
import { fitToRect, MAX_ZOOM, MIN_ZOOM, ZOOM_ACTUAL_SIZE } from '@core/scale/viewport';
import { useDocumentStore } from '@store/documentStore';
import { useEditorStore } from '@store/editorStore';
import { t } from '@core/i18n/i18n';

/** Comandos de vista, compartilhados pelo menu Exibir, o zoom e o teclado. */

/**
 * O que enquadrar: na Impressão, a folha; em Pista e Percurso, que não
 * têm folha (B-105), o desenho com uma margem — ou a folha, se ainda não
 * há pista.
 */
export function areaDeTrabalhoMm(doc: CourseDocument, modo: ModoEditor): { x: number; y: number; width: number; height: number } {
  const folha = pageRectMm(doc);
  if (modo === 'impressao') return folha;
  const r = desenhoNaFolhaMm(doc);
  if (!r) return folha;
  const m = Math.max(r.widthMm, r.heightMm) * 0.06 + 6;
  return { x: r.xMm - m, y: r.yMm - m, width: r.widthMm + 2 * m, height: r.heightMm + 2 * m };
}

export function fitPage(): void {
  const el = document.querySelector('.canvas-svg') as SVGSVGElement | null;
  if (!el) return;
  const { doc } = useDocumentStore.getState();
  const ed = useEditorStore.getState();
  ed.setViewport(fitToRect(areaDeTrabalhoMm(doc, ed.mode), { width: el.clientWidth, height: el.clientHeight }));
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
