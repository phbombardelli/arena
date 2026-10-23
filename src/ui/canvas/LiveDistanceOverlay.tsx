import { useMemo } from 'react';
import { courseDistances } from '@core/commands/distanceOps';
import { formatDistance } from '@core/model/path';
import { mmPerMeter } from '@core/scale/units';
import { useDocumentStore } from '@store/documentStore';
import { useEditorStore } from '@store/editorStore';

interface Props {
  /** Pixels por milímetro de papel: o rótulo tem tamanho fixo na tela. */
  zoom: number;
}

/**
 * Distâncias ao vivo enquanto se arrasta ou gira um obstáculo (B-61).
 *
 * Mostra, sobre o traçado, a distância de vara a vara de e até cada peça
 * que está sendo movida — marcada para o croqui ou não. É ferramenta de
 * trabalho, como as interferências: só na tela, nunca na folha.
 */
export function LiveDistanceOverlay({ zoom }: Props) {
  const doc = useDocumentStore((s) => s.doc);
  const { dragging, selection } = useEditorStore();

  const pares = useMemo(() => {
    if (!dragging || selection.length === 0) return [];
    const ids = new Set(selection);
    return doc.objects
      .filter((o) => o.kind === 'path' && o.visible)
      .flatMap((p) => (p.kind === 'path' ? courseDistances(doc, p) : []))
      .filter((d) => ids.has(d.fromId) !== ids.has(d.toId));
  }, [doc, dragging, selection]);
  if (pares.length === 0) return null;

  const k = mmPerMeter(doc.page.printScale);
  const mm = (px: number) => px / zoom;
  const fonte = mm(12);

  return (
    <g data-part="live-distances" pointerEvents="none">
      {pares.map((d) => {
        const texto = `${formatDistance(d.meters, 2)} m`;
        const largura = texto.length * fonte * 0.6 + mm(10);
        const x = doc.originMm.x + d.at.x * k;
        const y = doc.originMm.y + d.at.y * k;
        return (
          <g key={d.key} transform={`translate(${round(x)} ${round(y)})`}>
            <rect
              x={-largura / 2}
              y={-fonte * 0.85}
              width={largura}
              height={fonte * 1.7}
              rx={fonte * 0.85}
              fill="#ffffff"
              fillOpacity={0.92}
              stroke="#B8975A"
              strokeWidth={mm(1.2)}
            />
            <text y={fonte * 0.36} fontSize={fonte} fontWeight={700} fill="#13294B" textAnchor="middle">
              {texto}
            </text>
          </g>
        );
      })}
    </g>
  );
}

const round = (v: number): number => Math.round(v * 1000) / 1000;
