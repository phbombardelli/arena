/**
 * Os três espaços de coordenadas do editor.
 *
 *   MODEL   metros      — geometria real: pista, obstáculos, traçados
 *   PAPER   milímetros  — página, espessuras de linha, corpo de texto
 *   SCREEN  pixels CSS  — só o viewport interativo
 *
 * A conversão MODEL→PAPER passa pela escala de impressão do documento
 * (printScale = 250 significa 1:250). A conversão PAPER→SCREEN passa pelo
 * zoom do viewport (px por mm). O sistema SVG interno trabalha em PAPER,
 * o que torna a tela WYSIWYG em relação ao papel.
 */

import { formatDecimal } from '@core/i18n/i18n';

export type Meters = number;
export type Millimeters = number;
export type Pixels = number;

/** Denominador da escala de impressão: 250 ⇒ 1:250. */
export type PrintScale = number;

/** 1 m no mundo ocupa quantos mm no papel. */
export const mmPerMeter = (printScale: PrintScale): number => 1000 / printScale;

export const metersToPaper = (m: Meters, printScale: PrintScale): Millimeters =>
  (m * 1000) / printScale;

export const paperToMeters = (mm: Millimeters, printScale: PrintScale): Meters =>
  (mm * printScale) / 1000;

/**
 * Escalas redondas usadas em desenho técnico. "Ajustar ao papel" nunca
 * devolve 1:237 — arredonda para a escala redonda imediatamente superior.
 */
export const STANDARD_SCALES: readonly PrintScale[] = [
  // Começa em 1:250 (B-71): é a primeira em que cabe um picadeiro de
  // adestramento de 20 × 60 m. Escalas maiores não servem a nenhuma pista;
  // ainda se podem digitar, e croqui antigo abre na escala em que foi salvo.
  250, 300, 400, 500, 600, 750, 1000,
] as const;

/** Menor escala padrão que ainda comporta a extensão pedida. */
export function nextStandardScale(exact: PrintScale): PrintScale {
  for (const s of STANDARD_SCALES) if (s >= exact) return s;
  return STANDARD_SCALES[STANDARD_SCALES.length - 1]!;
}

/**
 * Escala necessária para que uma área de `widthM` × `heightM` caiba na
 * área útil do papel, já arredondada para uma escala padrão.
 */
export function fitScale(
  widthM: Meters,
  heightM: Meters,
  usableWidthMm: Millimeters,
  usableHeightMm: Millimeters,
): PrintScale {
  if (widthM <= 0 || heightM <= 0) return 250;
  const needed = Math.max((widthM * 1000) / usableWidthMm, (heightM * 1000) / usableHeightMm);
  return nextStandardScale(needed);
}

/** Formatos de página em mm, sempre no formato retrato (largura × altura). */
export const PAGE_FORMATS = {
  A4: { widthMm: 210, heightMm: 297 },
  A3: { widthMm: 297, heightMm: 420 },
  A2: { widthMm: 420, heightMm: 594 },
  A1: { widthMm: 594, heightMm: 841 },
} as const;

export type PageFormat = keyof typeof PAGE_FORMATS | 'custom';
export type Orientation = 'portrait' | 'landscape';

export type SheetCorner =
  | 'inferior-direito'
  | 'inferior-esquerdo'
  | 'superior-direito'
  | 'superior-esquerdo';

/**
 * Legenda de escala impressa na folha.
 *
 * Croqui sem escala declarada não se confere: quem recebe a folha precisa
 * poder medir com régua e saber o que o milímetro vale. Os planos
 * oficiais trazem isso escrito, e alguns trazem a barra gráfica, que
 * continua correta mesmo se a folha for fotocopiada com redução.
 */
export interface ScaleLabel {
  visible: boolean;
  corner: SheetCorner;
  /** A barra gráfica, além do "1:250" escrito. */
  bar: boolean;
}

export interface PageSetup {
  format: PageFormat;
  widthMm: Millimeters;
  heightMm: Millimeters;
  orientation: Orientation;
  marginsMm: { top: number; right: number; bottom: number; left: number };
  printScale: PrintScale;
  scaleLabel: ScaleLabel;
}

/** Dimensões da página já considerando a orientação. */
export function pageSize(page: PageSetup): { widthMm: Millimeters; heightMm: Millimeters } {
  const portrait = page.format === 'custom'
    ? { widthMm: page.widthMm, heightMm: page.heightMm }
    : PAGE_FORMATS[page.format];
  return page.orientation === 'landscape'
    ? { widthMm: portrait.heightMm, heightMm: portrait.widthMm }
    : { widthMm: portrait.widthMm, heightMm: portrait.heightMm };
}

/** Área da página descontadas as margens. */
export function usableArea(page: PageSetup): {
  widthMm: Millimeters;
  heightMm: Millimeters;
  xMm: Millimeters;
  yMm: Millimeters;
} {
  const { widthMm, heightMm } = pageSize(page);
  const m = page.marginsMm;
  return {
    xMm: m.left,
    yMm: m.top,
    widthMm: Math.max(0, widthMm - m.left - m.right),
    heightMm: Math.max(0, heightMm - m.top - m.bottom),
  };
}

/** Formata metros para exibição, com o separador decimal da língua. */
export function formatMeters(m: Meters, decimals = 2): string {
  return formatDecimal(m, decimals);
}
