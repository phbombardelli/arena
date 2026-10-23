import type { Vec2 } from '@core/geometry/vec';
import { measureLength } from '@core/library/measures';
import { formatDistance } from '@core/model/path';
import type { MeasureLine } from '@core/model/types';
import { mmPerMeter } from '@core/scale/units';

interface Props {
  measure: MeasureLine;
  printScale: number;
  originMm: Vec2;
  onPointerDown?: (e: React.PointerEvent) => void;
}

/**
 * Trena (B-64): cota com traço nas pontas e a medida escrita ao longo
 * dela, sempre de pé para a leitura. As pontas são do terreno; o traço e
 * o texto são de papel, como toda anotação. Sai na impressão.
 */
export function MeasureLayer({ measure, printScale, originMm, onPointerDown }: Props) {
  const k = mmPerMeter(printScale);
  const a = { x: originMm.x + measure.a.x * k, y: originMm.y + measure.a.y * k };
  const b = { x: originMm.x + measure.b.x * k, y: originMm.y + measure.b.y * k };
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const t = { x: dx / len, y: dy / len };
  const n = { x: -t.y, y: t.x };
  const ponta = measure.sizeMm * 0.6;
  const traco = (p: Vec2) =>
    `M${round(p.x + n.x * ponta)} ${round(p.y + n.y * ponta)}L${round(p.x - n.x * ponta)} ${round(p.y - n.y * ponta)}`;

  // Texto de pé: a linha que aponta para a esquerda se lê ao contrário.
  let ang = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (ang > 90) ang -= 180;
  else if (ang <= -90) ang += 180;
  const r = (ang * Math.PI) / 180;
  const acima = { x: Math.sin(r), y: -Math.cos(r) };
  const afasta = measure.sizeMm * 0.45;
  const m = {
    x: (a.x + b.x) / 2 + acima.x * afasta,
    y: (a.y + b.y) / 2 + acima.y * afasta,
  };

  return (
    <g data-object={measure.id} data-kind="measure" onPointerDown={onPointerDown} style={{ cursor: 'move' }}>
      {/* Alvo de clique folgado: a cota é fina. */}
      <line x1={round(a.x)} y1={round(a.y)} x2={round(b.x)} y2={round(b.y)} stroke="transparent" strokeWidth={3} />
      <line
        x1={round(a.x)}
        y1={round(a.y)}
        x2={round(b.x)}
        y2={round(b.y)}
        stroke={measure.color}
        strokeWidth={0.22}
      />
      <path d={`${traco(a)}${traco(b)}`} stroke={measure.color} strokeWidth={0.22} fill="none" />
      <text
        x={round(m.x)}
        y={round(m.y)}
        transform={`rotate(${round(ang)} ${round(m.x)} ${round(m.y)})`}
        fontSize={measure.sizeMm}
        fontFamily="Helvetica, Arial, sans-serif"
        fill={measure.color}
        stroke="#ffffff"
        strokeWidth={measure.sizeMm * 0.3}
        strokeLinejoin="round"
        paintOrder="stroke"
        textAnchor="middle"
        dominantBaseline="auto"
        style={{ userSelect: 'none' }}
      >
        {formatDistance(measureLength(measure), measure.decimals)} m
      </text>
    </g>
  );
}

const round = (v: number): number => Math.round(v * 1000) / 1000;
