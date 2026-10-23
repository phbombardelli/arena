import { add, angleOf, distance, dot, fromAngle, normalizeAngle, scale, sub, type Vec2 } from '@core/geometry/vec';
import { measureFrame } from '@core/model/measureFrame';
import { newId } from '@core/model/ids';
import type { CourseDocument, MeasureLine, ObjectId } from '@core/model/types';

/**
 * Trena (B-64, decisão 77).
 *
 * Uma cota entre dois pontos do terreno, que fica no croqui e sai
 * impressa. Não puxa ângulo sozinha: quem quer a medida perpendicular ou
 * paralela à cerca pede — Shift ao desenhar, ou os botões do painel —, e
 * aí o programa garante o ângulo exato da cerca mais próxima.
 */

export function createMeasure(a: Vec2, b: Vec2 = a): MeasureLine {
  return {
    id: newId('med'),
    kind: 'measure',
    layer: 'annotations',
    locked: false,
    visible: true,
    scope: 'percurso',
    z: 0,
    a,
    b,
    sizeMm: 2.2,
    decimals: 2,
    color: '#23282d',
  };
}

export const measureLength = (m: MeasureLine): number => distance(m.a, m.b);
export const measureAngle = (m: MeasureLine): number => normalizeAngle(angleOf(sub(m.b, m.a)));

/** Direção da cerca mais próxima do ponto, em graus; `null` sem pista. */
export function nearestFenceAngle(outline: Vec2[] | null, p: Vec2): number | null {
  if (!outline || outline.length < 2) return null;
  let melhor: { d: number; ang: number } | null = null;
  for (let i = 0; i < outline.length; i += 1) {
    const u = outline[i]!;
    const v = outline[(i + 1) % outline.length]!;
    const seg = sub(v, u);
    const len2 = dot(seg, seg);
    if (len2 < 1e-9) continue;
    const t = Math.max(0, Math.min(1, dot(sub(p, u), seg) / len2));
    const d = distance(p, add(u, scale(seg, t)));
    if (!melhor || d < melhor.d) melhor = { d, ang: angleOf(seg) };
  }
  return melhor?.ang ?? null;
}

/** Diferença entre ângulos, de 0 a 180. */
const giro = (a: number, b: number): number => {
  const d = Math.abs(normalizeAngle(a - b));
  return d > 180 ? 360 - d : d;
};

/**
 * Das quatro direções da cerca (ao longo dela e para dentro/fora), a mais
 * perto de `desejado` — paralela ou perpendicular, conforme `tipo`.
 */
function direcaoDaCerca(cerca: number, desejado: number, tipo: 'paralela' | 'perpendicular' | 'qualquer'): number {
  const base = tipo === 'perpendicular' ? [90, 270] : tipo === 'paralela' ? [0, 180] : [0, 90, 180, 270];
  return base
    .map((k) => normalizeAngle(cerca + k))
    .reduce((m, a) => (giro(a, desejado) < giro(m, desejado) ? a : m));
}

/**
 * Shift ao desenhar: a segunda ponta vai para a perpendicular ou a
 * paralela da cerca mais próxima da primeira, a que estiver mais perto do
 * gesto. O comprimento é a projeção do gesto nessa direção.
 */
export function constrainToFence(outline: Vec2[] | null, a: Vec2, raw: Vec2): Vec2 {
  const cerca = nearestFenceAngle(outline, a);
  if (cerca === null) return raw;
  const gesto = sub(raw, a);
  const dir = fromAngle(direcaoDaCerca(cerca, angleOf(gesto), 'qualquer'));
  return add(a, scale(dir, Math.max(0, dot(gesto, dir))));
}

const medidaDe = (doc: CourseDocument, id: ObjectId): MeasureLine | null => {
  const m = doc.objects.find((o) => o.id === id);
  return m?.kind === 'measure' && !m.locked ? m : null;
};

/** Novo comprimento, a partir da primeira ponta, na mesma direção. */
export function setMeasureLength(doc: CourseDocument, id: ObjectId, meters: number): void {
  const m = medidaDe(doc, id);
  if (!m || !(meters > 0)) return;
  m.b = add(m.a, scale(fromAngle(measureAngle(m)), meters));
}

/** Novo ângulo (graus, horário a partir do leste), girando em torno da primeira ponta. */
export function setMeasureAngle(doc: CourseDocument, id: ObjectId, degrees: number): void {
  const m = medidaDe(doc, id);
  if (!m) return;
  m.b = add(m.a, scale(fromAngle(degrees), measureLength(m)));
}

/**
 * Perpendicular ou paralela à cerca mais próxima da primeira ponta, com o
 * mesmo comprimento; das duas direções possíveis, a mais perto da atual.
 */
export function alignMeasureToFence(
  doc: CourseDocument,
  id: ObjectId,
  tipo: 'paralela' | 'perpendicular',
): boolean {
  const m = medidaDe(doc, id);
  if (!m) return false;
  const cerca = nearestFenceAngle(measureFrame(doc).outline, m.a);
  if (cerca === null) return false;
  m.b = add(m.a, scale(fromAngle(direcaoDaCerca(cerca, measureAngle(m), tipo)), measureLength(m)));
  return true;
}

/** Ângulo em relação à cerca mais próxima, 0–90: diz se já está esquadrada. */
export function angleToFence(doc: CourseDocument, m: MeasureLine): number | null {
  const cerca = nearestFenceAngle(measureFrame(doc).outline, m.a);
  if (cerca === null) return null;
  const d = giro(measureAngle(m), cerca) % 180;
  return d > 90 ? 180 - d : d;
}
