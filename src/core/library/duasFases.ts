import { courseOrder, type RideStop } from '@core/assist/courseRide';
import { courseDistancesAlong } from '@core/assist/obstacleDistances';
import { formatDistance, pathLength } from '@core/model/path';
import { empurraAbaixo, infoBoxLayout } from '@core/model/annotationLayout';
import type { CourseDocument, CoursePath, InfoBox, ObjectId, Obstacle, TimingLine } from '@core/model/types';
import { mostraFase2, temFase2 } from './annotations';
import { aplicaTempos, aplicaTemposFase2 } from './courseTimes';
import type { MessageKey } from '@core/i18n/messages';
import { alinha, clampTimingDistance, placeTimingLine, TIMING_DISTANCE } from './timing';

/**
 * Prova em duas fases (B-95, decisão 103).
 *
 * Regulamento da FEI, 28ª ed. (2026), Art. 222: as duas fases correm sem
 * parada; a chegada da 1ª é a partida da 2ª; a numeração é contínua. O
 * croqui marca isso com uma linha de cronometragem entre as fases — a
 * "divisa" —, presa ao último obstáculo da 1ª como uma chegada, que o
 * programa cria e apaga sozinho.
 *
 * Os avisos só informam (como os do desempate): o §44 não deixa o programa
 * bloquear regra esportiva. Como a prova não escolhe entre normal e
 * especial, as contagens aceitam as duas.
 */

const obstaculosDe = (doc: CourseDocument): Obstacle[] =>
  doc.objects.filter((o): o is Obstacle => o.kind === 'obstacle');

/**
 * Quantos degraus vão para a 2ª fase quando a prova vira duas fases: 4 a 6,
 * deixando a 1ª com 7 a 9 quando há obstáculos para isso.
 */
export function padraoSegunda(n: number): number {
  if (n < 2) return 0;
  const alvo = n >= 11 ? n - 9 : Math.round(n * 0.4);
  return Math.min(6, Math.max(n >= 11 ? 4 : 1, alvo), n - 1);
}

/** Os degraus de cada fase. `null` se a prova não é de duas fases. */
export function fasesDoPercurso(doc: CourseDocument): { primeira: RideStop[]; segunda: RideStop[] } | null {
  if (!doc.duasFases || doc.kind === 'ginastica') return null;
  const stops = courseOrder(obstaculosDe(doc));
  let fim = stops.findIndex((st) => st.elements.some((e) => e.id === doc.duasFases!.fimDaPrimeira));
  if (fim < 0) fim = stops.length - 1 - padraoSegunda(stops.length);
  return { primeira: stops.slice(0, fim + 1), segunda: stops.slice(fim + 1) };
}

/** Por onde se sai da 1ª fase: o último elemento do último degrau dela. */
export function ultimoDaPrimeira(doc: CourseDocument): Obstacle | null {
  const f = fasesDoPercurso(doc);
  if (!f || f.segunda.length === 0) return null;
  const st = f.primeira[f.primeira.length - 1];
  return st ? st.elements[st.elements.length - 1]! : null;
}

export const divisaDe = (doc: CourseDocument): TimingLine | undefined =>
  doc.objects.find((o): o is TimingLine => o.kind === 'timing' && o.divisa === true);

/**
 * Depois de cada edição: com a prova em duas fases, existe uma divisa só,
 * presa ao último da 1ª (o lugar exato vem do syncTimingLines). Sem duas
 * fases, ou sem obstáculo na 2ª, ela some.
 */
export function syncDuasFases(doc: CourseDocument): void {
  const dono = ultimoDaPrimeira(doc);
  const divisas = doc.objects.filter((o) => o.kind === 'timing' && o.divisa);
  if (!dono) {
    if (divisas.length > 0) doc.objects = doc.objects.filter((o) => !(o.kind === 'timing' && o.divisa));
    return;
  }
  if (divisas.length > 1) {
    const fica = divisas[0]!.id;
    doc.objects = doc.objects.filter((o) => !(o.kind === 'timing' && o.divisa && o.id !== fica));
  }
  if (divisas.length === 0) {
    doc.objects.push(novaDivisa(doc, dono));
    return;
  }
  // Presa ao último da 1ª, que pode ter mudado (outro fim, renumeração).
  const linha = divisas[0]!;
  if (linha.kind !== 'timing') return;
  linha.anchor = {
    obstacleId: dono.id,
    distanceM: clampTimingDistance(linha.anchor?.distanceM ?? TIMING_DISTANCE.padrao),
  };
  alinha(linha, dono);
}

function novaDivisa(doc: CourseDocument, dono: Obstacle): TimingLine {
  const linha = placeTimingLine('finish', dono, TIMING_DISTANCE.padrao, '');
  linha.divisa = true;
  linha.labelVisible = false;
  // Tracejada, para não se confundir com a partida e a chegada.
  linha.style = { ...linha.style, dash: 'dashed' };
  linha.z = doc.objects.reduce((m, o) => Math.max(m, o.layer === linha.layer ? o.z : 0), 0) + 1;
  return linha;
}

/** O traçado do percurso: o maior, sem fase própria (o do desempate fica fora). */
export function tracadoDoPercurso(doc: CourseDocument): CoursePath | undefined {
  let melhor: CoursePath | undefined;
  for (const o of doc.objects) {
    if (o.kind !== 'path' || o.fase) continue;
    if (!melhor || pathLength(o) > pathLength(melhor)) melhor = o;
  }
  return melhor;
}

