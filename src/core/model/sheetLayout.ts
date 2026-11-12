import { usableArea } from '@core/scale/units';
import type { LadoDaFolha } from '@core/scale/units';
import { infoBoxLayout } from './annotationLayout';
import { arenaExtent } from './arena';
import { anotacaoMm, centerOnPage, firstArena, fitScaleToPage, freeAreaMm } from './document';
import type { RectMm } from './document';
import type { CourseDocument, HeightTable, InfoBox, Logo, SceneObject } from './types';

/**
 * Arrumação automática da folha (B-103, decisão 104).
 *
 * Quadro técnico, tabela de alturas e logos vão para uma zona só da
 * folha: uma COLUNA (direita ou esquerda), um embaixo do outro, ou uma
 * FAIXA (embaixo ou em cima), um ao lado do outro. No automático, o
 * programa testa os quatro lados e fica com o que deixa a pista maior; a
 * pista se reenquadra no que sobra.
 *
 * Roda depois de cada edição (documentStore), então o quadro que cresce
 * (duas fases, desempate) ou a folha que vira retrato rearruma tudo sem
 * ninguém pedir. O que o usuário arrastou fica `livre` e não é tocado: os
 * outros se arrumam em volta. "Rearrumar a folha" devolve tudo ao
 * automático.
 *
 * A pista só se reenquadra quando a faixa ocupada muda (outro lado, outra
 * espessura, outra folha) — mover a pista ou um quadro livre não a puxa de
 * volta ao centro. E a escala só muda quando a pista deixa de caber.
 */

export const FOLGA_MM = 4;
const LADOS: LadoDaFolha[] = ['direita', 'baixo', 'esquerda', 'cima'];

type Papel = InfoBox | HeightTable | Logo;

const ehPapel = (o: SceneObject): o is Papel =>
  o.kind === 'infobox' || o.kind === 'heighttable' || o.kind === 'logo';

interface Item {
  obj: Papel;
  /** Na faixa, o quadro técnico deita (blocos lado a lado) e muda de tamanho. */
  faixa?: { w: number; h: number };
  w: number;
  h: number;
}

const ORDEM_COLUNA: Record<Papel['kind'], number> = { logo: 0, infobox: 1, heighttable: 2 };
const ORDEM_FAIXA: Record<Papel['kind'], number> = { infobox: 0, heighttable: 1, logo: 2 };

const ehColuna = (lado: LadoDaFolha) => lado === 'direita' || lado === 'esquerda';

/** Os itens com o tamanho que terão naquele lado (o quadro deita na faixa). */
const noLado = (itens: Item[], lado: LadoDaFolha): Item[] =>
  ehColuna(lado) ? itens : itens.map((i) => (i.faixa ? { ...i, ...i.faixa } : i));

function itensDaFolha(doc: CourseDocument): { auto: Item[]; livres: RectMm[] } {
  const auto: Item[] = [];
  const livres: RectMm[] = [];
  for (const o of doc.objects) {
    if (!ehPapel(o) || !o.visible) continue;
    const r = anotacaoMm(doc, o);
    if (!r) continue;
    if (o.livre || o.locked) livres.push(r);
    else if (o.kind === 'infobox') {
      const empe = infoBoxLayout({ ...o, blocos: undefined });
      const deitado = infoBoxLayout({ ...o, blocos: 'lado' });
      // Deita só se houver seções e se couber na largura da folha.
      const cabe = deitado.widthMm <= usableArea(doc.page).widthMm + 0.5;
      const muda = deitado.widthMm !== empe.widthMm && cabe;
      auto.push({
        obj: o,
        w: empe.widthMm,
        h: empe.heightMm,
        ...(muda ? { faixa: { w: deitado.widthMm, h: deitado.heightMm } } : {}),
      });
    } else auto.push({ obj: o, w: r.widthMm, h: r.heightMm });
  }
  return { auto, livres };
}

/**
 * Divide os itens em filas (colunas lado a lado, ou faixas uma sobre a
 * outra): enche uma até a altura (ou largura) útil e abre a próxima, mais
 * para dentro da folha. Quadro de duas fases mais tabela não cabem numa
 * coluna só de A4 deitada; em duas, cabem.
 */
function filas(doc: CourseDocument, itens: Item[], lado: LadoDaFolha): Item[][] {
  const u = usableArea(doc.page);
  const coluna = ehColuna(lado);
  const ordem = coluna ? ORDEM_COLUNA : ORDEM_FAIXA;
  const disponivel = coluna ? u.heightMm : u.widthMm;
  const out: Item[][] = [];
  let atual: Item[] = [];
  let usado = 0;
  for (const it of [...itens].sort((a, b) => ordem[a.obj.kind] - ordem[b.obj.kind])) {
    const tam = coluna ? it.h : it.w;
    if (atual.length > 0 && usado + FOLGA_MM + tam > disponivel + 0.5) {
      out.push(atual);
      atual = [];
      usado = 0;
    }
    usado += (atual.length > 0 ? FOLGA_MM : 0) + tam;
    atual.push(it);
  }
  if (atual.length > 0) out.push(atual);
  return out;
}

