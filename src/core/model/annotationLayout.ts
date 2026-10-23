import { formatHeights } from '@core/library/obstacles';
import type { HeightTable, InfoBox, Obstacle } from './types';

/**
 * Leiaute do quadro técnico e da tabela de alturas, em milímetros de papel.
 *
 * Vive aqui, no núcleo, por um motivo prático: o desenho e a SELEÇÃO
 * precisam concordar. Se o retângulo de seleção fosse estimado por fora,
 * ele mentiria sobre o que está desenhado — clicar acertaria o vazio e
 * erraria a letra. Uma conta só, dois consumidores.
 */

export interface LaidOutCell {
  xMm: number;
  yMm: number;
  widthMm: number;
  label: string;
  value: string;
  /** Onde o valor começa, a partir do canto da célula (logo após o título). */
  valueXMm: number;
}

export interface BoxLayout {
  widthMm: number;
  heightMm: number;
  rowHeightMm: number;
  cells: LaidOutCell[];
}

/** Respiro interno do quadro, proporcional à letra. */
const padding = (sizeMm: number) => sizeMm * 0.8;

export function infoBoxLayout(box: InfoBox): BoxLayout {
  const ativos = box.fields.filter((f) => f.enabled);
  const colunas = Math.max(1, Math.round(box.columns));
  const alturaLinha = box.style.sizeMm * 1.75;
  const pad = padding(box.style.sizeMm);
  const larguraColuna = (box.widthMm - pad * 2) / colunas;

  // Preenchimento por COLUNA, não por linha: é assim que os croquis
  // imprimem a faixa de cabeçalho, com cada bloco de assunto junto.
  const porColuna = Math.ceil(ativos.length / colunas) || 1;

  // O valor começa logo depois do título mais longo DA SUA COLUNA (B-70):
  // alinhado à direita da célula, ele ficava longe do título e, com mais de
  // uma coluna, parecia pertencer à coluna vizinha. A largura do título é
  // estimada pela média de letra da Helvetica (0,56 em).
  const s = box.style.sizeMm;
  const inicioDoValor = new Map<number, number>();
  ativos.forEach((campo, i) => {
    const col = Math.floor(i / porColuna);
    const largura = campo.label.length * s * 0.56 + s * 0.8;
    inicioDoValor.set(col, Math.max(inicioDoValor.get(col) ?? 0, largura));
  });

  const cells = ativos.map((campo, i) => ({
    xMm: pad + Math.floor(i / porColuna) * larguraColuna,
    yMm: pad + (i % porColuna) * alturaLinha,
    widthMm: larguraColuna,
    valueXMm: inicioDoValor.get(Math.floor(i / porColuna)) ?? 0,
    label: campo.label,
    value: campo.value,
  }));

  return {
    widthMm: box.widthMm,
    heightMm: pad * 2 + porColuna * alturaLinha,
    rowHeightMm: alturaLinha,
    cells,
  };
}

export interface HeightRow {
  /** "7" ou "8A": o mesmo rótulo que o croqui imprime ao lado do obstáculo. */
  label: string;
  heights: string;
  spread: string;
  note: string;
}

export interface TableLayout {
  widthMm: number;
  heightMm: number;
  rowHeightMm: number;
  columns: { titulo: string; xMm: number; widthMm: number }[];
  rows: HeightRow[];
}

/**
 * Obstáculos numerados, na ordem do croqui.
 *
 * Sem número não entra: a tabela é o índice da prova, e uma linha sem
 * número não diria a que salto pertence.
 */
export function heightRows(obstacles: Obstacle[]): HeightRow[] {
  return obstacles
    .map((o) => ({ o, n: parseInt(o.number, 10) }))
    .filter((x): x is { o: Obstacle; n: number } => Number.isFinite(x.n))
    .sort((a, b) => a.n - b.n || a.o.letter.localeCompare(b.o.letter))
    .map(({ o, n }) => ({
      label: `${n}${o.letter}`,
      heights: formatHeights(o),
      spread: o.spreadM != null ? o.spreadM.toFixed(2).replace('.', ',') : '',
      note: o.note,
    }));
}

export function heightTableLayout(table: HeightTable, obstacles: Obstacle[]): TableLayout {
  const rows = heightRows(obstacles);
  const pad = padding(table.style.sizeMm);
  const alturaLinha = table.style.rowHeightMm;

  const larguras: { titulo: string; widthMm: number }[] = [
    { titulo: 'Nº', widthMm: table.style.sizeMm * 4 },
    { titulo: 'Altura', widthMm: table.style.sizeMm * 4.5 * Math.max(1, table.elementColumns) },
  ];
  if (table.showSpread) larguras.push({ titulo: 'Largura', widthMm: table.style.sizeMm * 6 });
  if (table.showNote) larguras.push({ titulo: 'Observação', widthMm: table.style.sizeMm * 12 });

  let x = pad;
  const columns = larguras.map((c) => {
    const col = { titulo: c.titulo, xMm: x, widthMm: c.widthMm };
    x += c.widthMm;
    return col;
  });

  return {
    widthMm: x + pad,
    // Uma linha a mais para o cabeçalho da tabela.
    heightMm: pad * 2 + (rows.length + 1) * alturaLinha,
    rowHeightMm: alturaLinha,
    columns,
    rows,
  };
}
