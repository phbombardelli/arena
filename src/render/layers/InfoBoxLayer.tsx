import { infoBoxLayout, type ParteDoQuadro } from '@core/model/annotationLayout';
import type { InfoBox } from '@core/model/types';

interface Props {
  box: InfoBox;
  /** Que parte sai: com o desempate em página própria, cada uma leva a sua (B-92). */
  parte?: ParteDoQuadro;
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
export function InfoBoxLayer({ box, parte, onPointerDown }: Props) {
  const l = infoBoxLayout(box, parte);
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
      {l.secao && (
        <>
          {l.secao.linhaYMm >= 0 && (
            <line
              x1={0}
              x2={round(l.widthMm)}
              y1={round(l.secao.linhaYMm)}
              y2={round(l.secao.linhaYMm)}
              stroke="#23282d"
              strokeWidth={box.style.borderMm}
            />
          )}
          <text
            x={round(s * 0.8)}
            y={round(l.secao.tituloYMm + l.rowHeightMm * 0.7)}
            fontSize={s}
            fontFamily="Helvetica, Arial, sans-serif"
            fontWeight={700}
            fill="#23282d"
          >
            {l.secao.titulo}
          </text>
        </>
      )}
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
