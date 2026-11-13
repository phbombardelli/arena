import { escalaQueCabe, STANDARD_SCALES, usableArea } from '@core/scale/units';
import type { LadoDaFolha, PosicaoDaPista } from '@core/scale/units';
import { heightTableLayout, infoBoxLayout } from './annotationLayout';
import { anotacaoMm, centerOriginMm, desenhoCabe, extensaoDoDesenho, firstArena, fitScaleToPage } from './document';
import { folgaDoDesenhoMm, freeAreaMm } from './document';
import type { RectMm } from './document';
import type { CourseDocument, HeightTable, InfoBox, Logo, Obstacle, SceneObject } from './types';

/**
 * Arrumação automática da folha (B-103, decisão 104).
 *
 * Quadro técnico, tabela de alturas e logos vão para uma zona só da
 * folha: uma COLUNA (direita ou esquerda), um embaixo do outro, ou uma
 * FAIXA (embaixo ou em cima), um ao lado do outro. No automático, o
 * programa testa os quatro lados e fica com o que deixa a pista maior; a
 * pista se reenquadra no que sobra — no centro dele, ou encostada no lado
 * ou no canto que o usuário escolheu (`arranjo.pista`); aí os quadros vão
 * para o lado oposto.
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

/**
 * Onde a pista encosta decide para que lado os quadros podem ir: o oposto.
 * Num canto, os dois lados opostos concorrem; no centro, os quatro.
 */
const LADOS_DA_POSICAO: Record<PosicaoDaPista, LadoDaFolha[]> = {
  centro: LADOS,
  cima: ['baixo'],
  baixo: ['cima'],
  esquerda: ['direita'],
  direita: ['esquerda'],
  'sup-esq': ['direita', 'baixo'],
  'sup-dir': ['baixo', 'esquerda'],
  'inf-esq': ['direita', 'cima'],
  'inf-dir': ['esquerda', 'cima'],
};

/** Quanto o desenho encosta em cada eixo: 0 começo, 0,5 meio, 1 fim. */
const ALINHA: Record<PosicaoDaPista, { x: number; y: number }> = {
  centro: { x: 0.5, y: 0.5 },
  cima: { x: 0.5, y: 0 },
  baixo: { x: 0.5, y: 1 },
  esquerda: { x: 0, y: 0.5 },
  direita: { x: 1, y: 0.5 },
  'sup-esq': { x: 0, y: 0 },
  'sup-dir': { x: 1, y: 0 },
  'inf-esq': { x: 0, y: 1 },
  'inf-dir': { x: 1, y: 1 },
};

/** Põe o desenho no que sobra da folha, na posição escolhida (ou no centro). */
export function alinhaPista(doc: CourseDocument): void {
  const o = centerOriginMm(doc, freeAreaMm(doc), ALINHA[doc.page.arranjo?.pista ?? 'centro']);
  if (o) doc.originMm = o;
}

type Papel = InfoBox | HeightTable | Logo;

const ehPapel = (o: SceneObject): o is Papel =>
  o.kind === 'infobox' || o.kind === 'heighttable' || o.kind === 'logo';

interface Item {
  obj: Papel;
  /** Na faixa, o quadro técnico deita (blocos lado a lado) e muda de tamanho. */
  faixa?: { w: number; h: number };
  /** Tabela de alturas sem tamanho do usuário: casa com o quadro da mesma fila (B-105). */
  tabela?: { minW: number; minH: number; natW: number; natH: number };
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
    if (o.livre || o.locked) {
      livres.push(r);
      continue;
    }
    // Medidas no tamanho cheio: o fator da arrumação é escolhido de novo a cada vez.
    const cheio = 1 / (o.reduzido ?? 1);
    const item = cheioDe(doc, o, r);
    auto.push(comFator(item, cheio));
  }
  return { auto, livres };
}

/** O item como está agora (já encolhido, se a folha o encolheu). */
function cheioDe(doc: CourseDocument, o: Papel, r: RectMm): Item {
  {
    if (o.kind === 'infobox') {
      const empe = infoBoxLayout({ ...o, blocos: undefined });
      const deitado = infoBoxLayout({ ...o, blocos: 'lado' });
      // Deita só se houver seções e se couber na largura da folha.
      const cabe = deitado.widthMm <= usableArea(doc.page).widthMm + 0.5;
      const muda = deitado.widthMm !== empe.widthMm && cabe;
      return {
        obj: o,
        w: empe.widthMm,
        h: empe.heightMm,
        ...(muda ? { faixa: { w: deitado.widthMm, h: deitado.heightMm } } : {}),
      };
    } else if (o.kind === 'heighttable' && o.widthMm == null && o.heightMm == null) {
      const obstaculos = doc.objects.filter((x): x is Obstacle => x.kind === 'obstacle');
      const base = { ...o, encaixe: undefined };
      const nat = heightTableLayout(base, obstaculos);
      const minW = heightTableLayout({ ...base, encaixe: { widthMm: 0 } }, obstaculos).widthMm;
      const minH = heightTableLayout({ ...base, encaixe: { heightMm: 0 } }, obstaculos).heightMm;
      return {
        obj: o,
        w: nat.widthMm,
        h: nat.heightMm,
        tabela: { minW, minH, natW: nat.widthMm, natH: nat.heightMm },
      };
    }
    return { obj: o, w: r.widthMm, h: r.heightMm };
  }
}

