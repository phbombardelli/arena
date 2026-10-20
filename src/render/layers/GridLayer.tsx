import { visibleGridStep } from '@core/geometry/snap';
import { insideIntervals } from '@core/geometry/hatch';
import { mmPerMeter } from '@core/scale/units';
import type { GridSettings } from '@core/model/types';
import type { MeasureFrame } from '@core/model/measureFrame';
import type { Vec2 } from '@core/geometry/vec';
import { color, stroke } from '@render/style/tokens';

interface Props {
  grid: GridSettings;
  printScale: number;
  originMm: Vec2;
  /** Canto de onde a grade conta e contorno onde ela é recortada. */
  frame: MeasureFrame;
  /** Área visível, em milímetros de papel. */
  viewBoxMm: { x: number; y: number; width: number; height: number };
  /** 0 no modo papel: aí o passo vem da escala de impressão. */
  metersPerPixel: number;
}

const MAX_LINES = 400;
/** No papel, o quadradinho menor não fica abaixo disso (mm). */
const PAPER_MIN_CELL_MM = 4;

/**
 * Grade em metros reais (decisão 60).
 *
 * - Só DENTRO da pista: cada linha é recortada no contorno, cantos
 *   arredondados incluídos. Sem pista, cobre a área toda.
 * - Conta a partir do canto superior esquerdo da pista: a primeira linha
 *   grossa está nele, e os quadrados seguem dali.
 * - Sai na folha como aparece na tela: quem não quer a grade impressa
 *   desliga em Exibir › Grade.
 *
 * O espaçamento é um número redondo de metros — conforme o zoom na tela e
 * conforme a escala no papel.
 */
export function GridLayer({ grid, printScale, originMm, frame, viewBoxMm, metersPerPixel }: Props) {
  if (!grid.visible) return null;

  const k = mmPerMeter(printScale);
  const automatico =
    metersPerPixel > 0
      ? visibleGridStep(metersPerPixel, 8)
      : visibleGridStep(PAPER_MIN_CELL_MM / k, 1);
  const minor = grid.stepM > 0 ? grid.stepM : automatico;
  const major = minor * Math.max(2, grid.subdivisions);
  const o = frame.originM;

  // Limites da área visível convertidos para metros do modelo.
  let x0 = (viewBoxMm.x - originMm.x) / k;
  let x1 = (viewBoxMm.x + viewBoxMm.width - originMm.x) / k;
  let y0 = (viewBoxMm.y - originMm.y) / k;
  let y1 = (viewBoxMm.y + viewBoxMm.height - originMm.y) / k;
  if (frame.outline) {
    const xs = frame.outline.map((p) => p.x);
    const ys = frame.outline.map((p) => p.y);
    x0 = Math.max(x0, Math.min(...xs));
    x1 = Math.min(x1, Math.max(...xs));
    y0 = Math.max(y0, Math.min(...ys));
    y1 = Math.min(y1, Math.max(...ys));
  }
  if (x1 <= x0 || y1 <= y0) return null;
  if ((x1 - x0) / minor > MAX_LINES || (y1 - y0) / minor > MAX_LINES) return null;

  const ehMaior = (m: number, base: number) => {
    const r = Math.abs((m - base) % major);
    return r < minor / 1000 || major - r < minor / 1000;
  };
  // Valores da grade a partir do canto, dentro de [a, b].
  const passos = (a: number, b: number, base: number) => {
    const out: number[] = [];
    for (let m = base + Math.ceil((a - base) / minor - 1e-9) * minor; m <= b + 1e-9; m += minor) out.push(m);
    return out;
  };

  const px = (m: number) => originMm.x + m * k;
  const py = (m: number) => originMm.y + m * k;
  const vb = viewBoxMm;

  const linhas: { key: string; x1: number; y1: number; x2: number; y2: number; maior: boolean }[] = [];
  for (const m of passos(x0, x1, o.x)) {
    const trechos: [number, number][] = frame.outline
      ? insideIntervals(frame.outline, 'x', m)
      : [[(vb.y - originMm.y) / k, (vb.y + vb.height - originMm.y) / k]];
    trechos.forEach(([a, b], i) =>
      linhas.push({ key: `v${m}-${i}`, x1: px(m), y1: py(a), x2: px(m), y2: py(b), maior: ehMaior(m, o.x) }),
    );
  }
  for (const m of passos(y0, y1, o.y)) {
    const trechos: [number, number][] = frame.outline
      ? insideIntervals(frame.outline, 'y', m)
      : [[(vb.x - originMm.x) / k, (vb.x + vb.width - originMm.x) / k]];
    trechos.forEach(([a, b], i) =>
      linhas.push({ key: `h${m}-${i}`, x1: px(a), y1: py(m), x2: px(b), y2: py(m), maior: ehMaior(m, o.y) }),
    );
  }

  return (
    <g data-layer="grid" pointerEvents="none">
      {linhas.map((l) => (
        <line
          key={l.key}
          x1={l.x1}
          y1={l.y1}
          x2={l.x2}
          y2={l.y2}
          stroke={l.maior ? color.gridMajor : color.gridMinor}
          strokeWidth={l.maior ? stroke.thin : stroke.hairline}
        />
      ))}
    </g>
  );
}
