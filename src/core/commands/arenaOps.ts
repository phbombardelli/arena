import type { Vec2 } from '@core/geometry/vec';
import { toMillimeterPrecision } from '@core/geometry/snap';
import { toPolygon } from '@core/model/arena';
import type { Arena, CornerStyle, CourseDocument, ObjectId } from '@core/model/types';
import { structureAngle } from '@core/library/structures';
import { boundsCenter, boundsIn, rotateAround } from '@core/model/transform';

/**
 * Operações específicas da pista. Separadas de `ops.ts` porque a pista é o
 * único objeto com geometria editável vértice a vértice — o resto do
 * editor só a move e gira, como qualquer outro objeto.
 */

function arenaOf(doc: CourseDocument, id: ObjectId): Arena | null {
  const obj = doc.objects.find((o) => o.id === id);
  return obj?.kind === 'arena' && !obj.locked ? obj : null;
}

/**
 * Redimensiona pelo canto superior esquerdo. Largura e altura não podem
 * ser zero ou negativas: uma pista invertida não significa nada e quebraria
 * a régua de perímetro.
 */
export function setArenaSize(
  doc: CourseDocument,
  id: ObjectId,
  widthM: number,
  heightM: number,
): void {
  const arena = arenaOf(doc, id);
  if (!arena || arena.shape !== 'rectangle') return;
  arena.widthM = Math.max(1, toMillimeterPrecision(widthM));
  arena.heightM = Math.max(1, toMillimeterPrecision(heightM));
  clampCornerRadius(arena);
}

/**
 * Arrasta um canto do retângulo mantendo o canto oposto fixo — o
 * comportamento esperado de uma alça de redimensionamento.
 */
export function resizeArenaByCorner(
  doc: CourseDocument,
  id: ObjectId,
  corner: 0 | 1 | 2 | 3,
  toM: Vec2,
): void {
  const arena = arenaOf(doc, id);
  if (!arena || arena.shape !== 'rectangle') return;

  const left = arena.origin.x;
  const top = arena.origin.y;
  const right = left + arena.widthM;
  const bottom = top + arena.heightM;

  // Cantos em sentido horário a partir do superior esquerdo.
  const fixed =
    corner === 0
      ? { x: right, y: bottom }
      : corner === 1
        ? { x: left, y: bottom }
        : corner === 2
          ? { x: left, y: top }
          : { x: right, y: top };

  const x0 = Math.min(fixed.x, toM.x);
  const y0 = Math.min(fixed.y, toM.y);
  const w = Math.abs(toM.x - fixed.x);
  const h = Math.abs(toM.y - fixed.y);
  if (w < 1 || h < 1) return;

  arena.origin = { x: toMillimeterPrecision(x0), y: toMillimeterPrecision(y0) };
  arena.widthM = toMillimeterPrecision(w);
  arena.heightM = toMillimeterPrecision(h);
  clampCornerRadius(arena);
}

export function convertArenaToPolygon(doc: CourseDocument, id: ObjectId): void {
  const arena = arenaOf(doc, id);
  if (arena) toPolygon(arena);
}

export function moveArenaVertex(
  doc: CourseDocument,
  id: ObjectId,
  index: number,
  toM: Vec2,
): void {
  const arena = arenaOf(doc, id);
  if (!arena || arena.shape !== 'polygon') return;
  const point = arena.points[index];
  if (!point) return;
  arena.points[index] = {
    x: toMillimeterPrecision(toM.x),
    y: toMillimeterPrecision(toM.y),
  };
}

/** Insere um vértice no meio da aresta que começa em `afterIndex`. */
export function insertArenaVertex(doc: CourseDocument, id: ObjectId, afterIndex: number): number | null {
  const arena = arenaOf(doc, id);
  if (!arena || arena.shape !== 'polygon') return null;
  const a = arena.points[afterIndex];
  const b = arena.points[(afterIndex + 1) % arena.points.length];
  if (!a || !b) return null;
  const middle = {
    x: toMillimeterPrecision((a.x + b.x) / 2),
    y: toMillimeterPrecision((a.y + b.y) / 2),
  };
  arena.points.splice(afterIndex + 1, 0, middle);
  return afterIndex + 1;
}

/** Um polígono precisa de pelo menos três vértices para existir. */
export function removeArenaVertex(doc: CourseDocument, id: ObjectId, index: number): boolean {
  const arena = arenaOf(doc, id);
  if (!arena || arena.shape !== 'polygon' || arena.points.length <= 3) return false;
  arena.points.splice(index, 1);
  return true;
}

export function setArenaCorner(
  doc: CourseDocument,
  id: ObjectId,
  corner: { style?: CornerStyle; radiusM?: number },
): void {
  const arena = arenaOf(doc, id);
  if (!arena) return;
  if (corner.style !== undefined) arena.corner.style = corner.style;
  if (corner.radiusM !== undefined) arena.corner.radiusM = Math.max(0, corner.radiusM);
  clampCornerRadius(arena);
}

type RulerPatch = Partial<Omit<Arena['perimeterRuler'], 'sides'>> & {
  /** Lados podem vir um a um: o que não vier fica como está. */
  sides?: Partial<Arena['perimeterRuler']['sides']>;
};

export function setPerimeterRuler(
  doc: CourseDocument,
  id: ObjectId,
  patch: RulerPatch,
): void {
  const arena = arenaOf(doc, id);
  if (!arena) return;
  arena.perimeterRuler = {
    ...arena.perimeterRuler,
    ...patch,
    sides: { ...arena.perimeterRuler.sides, ...(patch.sides ?? {}) },
  };
  if (arena.perimeterRuler.stepM <= 0) arena.perimeterRuler.stepM = 5;
}

/** Tipo e rótulo de uma construção. Na pista não faz nada. */
export function setStructure(
  doc: CourseDocument,
  id: ObjectId,
  patch: Partial<NonNullable<Arena['structure']>>,
): void {
  const arena = arenaOf(doc, id);
  if (arena?.structure) arena.structure = { ...arena.structure, ...patch };
}

export function setArenaStyle(
  doc: CourseDocument,
  id: ObjectId,
  patch: Partial<Arena['style']>,
): void {
  const arena = arenaOf(doc, id);
  if (arena) arena.style = { ...arena.style, ...patch };
}

/**
 * O raio do canto não pode passar da metade do menor lado — além disso o
 * contorno se autointersecta. O desenho já satura na hora de traçar, mas o
 * dado guardado precisa ser coerente com o que se vê.
 */
function clampCornerRadius(arena: Arena): void {
  if (arena.shape !== 'rectangle') return;
  const max = Math.min(arena.widthM, arena.heightM) / 2;
  if (arena.corner.radiusM > max) arena.corner.radiusM = toMillimeterPrecision(max);
}

/** Gira a construção até a aresta mais longa ficar em `degrees` (decisão 66). */
export function setStructureAngle(doc: CourseDocument, id: ObjectId, degrees: number): void {
  const arena = arenaOf(doc, id);
  if (!arena || arena.locked) return;
  const delta = degrees - structureAngle(arena);
  if (Math.abs(delta) < 1e-9) return;
  rotateAround(arena, boundsCenter(boundsIn(doc, arena)), delta, doc.page.printScale);
}