/** O item com todas as medidas multiplicadas por `f`. */
function comFator(it: Item, f: number): Item {
  if (Math.abs(f - 1) < 1e-9) return it;
  return {
    ...it,
    w: it.w * f,
    h: it.h * f,
    ...(it.faixa ? { faixa: { w: it.faixa.w * f, h: it.faixa.h * f } } : {}),
    ...(it.tabela
      ? { tabela: { minW: it.tabela.minW * f, minH: it.tabela.minH * f, natW: it.tabela.natW * f, natH: it.tabela.natH * f } }
      : {}),
  };
}

/**
 * Encolhe (ou devolve ao tamanho) o item de verdade: letra, largura e
 * linhas na mesma proporção, como puxar o canto. Guarda o fator para
 * saber voltar ao tamanho cheio.
 */
function aplicaFator(o: Papel, f: number): void {
  const r = f / (o.reduzido ?? 1);
  if (Math.abs(r - 1) > 1e-9) {
    if (o.kind === 'infobox') {
      o.widthMm *= r;
      o.style = { ...o.style, sizeMm: o.style.sizeMm * r };
      if (o.heightMm != null) o.heightMm *= r;
    } else if (o.kind === 'heighttable') {
      o.style = { ...o.style, sizeMm: o.style.sizeMm * r, rowHeightMm: o.style.rowHeightMm * r };
      if (o.widthMm != null) o.widthMm *= r;
      if (o.heightMm != null) o.heightMm *= r;
    } else o.widthMm *= r;
  }
  if (f >= 0.999) {
    if (o.reduzido !== undefined) delete o.reduzido;
  } else if (o.reduzido !== f) o.reduzido = f;
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

/**
 * A tabela casa com os outros da fila: na coluna, fica da largura deles;
 * na faixa, da altura deles — sem estreitar demais nem apertar as linhas
 * além do que a letra pede. Faixa mais baixa é pista maior.
 */
function encaixa(fila: Item[], coluna: boolean): Item[] {
  const outros = fila.filter((i) => !i.tabela);
  if (outros.length === 0) return fila.map((i) => (i.tabela ? { ...i, w: i.tabela.natW, h: i.tabela.natH } : i));
  const alvo = Math.max(...outros.map((i) => (coluna ? i.w : i.h)));
  return fila.map((i) => {
    if (!i.tabela) return i;
    return coluna ? { ...i, w: Math.max(i.tabela.minW, alvo) } : { ...i, h: Math.max(i.tabela.minH, alvo) };
  });
}

const espessuraDa = (fila: Item[], coluna: boolean) => Math.max(...fila.map((i) => (coluna ? i.w : i.h)));

/** Quanto a zona ocupa da folha (largura das colunas, altura das faixas) e se cada item cabe. */
function medidas(doc: CourseDocument, itens: Item[], lado: LadoDaFolha): { espessura: number; cabe: boolean } {
  if (itens.length === 0) return { espessura: 0, cabe: true };
  const coluna = ehColuna(lado);
  const u = usableArea(doc.page);
  const fs = filas(doc, itens, lado).map((f) => encaixa(f, coluna));
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
  const folga = 2 * folgaDoDesenhoMm(doc);
  const sobraW = (coluna ? u.widthMm - espessura - FOLGA_MM : u.widthMm) - folga;
  const sobraH = (coluna ? u.heightMm : u.heightMm - espessura - FOLGA_MM) - folga;
  const e = extensaoDoDesenho(doc) ?? { widthM: 80, heightM: 40 };
  const nota = Math.max(0, Math.min(sobraW / Math.max(1, e.widthM), sobraH / Math.max(1, e.heightM)));
  return { cabe, nota };
}

/**
 * Quanto os quadros podem encolher para a pista ficar maior: o croqui é o
 * principal da folha; os quadros, letra menor, ainda se leem até 70%.
 */
const FATORES = [1, 0.9, 0.8, 0.7];
const MAIOR_ESCALA = STANDARD_SCALES[STANDARD_SCALES.length - 1]!;

/** A escala padrão em que o desenho cabe com `nota` mm de papel por metro. */
function escalaDaNota(nota: number): number {
  if (nota <= 0) return Number.POSITIVE_INFINITY;
  const precisa = 1000 / nota;
  return precisa > MAIOR_ESCALA ? precisa : escalaQueCabe(precisa);
}

interface Plano {
  lado: LadoDaFolha;
  f: number;
}

/**
 * O lado dos quadros e quanto eles encolhem. A pista vem primeiro: vence
 * o arranjo que deixa a pista na maior escala; entre os que empatam, o de
 * quadros maiores. Com `alvo` (a escala que o usuário quer), basta chegar
 * nela — e aí os quadros ficam o maior possível. Os lados possíveis vêm
 * do lado pedido, ou da posição da pista (o lado oposto a ela).
 */
function planeja(doc: CourseDocument, itens: Item[], alvo?: number): Plano {
  const arranjo = doc.page.arranjo;
  const ultima = arranjo?.ultima;
  if (itens.length === 0) return { lado: ultima ?? 'direita', f: 1 };
  const avalia = (lados: LadoDaFolha[]) =>
    lados.flatMap((lado) =>
      FATORES.map((f) => {
        const { cabe, nota } = notaDoLado(doc, itens.map((i) => comFator(i, f)), lado);
        return { lado, f, cabe, nota, escala: escalaDaNota(nota) };
      }),
    );
  const pedidos = arranjo && arranjo.zona !== 'auto' ? [arranjo.zona] : LADOS_DA_POSICAO[arranjo?.pista ?? 'centro'];
  let cands = avalia(pedidos).filter((c) => c.cabe);
  // A pista é o principal: se os quadros no lado oposto à posição pedida
  // custam escala (a pista sairia menor do que dá), a posição vale só para
  // encostar a pista, e os quadros vão para o lado que a deixa maior.
  if (pedidos.length < LADOS.length && (!arranjo || arranjo.zona === 'auto')) {
    const todos = avalia(LADOS).filter((c) => c.cabe);
    const menor = (l: typeof cands) => Math.min(Number.POSITIVE_INFINITY, ...l.map((c) => c.escala));
    if (menor(todos) < menor(cands)) cands = todos;
  }
  if (cands.length === 0) {
    const todos = avalia(pedidos).filter((c) => c.f === 1);
    const m = todos.reduce((a, b) => (b.nota > a.nota ? b : a));
    return { lado: m.lado, f: 1 };
  }
  // Ordem de preferência: quadros maiores; o lado de antes (não fica
  // trocando por pouco); o que deixa mais folga; a ordem de LADOS.
  const melhor = (lista: typeof cands) =>
    lista.reduce((a, b) => {
      if (b.f !== a.f) return b.f > a.f ? b : a;
      if ((b.lado === ultima) !== (a.lado === ultima)) return b.lado === ultima ? b : a;
      return b.nota > a.nota * 1.01 ? b : a;
    });
  if (alvo != null) {
    const chegam = cands.filter((c) => c.escala <= alvo);
    if (chegam.length > 0) {
      const m = melhor(chegam);
      return { lado: m.lado, f: m.f };
    }
  }
  const menor = Math.min(...cands.map((c) => c.escala));
  const m = melhor(cands.filter((c) => c.escala === menor));
  return { lado: m.lado, f: m.f };
}

/** O lado em que os quadros estão (ou iriam), para o painel mostrar. */
export function escolheLado(doc: CourseDocument): LadoDaFolha {
  return planeja(doc, itensDaFolha(doc).auto, doc.page.arranjo?.preferida ?? doc.page.printScale).lado;
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
  for (const fila of filas(doc, itens, lado).map((f) => encaixa(f, coluna))) {
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
      if (it.tabela && it.obj.kind === 'heighttable') guardaEncaixe(it.obj, it, coluna);
      const x = Math.round(r.xMm * 10) / 10;
      const y = Math.round(r.yMm * 10) / 10;
      if (it.obj.posMm.x !== x || it.obj.posMm.y !== y) it.obj.posMm = { x, y };
      cursor += (coluna ? it.h : it.w) + FOLGA_MM;
    }
    recuo += espessuraDa(fila, coluna) + FOLGA_MM;
  }
}

