import { add, fromAngle, normalizeAngle, rotate, scale, sub, type Vec2 } from '@core/geometry/vec';
import { linkObjects } from './groupOps';
import { jumpHeading } from '@core/assist/ridePath';
import type { CourseDocument, ObjectId, Obstacle } from '@core/model/types';

/**
 * Combinações e linhas retas.
 *
 * A distância entre dois saltos NÃO se mede de centro a centro: mede-se da
 * VARA DE SAÍDA do anterior até a VARA DE ENTRADA do seguinte. É o vão que
 * o cavalo tem para galopar, e é o número que o traçador escreve no
 * croqui. Num oxer de 1,60 m de largura, medir pelo centro erraria 1,60 m
 * numa distância de 7,50 — mais de uma passada inteira.
 *
 * Alinhar é a outra metade: os elementos ficam no mesmo eixo, com a mesma
 * inclinação. Combinação torta não existe — se os elementos não estão em
 * linha, não são uma combinação, são dois obstáculos próximos.
 */

/** Meia largura do salto: as varas, sem paraflanco. */
const meiaVara = (o: Obstacle): number => (o.spreadM ?? 0) / 2;

/**
 * Vão de um composto, de vara a vara: de 7 a 12 m, que cobre um ou dois
 * lances de galope — quantos, é escolha do desenhador (decisão 49).
 *
 * Vale só DENTRO de um composto (mesmo número, letras A, B, C). Linha
 * entre obstáculos de números diferentes tem distância livre: não há regra
 * para linhas de mais de dois galopes.
 */
export const COMBINATION_GAP = { min: 7, max: 12 };

/** Os dois elementos são do mesmo composto: mesmo número, ambos com letra. */
export const sameCombination = (a: Obstacle, b: Obstacle): boolean =>
  a.number.trim() !== '' &&
  a.number.trim() === b.number.trim() &&
  a.letter !== '' &&
  b.letter !== '';

export const clampCombinationGap = (metros: number): number =>
  Math.min(COMBINATION_GAP.max, Math.max(COMBINATION_GAP.min, metros));

/**
 * Ordena os obstáculos na ordem em que o cavalo os encontra.
 *
 * A ordem é a da NUMERAÇÃO: 1, 2, 3a, 3b, 4, 5a, 5b, 5c. É o percurso que
 * define quem vem antes, e não a geometria.
 *
 * A primeira versão ordenava pela projeção no eixo do salto, o que dava
 * na mesma quando os elementos já estavam em linha — e dava resultado
 * confuso justamente quando não estavam, que é quando a ferramenta é
 * usada. Obstáculo torto ou fora do lugar aparecia na ordem errada, e o
 * campo "5b - 5a" não quer dizer nada.
 *
 * Obstáculo sem número vai para o fim, ordenado pela projeção: aí não há
 * numeração a respeitar, e a geometria é o que sobra.
 */
export function orderAlongLine(obstacles: Obstacle[]): Obstacle[] {
  const primeiro = obstacles[0];
  if (!primeiro) return [];
  const dir = fromAngle(jumpHeading(primeiro));
  const projeta = (o: Obstacle) => o.pos.x * dir.x + o.pos.y * dir.y;

  const numeroDe = (o: Obstacle) => {
    const n = parseInt(o.number, 10);
    return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
  };
  const letraDe = (o: Obstacle) => (o.letter === '' ? 0 : o.letter.charCodeAt(0));

  return [...obstacles].sort(
    (a, b) =>
      numeroDe(a) - numeroDe(b) || letraDe(a) - letraDe(b) || projeta(a) - projeta(b),
  );
}

/**
 * Distâncias atuais entre elementos consecutivos, de vara a vara.
 *
 * Negativa quer dizer que os corpos se sobrepõem — o que é informação, não
 * erro: mostra ao desenhador que os dois estão montados um por cima do
 * outro.
 */
export function currentGaps(ordered: Obstacle[]): number[] {
  const primeiro = ordered[0];
  if (!primeiro) return [];
  const dir = fromAngle(jumpHeading(primeiro));
  const projeta = (o: Obstacle) => o.pos.x * dir.x + o.pos.y * dir.y;

  const vaos: number[] = [];
  for (let i = 1; i < ordered.length; i += 1) {
    const antes = ordered[i - 1]!;
    const depois = ordered[i]!;
    vaos.push(projeta(depois) - projeta(antes) - meiaVara(antes) - meiaVara(depois));
  }
  return vaos;
}

