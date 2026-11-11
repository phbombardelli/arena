import { formatHeights } from '@core/library/obstacles';
import type { HeightTable, InfoBox, Obstacle } from './types';
import { t } from '@core/i18n/i18n';
import { fieldLabel } from '@core/library/annotations';

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
  /**
   * Bloco do desempate (B-92): o fio que o separa, o título, e onde o
   * título fica. Ausente quando o bloco está desligado.
   */
  secao?: { linhaYMm: number; tituloYMm: number; titulo: string };
}

/** Campo do bloco do desempate: vai para a seção própria, abaixo do resto. */
const doDesempate = (id: string) => id.startsWith('dsp');

/** Respiro interno do quadro, proporcional à letra. */
const padding = (sizeMm: number) => sizeMm * 0.8;

/**
 * Que parte do quadro sai (B-92). Com o desempate em página própria, cada
 * página leva só o seu: a do percurso sem o bloco do desempate, a do
 * desempate só com a prova e o bloco dele.
 */
export type ParteDoQuadro = 'tudo' | 'percurso' | 'desempate';

export function infoBoxLayout(box: InfoBox, parte: ParteDoQuadro = 'tudo'): BoxLayout {
  const ligados = box.fields.filter((f) => f.enabled);
  const desempate = parte === 'percurso' ? [] : ligados.filter((f) => doDesempate(f.id));
  const principais = ligados.filter(
    (f) => !doDesempate(f.id) && (parte !== 'desempate' || desempate.length === 0 || f.id === 'prova'),
  );
  const colunas = Math.max(1, Math.round(box.columns));
  const alturaLinha = box.style.sizeMm * 1.75;
  const pad = padding(box.style.sizeMm);
  const larguraColuna = (box.widthMm - pad * 2) / colunas;
  const s = box.style.sizeMm;

  // Um bloco de campos a partir de `topo`: preenchido por COLUNA, não por
  // linha, como os croquis imprimem a faixa de cabeçalho. O valor começa
  // logo depois do título mais longo DA SUA COLUNA (B-70); a largura do
  // título é estimada pela média de letra da Helvetica (0,56 em).
  const bloco = (campos: typeof ligados, topo: number) => {
    const porColuna = Math.ceil(campos.length / colunas) || 1;
    const inicioDoValor = new Map<number, number>();
    campos.forEach((campo, i) => {
      const col = Math.floor(i / porColuna);
      const largura = fieldLabel(campo).length * s * 0.56 + s * 0.8;
      inicioDoValor.set(col, Math.max(inicioDoValor.get(col) ?? 0, largura));
    });
    const cells = campos.map((campo, i) => ({
      xMm: pad + Math.floor(i / porColuna) * larguraColuna,
      yMm: topo + (i % porColuna) * alturaLinha,
      widthMm: larguraColuna,
      valueXMm: inicioDoValor.get(Math.floor(i / porColuna)) ?? 0,
      label: fieldLabel(campo),
      value: campo.value,
    }));
    return { cells, altura: campos.length === 0 ? 0 : porColuna * alturaLinha };
  };

  const cima = bloco(principais, pad);
  if (desempate.length === 0) {
    return {
      widthMm: box.widthMm,
      heightMm: pad * 2 + Math.max(cima.altura, alturaLinha),
      rowHeightMm: alturaLinha,
      cells: cima.cells,
    };
  }

  // Bloco do desempate: um fio, o título e os campos, embaixo do resto.
  const linhaY = pad + cima.altura + (cima.altura > 0 ? pad * 0.5 : 0);
  const tituloY = linhaY + pad * 0.5;
  // A ordem é o valor longo ("1 (oxer)-4-5AB-7 (inv.)-…"): ocupa a largura
  // toda, para não invadir a coluna vizinha; o resto vai em colunas.
  const ordem = desempate.find((f) => f.id === 'dspOrdem');
  const resto = desempate.filter((f) => f !== ordem);
  const topoOrdem = tituloY + alturaLinha;
  const celulaOrdem = ordem
    ? [{
        xMm: pad,
        yMm: topoOrdem,
        widthMm: box.widthMm - pad * 2,
        valueXMm: fieldLabel(ordem).length * s * 0.56 + s * 0.8,
        label: fieldLabel(ordem),
        value: ordem.value,
      }]
    : [];
  const baixo = bloco(resto, topoOrdem + (ordem ? alturaLinha : 0));
  return {
    widthMm: box.widthMm,
    heightMm: topoOrdem + (ordem ? alturaLinha : 0) + baixo.altura + pad,
    rowHeightMm: alturaLinha,
    cells: [...cima.cells, ...celulaOrdem, ...baixo.cells],
    secao: { linhaYMm: cima.altura > 0 ? linhaY : -1, tituloYMm: tituloY, titulo: t('quadro.secaoDesempate') },
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
    { titulo: t('tabela.numero'), widthMm: table.style.sizeMm * 4 },
    { titulo: t('tabela.altura'), widthMm: table.style.sizeMm * 4.5 * Math.max(1, table.elementColumns) },
  ];
  if (table.showSpread) larguras.push({ titulo: t('tabela.largura'), widthMm: table.style.sizeMm * 6 });
  if (table.showNote) larguras.push({ titulo: t('tabela.observacao'), widthMm: table.style.sizeMm * 12 });

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