const espessuraDa = (fila: Item[], coluna: boolean) => Math.max(...fila.map((i) => (coluna ? i.w : i.h)));

/** Quanto a zona ocupa da folha (largura das colunas, altura das faixas) e se cada item cabe. */
function medidas(doc: CourseDocument, itens: Item[], lado: LadoDaFolha): { espessura: number; cabe: boolean } {
  if (itens.length === 0) return { espessura: 0, cabe: true };
  const coluna = ehColuna(lado);
  const u = usableArea(doc.page);
  const fs = filas(doc, itens, lado);
  const espessura = fs.reduce((s, f) => s + espessuraDa(f, coluna), 0) + FOLGA_MM * (fs.length - 1);
  const maior = Math.max(...itens.map((i) => (coluna ? i.h : i.w)));
  const largo = coluna ? u.widthMm : u.heightMm;
  return { espessura, cabe: maior <= (coluna ? u.heightMm : u.widthMm) + 0.5 && espessura < largo * 0.75 };
}

/**
 * Nota de cada lado: quanto a pista cresceria no que sobra (maior é
 * melhor). Lado em que os itens não cabem perde para qualquer um em que cabem.
 */
function notaDoLado(doc: CourseDocument, itens: Item[], lado: LadoDaFolha): { cabe: boolean; nota: number } {
  const u = usableArea(doc.page);
  const { espessura, cabe } = medidas(doc, noLado(itens, lado), lado);
  const coluna = ehColuna(lado);
  const sobraW = coluna ? u.widthMm - espessura - FOLGA_MM : u.widthMm;
  const sobraH = coluna ? u.heightMm : u.heightMm - espessura - FOLGA_MM;
  const arena = firstArena(doc);
  const e = arena ? arenaExtent(arena) : { widthM: 80, heightM: 40 };
  const nota = Math.max(0, Math.min(sobraW / Math.max(1, e.widthM), sobraH / Math.max(1, e.heightM)));
  return { cabe, nota };
}

/** O lado em que os quadros vão: o pedido, ou o melhor no automático. */
export function escolheLado(doc: CourseDocument, itens: Item[] = itensDaFolha(doc).auto): LadoDaFolha {
  const arranjo = doc.page.arranjo;
  if (arranjo && arranjo.zona !== 'auto') return arranjo.zona;
  const notas = LADOS.map((lado) => ({ lado, ...notaDoLado(doc, itens, lado) }));
  const possiveis = notas.filter((n) => n.cabe);
  const lista = possiveis.length > 0 ? possiveis : notas;
  // Na dúvida, a ordem de LADOS decide: coluna à direita, depois faixa embaixo.
  let melhor = lista[0]!;
  for (const n of lista) if (n.nota > melhor.nota * 1.01) melhor = n;
  // Não troca de lado por pouco: o último continua se perder menos de 5%.
  const ultima = lista.find((n) => n.lado === arranjo?.ultima);
  if (ultima && ultima.nota >= melhor.nota * 0.95) return ultima.lado;
  return melhor.lado;
}

const cruza = (a: RectMm, b: RectMm) =>
  a.xMm < b.xMm + b.widthMm - 0.01 &&
  b.xMm < a.xMm + a.widthMm - 0.01 &&
  a.yMm < b.yMm + b.heightMm - 0.01 &&
  b.yMm < a.yMm + a.heightMm - 0.01;

/**
 * Põe os itens automáticos na zona. Na coluna, encostados na margem de
 * fora, de cima para baixo; na faixa, encostados na margem de fora, da
 * esquerda para a direita. A segunda fila (se houver) fica mais para
 * dentro. Um item livre no caminho é pulado.
 */
function posiciona(doc: CourseDocument, itens: Item[], livres: RectMm[], lado: LadoDaFolha): void {
  const u = usableArea(doc.page);
  const coluna = ehColuna(lado);
  let recuo = 0;
  for (const fila of filas(doc, itens, lado)) {
    let cursor = coluna ? u.yMm : u.xMm;
    for (const it of fila) {
      const fixo =
        lado === 'direita' ? u.xMm + u.widthMm - recuo - it.w
        : lado === 'esquerda' ? u.xMm + recuo
        : lado === 'baixo' ? u.yMm + u.heightMm - recuo - it.h
        : u.yMm + recuo;
      let r: RectMm;
      for (let guarda = 0; ; guarda++) {
        r = coluna
          ? { xMm: fixo, yMm: cursor, widthMm: it.w, heightMm: it.h }
          : { xMm: cursor, yMm: fixo, widthMm: it.w, heightMm: it.h };
        const bate = livres.find((l) => cruza(l, r));
        if (!bate || guarda > livres.length) break;
        cursor = coluna ? bate.yMm + bate.heightMm + FOLGA_MM : bate.xMm + bate.widthMm + FOLGA_MM;
      }
      const x = Math.round(r.xMm * 10) / 10;
      const y = Math.round(r.yMm * 10) / 10;
      if (it.obj.posMm.x !== x || it.obj.posMm.y !== y) it.obj.posMm = { x, y };
      cursor += (coluna ? it.h : it.w) + FOLGA_MM;
    }
    recuo += espessuraDa(fila, coluna) + FOLGA_MM;
  }
}

