import { pageRectMm } from '@core/model/document';
import { boundsCenter, boundsIn, unionBounds } from '@core/model/transform';
import { mmPerMeter } from '@core/scale/units';
import { useDocumentStore } from '@store/documentStore';
import { useEditorStore } from '@store/editorStore';

interface Props {
  /** Pixels por milímetro de papel. */
  zoom: number;
}

/** A quantos pixels de tela do centro a guia acende. */
const TOLERANCIA_PX = 4;

/**
 * Guia do centro da folha (B-69, decisão 78): arrastando, quando o centro
 * da seleção passa pelo meio da folha, acende a linha daquele eixo. Só
 * indica — não puxa a peça. Só na tela.
 */
export function CenterGuideOverlay({ zoom }: Props) {
  const doc = useDocumentStore((s) => s.doc);
  const { dragging, selection } = useEditorStore();
  if (!dragging || selection.length === 0) return null;

  const objs = doc.objects.filter((o) => selection.includes(o.id));
  const b = unionBounds(objs.map((o) => boundsIn(doc, o)));
  if (!b) return null;
  const k = mmPerMeter(doc.page.printScale);
  const c = boundsCenter(b);
  const cx = doc.originMm.x + c.x * k;
  const cy = doc.originMm.y + c.y * k;
  const folha = pageRectMm(doc);
  const meioX = folha.x + folha.width / 2;
  const meioY = folha.y + folha.height / 2;
  const tol = TOLERANCIA_PX / zoom;
  const vertical = Math.abs(cx - meioX) <= tol;
  const horizontal = Math.abs(cy - meioY) <= tol;
  if (!vertical && !horizontal) return null;

  const traco = { stroke: '#D9603B', strokeWidth: 1 / zoom, strokeDasharray: `${6 / zoom} ${4 / zoom}` };
  return (
    <g data-part="center-guide" pointerEvents="none">
      {vertical && <line x1={meioX} y1={folha.y} x2={meioX} y2={folha.y + folha.height} {...traco} />}
      {horizontal && <line x1={folha.x} y1={meioY} x2={folha.x + folha.width} y2={meioY} {...traco} />}
    </g>
  );
}