/** Grava na tabela o tamanho com que ela casou com o quadro (ou tira, se ficou a natural). */
function guardaEncaixe(tabela: HeightTable, it: Item, coluna: boolean): void {
  const nat = it.tabela!;
  const r1 = (v: number) => Math.round(v * 10) / 10;
  const quer =
    coluna && Math.abs(it.w - nat.natW) > 0.05 ? { widthMm: r1(it.w) }
    : !coluna && Math.abs(it.h - nat.natH) > 0.05 ? { heightMm: r1(it.h) }
    : undefined;
  if (!quer) {
    if (tabela.encaixe) delete tabela.encaixe;
    return;
  }
  const atual = tabela.encaixe;
  if (atual?.widthMm === quer.widthMm && atual?.heightMm === quer.heightMm) return;
  tabela.encaixe = quer;
}

/** Arruma os itens automáticos; devolve o lado e a assinatura da faixa ocupada. */
function arrumaAnotacoes(doc: CourseDocument, alvo?: number): string | null {
  const arranjo = doc.page.arranjo;
  if (!arranjo) return null;
  const { auto: cheios, livres } = itensDaFolha(doc);
  const { lado, f } = planeja(doc, cheios, alvo);
  if (arranjo.ultima !== lado) arranjo.ultima = lado;
  for (const it of cheios) aplicaFator(it.obj, f);
  const auto = cheios.map((i) => comFator(i, f));
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
    auto.length > 0 ? lado : '-', Math.round(espessura), arranjo.pista ?? 'centro', arranjo.preferida ?? '',
  ].join('|');
}