/**
 * Põe os elementos em linha, nas distâncias pedidas.
 *
 * O primeiro não se mexe: alinhar é acertar os outros em relação a ele. Se
 * o primeiro também se movesse, cada aplicação da ferramenta arrastaria a
 * combinação inteira pela pista, e o desenhador perderia o lugar que
 * escolheu para ela.
 *
 * Todos ganham a inclinação do primeiro, e todos ficam no eixo do salto
 * dele: mesma direção, sem desvio lateral.
 */
export function alignCombination(
  doc: CourseDocument,
  ids: ObjectId[],
  gapsM: number[],
): void {
  const selecionados = ids
    .map((id) => doc.objects.find((o) => o.id === id))
    .filter((o): o is Obstacle => o?.kind === 'obstacle');
  if (selecionados.length < 2) return;

  const ordenados = orderAlongLine(selecionados);
  const base = ordenados[0]!;
  const dir = fromAngle(jumpHeading(base));

  let cursor: Vec2 = base.pos;
  for (let i = 1; i < ordenados.length; i += 1) {
    const antes = ordenados[i - 1]!;
    const atual = ordenados[i]!;
    const pedido = gapsM[i - 1] ?? 0;
    const vao = sameCombination(antes, atual) ? clampCombinationGap(pedido) : pedido;

    // Do centro do anterior ao centro deste: meia largura de cada um mais
    // o vão livre entre as varas.
    const passo = meiaVara(antes) + vao + meiaVara(atual);
    cursor = add(cursor, scale(dir, passo));

    atual.pos = cursor;
    atual.rotation = base.rotation;
    // A seta acompanha: elementos de uma linha são saltados no mesmo sentido.
    atual.arrow.reversed = base.arrow.reversed;
  }
}

/* ------------------------------------------------------- composto (B-16) */

/**
 * Confirma que 2 ou 3 obstáculos são um composto (decisão 71): todos
 * ganham o mesmo número e as letras A, B, C na ordem em que o cavalo os
 * salta. O número é o menor que já tinham; sem número, o seguinte ao maior
 * do croqui. A ordem é a da numeração, se houver; senão, a do sentido do
 * salto do primeiro.
 */
export function confirmCombination(doc: CourseDocument, ids: ObjectId[]): void {
  const sel = ids
    .map((id) => doc.objects.find((o) => o.id === id))
    .filter((o): o is Obstacle => o?.kind === 'obstacle' && !o.locked);
  if (sel.length < 2 || sel.length > 3) return;
  const numeros = sel.map((o) => parseInt(o.number, 10)).filter((n) => Number.isFinite(n));
  const todos = doc.objects
    .filter((o): o is Obstacle => o.kind === 'obstacle')
    .map((o) => parseInt(o.number, 10))
    .filter((n) => Number.isFinite(n));
  const numero = numeros.length ? Math.min(...numeros) : (todos.length ? Math.max(...todos) : 0) + 1;
  // Números seguidos (5, 6) que viram um composto (5A, 5B) liberam o 6:
  // quem vinha depois desce, e a numeração continua sem buraco.
  const distintos = [...new Set(numeros)].sort((a, b) => a - b);
  const seguidos =
    distintos.length === sel.length && distintos.every((n, i) => n === distintos[0]! + i);
  if (seguidos) {
    const ultimo = distintos[distintos.length - 1]!;
    const ids = new Set(sel.map((o) => o.id));
    for (const o of doc.objects) {
      if (o.kind !== 'obstacle' || ids.has(o.id)) continue;
      const n = parseInt(o.number, 10);
      if (Number.isFinite(n) && n > ultimo) o.number = String(n - (sel.length - 1));
    }
  }
  const letras: Obstacle['letter'][] = ['A', 'B', 'C'];
  orderAlongLine(sel).forEach((o, i) => {
    o.number = String(numero);
    o.letter = letras[i]!;
  });
  // Composto é uma peça só: os elementos ficam vinculados (decisão 81).
  linkObjects(
    doc,
    sel.map((o) => o.id),
  );
}

/**
 * Desfaz o composto (o armador mudou de ideia: é uma linha): 5A, 5B viram
 * 5 e 6, e quem vinha depois sobe — o inverso exato de confirmar.
 */