/** Arruma os itens automáticos; devolve o lado e a assinatura da faixa ocupada. */
function arrumaAnotacoes(doc: CourseDocument): string | null {
  const arranjo = doc.page.arranjo;
  if (!arranjo) return null;
  const { auto, livres } = itensDaFolha(doc);
  const lado = escolheLado(doc, auto);
  if (arranjo.ultima !== lado) arranjo.ultima = lado;
  const itens = noLado(auto, lado);
  // O quadro deita na faixa (blocos lado a lado) e fica em pé na coluna.
  for (const it of auto) {
    if (it.obj.kind !== 'infobox') continue;
    const deita = !ehColuna(lado) && it.faixa != null;
    if (deita && it.obj.blocos !== 'lado') it.obj.blocos = 'lado';
    if (!deita && it.obj.blocos) delete it.obj.blocos;
  }
  posiciona(doc, itens, livres, lado);
  const u = usableArea(doc.page);
  const m = doc.page.marginsMm;
  const { espessura } = medidas(doc, itens, lado);
  return [
    Math.round(u.widthMm), Math.round(u.heightMm), m.top, m.right, m.bottom, m.left,
    auto.length > 0 ? lado : '-', Math.round(espessura),
  ].join('|');
}

/**
 * A pista no que sobra, na escala preferida se ela couber (senão, na
 * maior que cabe); depois, centraliza. Ligar e desligar as duas fases
 * volta à escala de antes.
 */
export function reenquadraPista(doc: CourseDocument): void {
  const arena = firstArena(doc);
  if (!arena) return;
  const area = freeAreaMm(doc);
  const e = arenaExtent(arena);
  const quer = doc.page.arranjo?.preferida ?? doc.page.printScale;
  const k = 1000 / quer;
  const cabe = e.widthM * k <= area.widthMm + 0.5 && e.heightM * k <= area.heightMm + 0.5;
  doc.page.printScale = cabe ? quer : fitScaleToPage(doc);
  centerOnPage(doc);
}

/**
 * Depois de cada edição. Arruma os quadros automáticos e, se a faixa que
 * eles ocupam mudou, reenquadra a pista.
 */
export function syncArranjo(doc: CourseDocument): void {
  const arranjo = doc.page.arranjo;
  if (!arranjo) return;
  // A escala mudou desde a última arrumação: foi o usuário, e é a que ele quer.
  if (arranjo.escala !== undefined && arranjo.escala !== doc.page.printScale) {
    arranjo.preferida = doc.page.printScale;
  }
  const chave = arrumaAnotacoes(doc);
  if (chave != null && firstArena(doc) && arranjo.chave !== chave) {
    // Primeira vez com pista: só reenquadra se já houver quadro arrumado.
    const tinha = arranjo.chave !== undefined || !chave.includes('|-|');
    arranjo.chave = chave;
    if (tinha) reenquadraPista(doc);
  }
  if (arranjo.escala !== doc.page.printScale) arranjo.escala = doc.page.printScale;
}

/**
 * O usuário pôs um item à mão: ele sai da arrumação. Os outros se
 * arrumam já, mas a pista fica onde está — senão ela pularia no meio do
 * arraste.
 */
export function soltaNaFolha(doc: CourseDocument, obj: SceneObject): void {
  if (!ehPapel(obj) || !doc.page.arranjo) return;
  if (!obj.livre) obj.livre = true;
  const chave = arrumaAnotacoes(doc);
  if (chave != null && firstArena(doc)) doc.page.arranjo.chave = chave;
}

/** "Rearrumar a folha": tudo volta ao automático, a escala se ajusta e a pista centraliza. */
export function rearrumaFolha(doc: CourseDocument): void {
  if (!doc.page.arranjo) doc.page.arranjo = { zona: 'auto' };
  delete doc.page.arranjo.ultima;
  for (const o of doc.objects) if (ehPapel(o) && o.livre) delete o.livre;
  const chave = arrumaAnotacoes(doc);
  if (firstArena(doc)) {
    doc.page.printScale = fitScaleToPage(doc);
    centerOnPage(doc);
    if (chave != null) doc.page.arranjo.chave = chave;
    doc.page.arranjo.preferida = doc.page.printScale;
    doc.page.arranjo.escala = doc.page.printScale;
  }
}