/**
 * A pista no que sobra, na escala preferida se ela couber (senão, na
 * maior que cabe); depois, centraliza. Ligar e desligar as duas fases
 * volta à escala de antes.
 */
export function reenquadraPista(doc: CourseDocument): void {
  if (!firstArena(doc)) return;
  const atual = doc.page.printScale;
  doc.page.printScale = doc.page.arranjo?.preferida ?? atual;
  // Cabe = o desenho inteiro (pista, júri, arquibancada, entrada e saída), não só o contorno.
  if (!desenhoCabe(doc)) doc.page.printScale = fitScaleToPage(doc);
  alinhaPista(doc);
}

/**
 * Depois de cada edição. Arruma os quadros automáticos e, se a faixa que
 * eles ocupam mudou, reenquadra a pista.
 */
export function syncArranjo(doc: CourseDocument): void {
  const arranjo = doc.page.arranjo;
  if (!arranjo) return;
  // A escala mudou desde a última arrumação: foi o usuário, e é a que ele
  // quer. Ela entra na chave, então os quadros se rearrumam (encolhendo,
  // se preciso) para a pista caber nela.
  if (arranjo.escala !== undefined && arranjo.escala !== doc.page.printScale) {
    arranjo.preferida = doc.page.printScale;
  }
  const chave = arrumaAnotacoes(doc, arranjo.preferida ?? doc.page.printScale);
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
  const chave = arrumaAnotacoes(doc, doc.page.printScale);
  if (chave != null && firstArena(doc)) doc.page.arranjo.chave = chave;
}

/**
 * "Rearrumar a folha": tudo volta ao automático e a pista vai para a maior
 * escala que dá, com os quadros encolhendo o necessário (até 70%).
 */
export function rearrumaFolha(doc: CourseDocument): void {
  if (!doc.page.arranjo) doc.page.arranjo = { zona: 'auto' };
  const arranjo = doc.page.arranjo;
  delete arranjo.ultima;
  for (const o of doc.objects) if (ehPapel(o) && o.livre) delete o.livre;
  arrumaAnotacoes(doc);
  if (!firstArena(doc)) return;
  doc.page.printScale = fitScaleToPage(doc);
  arranjo.preferida = doc.page.printScale;
  arranjo.escala = doc.page.printScale;
  const chave = arrumaAnotacoes(doc, doc.page.printScale);
  if (chave != null) arranjo.chave = chave;
  alinhaPista(doc);
}

/** O usuário escolheu onde a pista fica; os quadros vão para o lado oposto. */
export function posicionaPista(doc: CourseDocument, pista: PosicaoDaPista): void {
  if (!doc.page.arranjo) rearrumaFolha(doc);
  const arranjo = doc.page.arranjo!;
  if (pista === 'centro') delete arranjo.pista;
  else arranjo.pista = pista;
  delete arranjo.ultima;
  // A chave muda com a posição: o syncArranjo arruma os quadros e reenquadra a pista.
}

/**
 * Croqui de antes da arrumação: ela liga sozinha quando o usuário mexe na
 * folha (formato, orientação, margens) ou põe um quadro, uma tabela ou um
 * logo — é quando ele espera que tudo se reorganize. Já ligada, não faz nada.
 */
export function ligaArranjo(doc: CourseDocument): void {
  if (doc.page.arranjo) return;
  // A escala que está é a que o usuário escolheu: os quadros se arrumam
  // em volta dela (o syncArranjo encolhe-os ou, se nem assim couber,
  // reduz a pista). Não é o "Rearrumar", que busca a maior escala.
  for (const o of doc.objects) if (ehPapel(o) && o.livre) delete o.livre;
  doc.page.arranjo = { zona: 'auto', preferida: doc.page.printScale, escala: doc.page.printScale };
}
