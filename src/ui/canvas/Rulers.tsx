import { visibleGridStep } from '@core/geometry/snap';
import { mmPerMeter } from '@core/scale/units';
import type { Vec2 } from '@core/geometry/vec';
import type { Viewport } from '@core/scale/viewport';
import { paperToScreen } from '@core/scale/viewport';

export const RULER_SIZE = 22;

interface Props {
  viewport: Viewport;
  size: { width: number; height: number };
  printScale: number;
  originMm: Vec2;
  metersPerPixel: number;
  cursorM: Vec2 | null;
}

/**
 * Réguas da interface, em metros do modelo. São cromo da tela — não
 * fazem parte do documento e não são impressas. A régua que sai no croqui
 * é a do perímetro da pista (ArenaLayer).
 */
export function Rulers({ viewport, size, printScale, originMm, metersPerPixel, cursorM }: Props) {
  const k = mmPerMeter(printScale);
  const step = visibleGridStep(metersPerPixel, 60);

  const toScreenX = (m: number) =>
    paperToScreen({ x: originMm.x + m * k, y: 0 }, viewport, size).x;
  const toScreenY = (m: number) =>
    paperToScreen({ x: 0, y: originMm.y + m * k }, viewport, size).y;

  const firstX = Math.floor(((0 - size.width / 2) / viewport.zoom + viewport.centerMm.x - originMm.x) / k / step) * step;
  const lastX = Math.ceil(((size.width / 2) / viewport.zoom + viewport.centerMm.x - originMm.x) / k / step) * step;
  const firstY = Math.floor(((0 - size.height / 2) / viewport.zoom + viewport.centerMm.y - originMm.y) / k / step) * step;
  const lastY = Math.ceil(((size.height / 2) / viewport.zoom + viewport.centerMm.y - originMm.y) / k / step) * step;

  const xs: number[] = [];
  for (let m = firstX; m <= lastX && xs.length < 300; m += step) xs.push(m);
  const ys: number[] = [];
  for (let m = firstY; m <= lastY && ys.length < 300; m += step) ys.push(m);

  return (
    <>
      <svg className="ruler ruler-top" width={size.width} height={RULER_SIZE}>
        <rect width={size.width} height={RULER_SIZE} fill="#F6ECD9" />
        {xs.map((m) => {
          const x = toScreenX(m);
          return (
            <g key={m}>
              <line x1={x} y1={RULER_SIZE - 6} x2={x} y2={RULER_SIZE} stroke="#B9A889" strokeWidth={1} />
              <text x={x + 2} y={11} fontSize={9} fill="#62553F" fontFamily="system-ui, sans-serif">
                {formatTick(m)}
              </text>
            </g>
          );
        })}
        {cursorM && (
          <line
            x1={toScreenX(cursorM.x)}
            y1={0}
            x2={toScreenX(cursorM.x)}
            y2={RULER_SIZE}
            stroke="#D9603B"
            strokeWidth={1}
          />
        )}
        <line x1={0} y1={RULER_SIZE - 0.5} x2={size.width} y2={RULER_SIZE - 0.5} stroke="#EEDFC4" />
      </svg>

      <svg className="ruler ruler-left" width={RULER_SIZE} height={size.height}>
        <rect width={RULER_SIZE} height={size.height} fill="#F6ECD9" />
        {ys.map((m) => {
          const y = toScreenY(m);
          return (
            <g key={m}>
              <line x1={RULER_SIZE - 6} y1={y} x2={RULER_SIZE} y2={y} stroke="#B9A889" strokeWidth={1} />
              <text
                x={9}
                y={y - 3}
                fontSize={9}
                fill="#62553F"
                fontFamily="system-ui, sans-serif"
                transform={`rotate(-90 9 ${y - 3})`}
                textAnchor="start"
              >
                {formatTick(m)}
              </text>
            </g>
          );
        })}
        {cursorM && (
          <line
            x1={0}
            y1={toScreenY(cursorM.y)}
            x2={RULER_SIZE}
            y2={toScreenY(cursorM.y)}
            stroke="#D9603B"
            strokeWidth={1}
          />
        )}
        <line x1={RULER_SIZE - 0.5} y1={0} x2={RULER_SIZE - 0.5} y2={size.height} stroke="#EEDFC4" />
      </svg>

      <div className="ruler-corner" style={{ width: RULER_SIZE, height: RULER_SIZE }}>
        m
      </div>
    </>
  );
}

const formatTick = (m: number): string =>
  Number.isInteger(m) ? String(m) : m.toFixed(2).replace(/\.?0+$/, '').replace('.', ',');
