import { formatHeights } from '@core/library/obstacles';
import type { CourseDocument, HeightTable, InfoBox, Obstacle } from './types';
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

export interface SecaoDoQuadro {
  /** Onde a seção começa, da esquerda do quadro (0 com as seções empilhadas). */
  xMm: number;
  /** Fio que separa a seção do que vem antes; −1 quando ela abre o quadro. */
  linhaYMm: number;
  /** Fio vertical, com as seções lado a lado; −1 quando não há. */
  linhaXMm: number;
  tituloYMm: number;
  titulo: string;
}

export interface BoxLayout {
  widthMm: number;
  heightMm: number;
  rowHeightMm: number;
  cells: LaidOutCell[];
  /**
   * Seções com título embaixo dos campos gerais: 1ª e 2ª fase (B-95) e o
   * desempate (B-92). Vazio quando nenhuma está ligada.
   */
  secoes: SecaoDoQuadro[];
}

/** Campo do bloco do desempate: vai para a seção própria, abaixo do resto. */
const doDesempate = (id: string) => id.startsWith('dsp');
/** Campo da 2ª fase (B-95). */
const daFase2 = (id: string) => id.startsWith('f2');
/** Campos de cima que viram a 1ª fase quando a 2ª está ligada. */
const DA_FASE1 = new Set(['tabela', 'velocidade', 'distancia', 'tempo', 'ideal', 'faixa', 'limite']);

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
  const soDesempate = parte === 'desempate' && desempate.length > 0;
  const fase2 = soDesempate ? [] : ligados.filter((f) => daFase2(f.id));
  const fase1 = fase2.length > 0 ? ligados.filter((f) => DA_FASE1.has(f.id)) : [];
  const principais = ligados.filter(
    (f) =>
      !doDesempate(f.id) &&
      !daFase2(f.id) &&
      !fase1.includes(f) &&
      (!soDesempate || f.id === 'prova'),
  );
  const colunas = Math.max(1, Math.round(box.columns));
  const alturaLinha = box.style.sizeMm * 1.75;
  const pad = padding(box.style.sizeMm);
  const larguraColuna = (box.widthMm - pad * 2) / colunas;
  const s = box.style.sizeMm;
  const larguraTitulo = (campo: (typeof ligados)[number]) => fieldLabel(campo).length * s * 0.56 + s * 0.8;

  // Um bloco de campos a partir de `topo`: preenchido por COLUNA, não por
  // linha, como os croquis imprimem a faixa de cabeçalho. O valor começa
  // logo depois do título mais longo DA SUA COLUNA (B-70); a largura do
  // título é estimada pela média de letra da Helvetica (0,56 em).
  const bloco = (campos: typeof ligados, topo: number, x0 = 0) => {
    const porColuna = Math.ceil(campos.length / colunas) || 1;
    const inicioDoValor = new Map<number, number>();
    campos.forEach((campo, i) => {
      const col = Math.floor(i / porColuna);
      inicioDoValor.set(col, Math.max(inicioDoValor.get(col) ?? 0, larguraTitulo(campo)));
    });
    const cells = campos.map((campo, i) => ({
      xMm: x0 + pad + Math.floor(i / porColuna) * larguraColuna,
      yMm: topo + (i % porColuna) * alturaLinha,
      widthMm: larguraColuna,
      valueXMm: inicioDoValor.get(Math.floor(i / porColuna)) ?? 0,
      label: fieldLabel(campo),
      value: campo.value,
    }));
    return { cells, altura: campos.length === 0 ? 0 : porColuna * alturaLinha };
  };

  const comSecoes = fase2.length > 0 || desempate.length > 0;
  if (box.blocos === 'lado' && comSecoes) return deitado();

  const cima = bloco(principais, pad);
  const cells = [...cima.cells];
  const secoes: SecaoDoQuadro[] = [];
  let fundo = pad + cima.altura;

  // Cada seção: um fio, o título e os campos, embaixo do que já está.
  const secao = (titulo: string, campos: typeof ligados, largos: (typeof ligados)[number][] = []) => {
    const temAcima = fundo > pad;
    const linhaY = fundo + (temAcima ? pad * 0.5 : 0);
    const tituloY = linhaY + pad * 0.5;
    let topo = tituloY + alturaLinha;
    // Campo de valor longo (a ordem do desempate) ocupa a largura toda,
    // para não invadir a coluna vizinha.
    for (const campo of largos) {
      cells.push(campoLargo(campo, topo, 0));
      topo += alturaLinha;
    }
    const b = bloco(campos, topo);
    cells.push(...b.cells);
    secoes.push({ xMm: 0, linhaYMm: temAcima ? linhaY : -1, linhaXMm: -1, tituloYMm: tituloY, titulo });
    fundo = topo + b.altura;
  };

  for (const s of secoesDoQuadro()) secao(s.titulo, s.campos, s.largos);

  return {
    widthMm: box.widthMm,
    heightMm: secoes.length === 0 ? pad * 2 + Math.max(cima.altura, alturaLinha) : fundo + pad,
    rowHeightMm: alturaLinha,
    cells,
    secoes,
  };

  function campoLargo(campo: (typeof ligados)[number], topo: number, x0: number): LaidOutCell {
    return {
      xMm: x0 + pad,
      yMm: topo,
      widthMm: box.widthMm - pad * 2,
      valueXMm: larguraTitulo(campo),
      label: fieldLabel(campo),
      value: campo.value,
    };
  }

  function secoesDoQuadro() {
    const out: { titulo: string; campos: typeof ligados; largos: typeof ligados }[] = [];
    if (fase2.length > 0) {
      out.push({ titulo: t('quadro.secaoFase1'), campos: fase1, largos: [] });
      out.push({ titulo: t('quadro.secaoFase2'), campos: fase2, largos: [] });
    }
    if (desempate.length > 0) {
      const ordem = desempate.find((f) => f.id === 'dspOrdem');
      out.push({
        titulo: t('quadro.secaoDesempate'),
        campos: desempate.filter((f) => f !== ordem),
        largos: ordem ? [ordem] : [],
      });
    }
    return out;
  }

  /**
   * O quadro deitado, para a faixa da folha: os campos gerais e cada seção
   * viram blocos lado a lado, com um fio vertical entre eles. Cada bloco
   * é uma coluna só, da largura do que tem dentro (título mais longo e
   * valor mais longo): fica baixo e comprido, o que a faixa pede.
   */
  function deitado(): BoxLayout {
    const cells: LaidOutCell[] = [];
    const secoes: SecaoDoQuadro[] = [];
    let x0 = 0;
    let fundo = pad;
    const larguraValor = (campo: (typeof ligados)[number]) => campo.value.length * s * 0.62;
    const coluna = (campos: typeof ligados, topo: number) => {
      const valorX = Math.max(0, ...campos.map(larguraTitulo));
      const largura = pad * 2 + Math.max(s * 12, valorX + Math.max(0, ...campos.map(larguraValor)));
      campos.forEach((campo, i) =>
        cells.push({
          xMm: x0 + pad,
          yMm: topo + i * alturaLinha,
          widthMm: largura - pad * 2,
          valueXMm: valorX,
          label: fieldLabel(campo),
          value: campo.value,
        }),
      );
      fundo = Math.max(fundo, topo + campos.length * alturaLinha);
      return largura;
    };
    if (principais.length > 0) x0 += coluna(principais, pad);
    for (const sec of secoesDoQuadro()) {
      const tituloY = pad * 0.5;
      const campos = [...sec.largos, ...sec.campos];
      const tituloL = sec.titulo.length * s * 0.62 + pad * 2;
      const inicio = x0;
      const largura = Math.max(tituloL, coluna(campos, tituloY + alturaLinha));
      secoes.push({ xMm: inicio, linhaYMm: -1, linhaXMm: inicio > 0 ? inicio : -1, tituloYMm: tituloY, titulo: sec.titulo });
      x0 = inicio + largura;
    }
    return { widthMm: x0, heightMm: fundo + pad, rowHeightMm: alturaLinha, cells, secoes };
  }
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

/**
 * O quadro cresceu ou encolheu (o bloco do desempate entrou ou saiu): o
 * que estava logo abaixo dele, na mesma faixa da folha, acompanha. Sem
 * isto o quadro maior cobria a tabela de alturas posta embaixo dele.
 */
export function empurraAbaixo(doc: CourseDocument, box: InfoBox, antes: number, depois: number): void {
  const delta = depois - antes;
  if (Math.abs(delta) < 0.01) return;
  const fundo = box.posMm.y + antes;
  const x0 = box.posMm.x;
  const x1 = box.posMm.x + infoBoxLayout(box).widthMm;
  for (const o of doc.objects) {
    if (o.id === box.id || (o.kind !== 'heighttable' && o.kind !== 'infobox')) continue;
    const largura =
      o.kind === 'infobox'
        ? o.widthMm
        : heightTableLayout(o, doc.objects.filter((x): x is Obstacle => x.kind === 'obstacle')).widthMm;
    const naFaixa = o.posMm.x < x1 && o.posMm.x + largura > x0;
    if (naFaixa && o.posMm.y >= fundo - 1) o.posMm = { ...o.posMm, y: o.posMm.y + delta };
  }
}

