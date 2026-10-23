/**
 * Todas as medidas de anotação em MILÍMETROS DE PAPEL — não em metros do
 * modelo e não em pixels. É o que garante que um número continue com 3 mm
 * de altura impressa tanto em 1:150 quanto em 1:500.
 */
export const stroke = {
  hairline: 0.13,
  thin: 0.25,
  regular: 0.35,
  medium: 0.5,
  thick: 0.7,
  heavy: 1.0,
} as const;

export const text = {
  tiny: 1.8,
  small: 2.2,
  regular: 2.8,
  medium: 3.5,
  large: 5,
  title: 7,
} as const;

export const color = {
  ink: '#111111',
  arenaLine: '#1a1a1a',
  arenaFill: '#ffffff',
  gridMinor: '#e6e6e6',
  gridMajor: '#cfcfcf',
  gridAxis: '#b0b0b0',
  distance: '#d32020',
  height: '#111111',
  path: '#6b6b6b',
  // Seleção e mesa seguem a identidade do SAPH (decisão 53): dourado e
  // tons de papel. Só tela — nada disso sai no PDF.
  // Seleção no desenho em dourado, o do logo (decisão 85).
  selection: '#B8975A',
  selectionFill: 'rgba(184, 151, 90, 0.14)',
  warning: '#e08a00',
  water: '#2b7fd4',
  paper: '#ffffff',
  pageShadow: 'rgba(0,0,0,0.18)',
  // Mesa em bege neutro (decisão 85): a folha branca destaca e o dourado
  // da seleção aparece sobre ela.
  canvasBg: '#E6DFD0',
} as const;

/** Padrões de traço, em milímetros de papel. */
export const dashPattern = {
  solid: undefined,
  dashed: '2.2 1.4',
  dotted: '0.4 1.0',
  dashdot: '3 1.2 0.6 1.2',
} as const;

export const font = {
  family: 'Helvetica, Arial, sans-serif',
} as const;