export function splitCombination(doc: CourseDocument, ids: ObjectId[]): void {
  const sel = ids
    .map((id) => doc.objects.find((o) => o.id === id))
    .filter((o): o is Obstacle => o?.kind === 'obstacle' && !o.locked);
  const ord = orderAlongLine(sel);
  if (ord.length < 2 || !ord.every((o, i) => i === 0 || sameCombination(ord[i - 1]!, o))) return;
  const numero = parseInt(ord[0]!.number, 10);
  if (!Number.isFinite(numero)) return;
  const meus = new Set(ord.map((o) => o.id));
  for (const o of doc.objects) {
    if (o.kind !== 'obstacle' || meus.has(o.id)) continue;
    const n = parseInt(o.number, 10);
    if (Number.isFinite(n) && n > numero) o.number = String(n + (ord.length - 1));
  }
  ord.forEach((o, i) => {
    o.number = String(numero + i);
    o.letter = '';
  });
  // Solta o vínculo do composto — só se ele for só do composto: um trecho
  // maior que o armador vinculou continua vinculado.
  const grupo = ord[0]!.group;
  if (grupo && ord.every((o) => o.group === grupo)) {
    const membros = doc.objects.filter((o) => o.group === grupo);
    if (membros.every((o) => meus.has(o.id))) for (const o of membros) delete o.group;
  }
}

/** Linha reta hoje? Todos no eixo do primeiro, com a mesma inclinação. */
export function isStraightLine(ordered: Obstacle[], toleranciaM = 0.05): boolean {
  const base = ordered[0];
  if (!base) return true;
  const dir = fromAngle(jumpHeading(base));
  return ordered.every((o) => {
    const rel = sub(o.pos, base.pos);
    const lateral = Math.abs(rel.x * dir.y - rel.y * dir.x);
    const giro = Math.abs(normalizeAngle(o.rotation - base.rotation + 180) - 180);
    return lateral <= toleranciaM && Math.min(giro, 180 - giro) < 0.5;
  });
}


/**
 * Vãos de uma linha curva ou quebrada: de vara a vara, mas medidos na reta
 * entre os CENTROS de cada par — cada elemento mantém a própria direção.
 */
export function freeGaps(ordered: Obstacle[]): number[] {
  const vaos: number[] = [];
  for (let i = 1; i < ordered.length; i += 1) {
    const a = ordered[i - 1]!;
    const b = ordered[i]!;
    vaos.push(Math.hypot(b.pos.x - a.pos.x, b.pos.y - a.pos.y) - meiaVara(a) - meiaVara(b));
  }
  return vaos;
}

/**
 * Acerta um vão de uma linha curva/quebrada sem endireitá-la: o elemento
 * seguinte anda na reta que o liga ao anterior, e os de depois andam junto
 * (os vãos deles não mudam). Giros e setas ficam como estão.
 */
export function setFreeGap(doc: CourseDocument, ids: ObjectId[], indice: number, gapM: number): void {
  const sel = ids
    .map((id) => doc.objects.find((o) => o.id === id))
    .filter((o): o is Obstacle => o?.kind === 'obstacle');
  const ord = orderAlongLine(sel);
  const a = ord[indice];
  const b = ord[indice + 1];
  if (!a || !b || b.locked) return;
  const vao = sameCombination(a, b) ? clampCombinationGap(gapM) : gapM;
  const dx = b.pos.x - a.pos.x;
  const dy = b.pos.y - a.pos.y;
  const d = Math.hypot(dx, dy) || 1;
  const novo = meiaVara(a) + vao + meiaVara(b);
  const delta = { x: (dx / d) * (novo - d), y: (dy / d) * (novo - d) };
  for (const o of ord.slice(indice + 1)) {
    if (!o.locked) o.pos = { x: o.pos.x + delta.x, y: o.pos.y + delta.y };
  }
}

/* ------------------------------------------------- curva por distância */

/**
 * Curva por distância (B-81): o mesmo mecanismo do pé de galinha da
 * ginástica, no Percurso. Do anterior ao seguinte vai um ARCO de círculo
 * que sai da vara de saída do anterior na direção do salto dele; o vão é
 * medido SOBRE o arco, de vara a vara, e a abertura é quanto a linha gira
 * até o seguinte (negativo abre à esquerda). Mudar a abertura não muda a
 * distância: o seguinte anda de lado, sobre o que aquele vão permite, e
 * fica de frente para a curva.
 */
export interface ArcGap {
  gapM: number;
  angleDeg: number;
}

/** O limite da abertura: além disso o cavalo não chega de frente. */
export const ARC_MAX_DEG = 120;