/**
 * Extensão de cada fase, medida no traçado: até onde ele cruza a divisa,
 * e dali ao fim. `null` se o traçado não passa pela divisa.
 */
export function extensoesDasFases(doc: CourseDocument): { primeira: number; segunda: number } | null {
  const divisa = divisaDe(doc);
  const tracado = tracadoDoPercurso(doc);
  if (!divisa || !tracado) return null;
  const timings = doc.objects.filter((o): o is TimingLine => o.kind === 'timing');
  const trecho = courseDistancesAlong(tracado, obstaculosDe(doc), timings).find((d) => d.toId === divisa.id);
  if (!trecho) return null;
  const total = pathLength(tracado);
  return { primeira: trecho.sTo, segunda: total - trecho.sTo };
}

export interface AvisoDuasFases {
  chave: MessageKey;
  params?: Record<string, string | number>;
}

/** Avisos do Art. 222 (e da distância da linha, Art. 241.2.5). */
export function avisosDuasFases(doc: CourseDocument): AvisoDuasFases[] {
  const f = fasesDoPercurso(doc);
  if (!f) return [];
  const out: AvisoDuasFases[] = [];
  const n1 = f.primeira.length;
  const n2 = f.segunda.length;
  if (n2 < 4 || n2 > 6) out.push({ chave: 'df.avisoSegunda', params: { n: n2 } });
  const combinacoes = f.segunda.filter((st) => st.elements.length > 1).length;
  if (combinacoes > 1) out.push({ chave: 'df.avisoCombinacoes', params: { n: combinacoes } });
  if (n1 < 5 || n1 > 9) out.push({ chave: 'df.avisoPrimeira', params: { n: n1 } });
  if (n1 + n2 < 11 || n1 + n2 > 15) out.push({ chave: 'df.avisoTotal', params: { n: n1 + n2 } });
  if ((doc.desempate?.ordem.length ?? 0) > 0) out.push({ chave: 'df.avisoDesempate' });

  // A linha das fases é a partida da 2ª: de 6 a 15 m do primeiro dela.
  const divisa = divisaDe(doc);
  const tracado = tracadoDoPercurso(doc);
  const primeiro = f.segunda[0]?.elements[0];
  if (divisa && tracado && primeiro) {
    const timings = doc.objects.filter((o): o is TimingLine => o.kind === 'timing');
    const trecho = courseDistancesAlong(tracado, obstaculosDe(doc), timings).find(
      (d) => d.fromId === divisa.id && d.toId === primeiro.id,
    );
    if (trecho && (trecho.meters < TIMING_DISTANCE.min - 0.05 || trecho.meters > TIMING_DISTANCE.max + 0.05)) {
      out.push({
        chave: 'df.avisoLinha',
        params: { d: trecho.meters.toFixed(1).replace('.', ','), o: f.segunda[0]!.label },
      });
    }
  }
  return out;
}

const metros = (m: number) => `${formatDistance(m, 0)} m`;

/**
 * Escreve no quadro o que o desenho sabe das fases: a distância de cada
 * uma e os tempos. Distância corrigida na pista (B-90) não é apagada.
 */
export function preencheFases(doc: CourseDocument, box: InfoBox): void {
  const ext = extensoesDasFases(doc);
  if (!ext) return;
  const campo = (id: string) => box.fields.find((f) => f.id === id);
  const d1 = campo('distancia');
  if (d1 && box.distanciaCorrigidaM == null) d1.value = metros(ext.primeira);
  const d2 = campo('f2Distancia');
  if (d2) d2.value = metros(ext.segunda);
  aplicaTempos(box);
  aplicaTemposFase2(box);
}

/**
 * Liga ou desliga a prova em duas fases (B-95): a divisa aparece na hora,
 * e cada quadro técnico ganha (ou perde) as seções da 1ª e da 2ª fase. O
 * que estava embaixo do quadro acompanha a mudança de altura.
 */
export function ligaDuasFases(doc: CourseDocument, liga: boolean): void {
  if (liga) {
    const stops = courseOrder(obstaculosDe(doc));
    const fim = stops[stops.length - 1 - padraoSegunda(stops.length)];
    if (!fim) return;
    doc.duasFases = { fimDaPrimeira: fim.elements[0]!.id };
  } else {
    delete doc.duasFases;
  }
  syncDuasFases(doc);
  for (const box of doc.objects) {
    if (box.kind !== 'infobox') continue;
    const antes = infoBoxLayout(box).heightMm;
    mostraFase2(box, liga);
    if (liga) {
      const vel = box.fields.find((f) => f.id === 'f2Velocidade');
      if (vel && vel.value.trim() === '') vel.value = box.fields.find((f) => f.id === 'velocidade')?.value ?? '';
      preencheFases(doc, box);
    } else {
      // Sem a 2ª fase, a distância volta a ser a do percurso inteiro.
      const tracado = tracadoDoPercurso(doc);
      const d = box.fields.find((f) => f.id === 'distancia');
      if (d && tracado && box.distanciaCorrigidaM == null) d.value = metros(pathLength(tracado));
      aplicaTempos(box);
    }
    empurraAbaixo(doc, box, antes, infoBoxLayout(box).heightMm);
  }
}

/** Muda onde a 1ª fase termina; os quadros acompanham. */
export function mudaFimDaPrimeira(doc: CourseDocument, id: ObjectId): void {
  if (!doc.duasFases) return;
  doc.duasFases.fimDaPrimeira = id;
  syncDuasFases(doc);
  for (const box of doc.objects) if (box.kind === 'infobox' && temFase2(box)) preencheFases(doc, box);
}
