import { add, normalize, scale, sub } from '@core/geometry/vec';
import { courseDistancesAlong, pathSampler, type ObstacleDistance } from '@core/assist/obstacleDistances';
import { syncTimingLines } from '@core/library/timing';
import type { CourseDocument, CoursePath, ObjectId, Obstacle, TimingLine } from '@core/model/types';
import { syncPathAnchors } from './pathAnchors';

/**
 * Digitar uma distância do percurso (B-60, decisão 76).
 *
 * Quem anda é o obstáculo de DESTINO, sobre a reta do traçado que o cruza:
 * assim o salto continua alinhado e a volta antes dele só estica. Quando
 * uma ponta é a partida ou a chegada, anda a cruzada (a distância dela à
 * vara). A curva muda de comprimento com o movimento, então repete até a
 * medida bater.
 *
 * Só vale para traçado preso aos obstáculos — o do assistente. No traçado
 * à mão o obstáculo andaria e a linha ficaria para trás.
 */

const TOLERANCIA_M = 0.002;
const TENTATIVAS = 8;

export const obstaclesOf = (doc: CourseDocument): Obstacle[] =>
  doc.objects.filter((o): o is Obstacle => o.kind === 'obstacle');
export const timingsOf = (doc: CourseDocument): TimingLine[] =>
  doc.objects.filter((o): o is TimingLine => o.kind === 'timing');

/** As distâncias do traçado como estão agora no documento. */
export function courseDistances(doc: CourseDocument, path: CoursePath): ObstacleDistance[] {
  return courseDistancesAlong(path, obstaclesOf(doc), timingsOf(doc));
}

/** A distância dá para digitar? Precisa de quem possa andar. */
export function canSetDistance(doc: CourseDocument, path: CoursePath, d: ObstacleDistance): boolean {
  const cruzada = timingEnd(doc, d);
  if (cruzada) return !cruzada.locked;
  const destino = doc.objects.find((o) => o.id === d.toId);
  if (!destino || destino.kind !== 'obstacle' || destino.locked) return false;
  return path.nodes.some((n) => n.anchor?.objectId === destino.id);
}

/** A ponta que é partida ou chegada, se houver: é ela que anda. */
function timingEnd(doc: CourseDocument, d: ObstacleDistance): TimingLine | null {
  for (const id of [d.toId, d.fromId]) {
    const o = doc.objects.find((x) => x.id === id);
    if (o?.kind === 'timing') return o;
  }
  return null;
}

/** Leva a distância `key` do traçado a `meters`. Devolve se conseguiu. */
export function setCourseDistance(doc: CourseDocument, pathId: ObjectId, key: string, meters: number): boolean {
  if (!(meters > 0)) return false;
  for (let i = 0; i < TENTATIVAS; i += 1) {
    const path = doc.objects.find((o): o is CoursePath => o.id === pathId && o.kind === 'path');
    if (!path) return false;
    const d = courseDistances(doc, path).find((x) => x.key === key);
    if (!d || !canSetDistance(doc, path, d)) return false;
    const falta = meters - d.meters;
    if (Math.abs(falta) < TOLERANCIA_M) return true;
    const cruzada = timingEnd(doc, d);
    if (cruzada) {
      if (!cruzada.anchor) return false;
      cruzada.anchor.distanceM += falta;
    } else {
      const destino = doc.objects.find((o): o is Obstacle => o.id === d.toId && o.kind === 'obstacle')!;
      const amostra = pathSampler(path);
      if (!amostra) return false;
      const frente = normalize(sub(amostra.pointAt(d.sTo + 0.05).p, amostra.pointAt(d.sTo - 0.05).p));
      destino.pos = add(destino.pos, scale(frente, falta));
    }
    syncTimingLines(doc);
    syncPathAnchors(doc);
  }
  const path = doc.objects.find((o): o is CoursePath => o.id === pathId && o.kind === 'path');
  const d = path && courseDistances(doc, path).find((x) => x.key === key);
  return Boolean(d && Math.abs(d.meters - meters) < 0.01);
}

/** Trava (ou destrava, com `null`) uma distância no valor dado. */
export function lockDistance(doc: CourseDocument, pathId: ObjectId, key: string, meters: number | null): void {
  const path = doc.objects.find((o): o is CoursePath => o.id === pathId && o.kind === 'path');
  if (!path) return;
  const travas = { ...(path.lockedDistances ?? {}) };
  if (meters === null) delete travas[key];
  else travas[key] = Math.round(meters * 1000) / 1000;
  path.lockedDistances = travas;
}

/**
 * Repõe as distâncias travadas, na ordem do percurso: corrigir uma move o
 * destino, o que só mexe nas seguintes — que vêm depois e se corrigem
 * também. Chamada pelo documentStore depois de toda edição.
 */
export function enforceLockedDistances(doc: CourseDocument): void {
  for (const obj of doc.objects) {
    if (obj.kind !== 'path' || !obj.lockedDistances) continue;
    const travas = obj.lockedDistances;
    if (Object.keys(travas).length === 0) continue;
    for (const d of courseDistances(doc, obj)) {
      const alvo = travas[d.key];
      if (alvo === undefined) continue;
      const agora = courseDistances(doc, obj).find((x) => x.key === d.key);
      if (agora && Math.abs(agora.meters - alvo) >= TOLERANCIA_M) setCourseDistance(doc, obj.id, d.key, alvo);
    }
  }
}

/**
 * Desliza o obstáculo sobre a reta do traçado que o cruza (B-65): Alt +
 * setas. Positivo vai no sentido do percurso. Só para obstáculo preso a
 * um traçado; devolve se andou.
 */
export function slideAlongPath(doc: CourseDocument, obstacleId: ObjectId, meters: number): boolean {
  const o = doc.objects.find((x): x is Obstacle => x.id === obstacleId && x.kind === 'obstacle');
  if (!o || o.locked) return false;
  const path = doc.objects.find(
    (p): p is CoursePath => p.kind === 'path' && p.nodes.some((n) => n.anchor?.objectId === o.id),
  );
  const amostra = path && pathSampler(path);
  if (!amostra) return false;
  // O mesmo ponto de cruzamento que as distâncias usam.
  const ds = courseDistances(doc, path);
  const comEle = ds.find((d) => d.toId === o.id) ?? ds.find((d) => d.fromId === o.id);
  if (!comEle) return false;
  const s = comEle.toId === o.id ? comEle.sTo : comEle.sFrom;
  const frente = normalize(sub(amostra.pointAt(s + 0.05).p, amostra.pointAt(s - 0.05).p));
  o.pos = add(o.pos, scale(frente, meters));
  return true;
}
