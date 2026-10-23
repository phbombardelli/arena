import { infoBoxLayout } from '@core/model/annotationLayout';
import type { InfoBox } from '@core/model/types';

interface Props {
  box: InfoBox;
  onPointerDown?: (e: React.PointerEvent) => void;
}

/**
 * Quadro técnico da prova.
 *
 * Não recebe escala nem origem: o quadro é da FOLHA, e o espaço do SVG já
 * é milímetro de papel. Mudar o croqui de 1:200 para 1:500 encolhe a
 * pista e não mexe no quadro — que é exatamente o que se espera de um
 * cabeçalho impresso.
 */
export function InfoBoxLayer({ box, onPointerDown }: Props) {
  const l = infoBoxLayout(box);
  const s = box.style.sizeMm;

  return (
    <g
      data-object={box.id}
      data-kind="infobox"
      transform={`translate(${round(box.posMm.x)} ${round(box.posMm.y)})`}
      onPointerDown={onPointerDown}
      style={{ cursor: 'move' }}
    >
      <rect
        width={round(l.widthMm)}
        height={round(l.heightMm)}
        fill="#ffffff"
        stroke="#23282d"
        strokeWidth={box.style.borderMm}
      />
      {l.cells.map((c, i) => (
        <g key={i} transform={`translate(${round(c.xMm)} ${round(c.yMm + l.rowHeightMm * 0.7)})`}>
          <text fontSize={s} fontFamily="Helvetica, Arial, sans-serif" fill="#6c757d">
            {c.label}
          </text>
          {/* O valor vem logo depois do título, alinhado com os outros
              valores da mesma coluna (B-70). */}
          <text
            x={round(c.valueXMm)}
            fontSize={s}
            fontFamily="Helvetica, Arial, sans-serif"
            fontWeight={700}
            fill="#23282d"
          >
            {c.value}
          </text>
        </g>
      ))}
    </g>
  );
}

const round = (v: number): number => Math.round(v * 1000) / 1000;