/** Ponto e direção a `s` metros sobre o arco de comprimento `L`. */
function sobreArco(inicio: Vec2, rumo: number, L: number, anguloDeg: number, s: number): { p: Vec2; heading: number } {
  const th = (anguloDeg * Math.PI) / 180;
  let local: Vec2;
  let giro: number;
  if (Math.abs(th) < 1e-6 || L <= 0) {
    local = { x: s, y: 0 };
    giro = 0;
  } else {
    const raio = L / th;
    const phi = (th * s) / L;
    local = { x: raio * Math.sin(phi), y: raio * (1 - Math.cos(phi)) };
    giro = (phi * 180) / Math.PI;
  }
  const c = Math.cos((rumo * Math.PI) / 180);
  const sn = Math.sin((rumo * Math.PI) / 180);
  return { p: add(inicio, { x: local.x * c - local.y * sn, y: local.x * sn + local.y * c }), heading: rumo + giro };
}

/** Onde o seguinte fica, dado o anterior, o vão sobre o arco e a abertura. */
export function arcPose(a: Obstacle, meiaB: number, gap: ArcGap): { pos: Vec2; heading: number } {
  const rumo = jumpHeading(a);
  const saida = add(a.pos, scale(fromAngle(rumo), meiaVara(a)));
  const fim = sobreArco(saida, rumo, gap.gapM, gap.angleDeg, gap.gapM);
  return { pos: add(fim.p, scale(fromAngle(fim.heading), meiaB)), heading: fim.heading };
}

/** Pontos do arco do vão, para desenhar (da vara de saída à de entrada). */
export function arcPoints(a: Obstacle, gap: ArcGap, n = 24): Vec2[] {
  const rumo = jumpHeading(a);
  const saida = add(a.pos, scale(fromAngle(rumo), meiaVara(a)));
  return Array.from({ length: n + 1 }, (_, i) => sobreArco(saida, rumo, gap.gapM, gap.angleDeg, (gap.gapM * i) / n).p);
}

/**
 * Lê o arco que já existe entre dois obstáculos: o círculo tangente à
 * direção do anterior que passa pela vara de entrada do seguinte.
 */
export function arcGapBetween(a: Obstacle, b: Obstacle): ArcGap {
  const rumo = jumpHeading(a);
  const saida = add(a.pos, scale(fromAngle(rumo), meiaVara(a)));
  const entrada = sub(b.pos, scale(fromAngle(jumpHeading(b)), meiaVara(b)));
  const q = sub(entrada, saida);
  const c = Math.cos((-rumo * Math.PI) / 180);
  const sn = Math.sin((-rumo * Math.PI) / 180);
  const x = q.x * c - q.y * sn;
  const y = q.x * sn + q.y * c;
  const corda = Math.hypot(x, y);
  const th = 2 * Math.atan2(y, x);
  const gapM = Math.abs(th) < 1e-6 ? corda : (corda * (th / 2)) / Math.sin(th / 2);
  return { gapM, angleDeg: (th * 180) / Math.PI };
}

export function arcGaps(ordered: Obstacle[]): ArcGap[] {
  return ordered.slice(1).map((b, i) => arcGapBetween(ordered[i]!, b));
}

/**
 * Acerta um vão em curva: o seguinte vai para o fim do arco e gira de
 * frente para ele; os de depois acompanham como um bloco (giram e andam
 * junto), para os vãos deles não mudarem.
 */
export function setArcGap(doc: CourseDocument, ids: ObjectId[], indice: number, gap: ArcGap): void {
  const sel = ids
    .map((id) => doc.objects.find((o) => o.id === id))
    .filter((o): o is Obstacle => o?.kind === 'obstacle');
  const ord = orderAlongLine(sel);
  const a = ord[indice];
  const b = ord[indice + 1];
  if (!a || !b || b.locked) return;
  const vao = sameCombination(a, b) ? clampCombinationGap(gap.gapM) : Math.max(0.5, gap.gapM);
  const angulo = Math.max(-ARC_MAX_DEG, Math.min(ARC_MAX_DEG, gap.angleDeg));
  const alvo = arcPose(a, meiaVara(b), { gapM: vao, angleDeg: angulo });
  const giro = normalizeAngle(alvo.heading - jumpHeading(b) + 180) - 180;
  const de = b.pos;
  for (const o of ord.slice(indice + 1)) {
    if (o.locked) continue;
    const relativo = rotate(sub(o.pos, de), giro);
    o.pos = add(alvo.pos, relativo);
    o.rotation = normalizeAngle(o.rotation + giro);
  }
}
