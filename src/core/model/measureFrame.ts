import { outlinePolygon } from '@core/geometry/outline';
import type { Vec2 } from '@core/geometry/vec';
import { arenaPoints } from './arena';
import { firstArena } from './document';
import type { CourseDocument } from './types';

/**
 * De onde se mede o croqui (decisão 60): o canto superior esquerdo da
 * pista. A grade começa ali, as réguas marcam 0 ali, e as coordenadas
 * mostradas na tela contam a partir dali — "a 12 m da cerca de cima" lê
 * direto. `outline` é o contorno real (com os cantos arredondados), onde a
 * grade é recortada. Sem pista, mede-se da origem do modelo e a grade
 * cobre tudo.
 */
export interface MeasureFrame {
  originM: Vec2;
  outline: Vec2[] | null;
}

export function measureFrame(doc: CourseDocument): MeasureFrame {
  const arena = firstArena(doc);
  if (!arena) return { originM: { x: 0, y: 0 }, outline: null };
  const pts = arenaPoints(arena);
  if (pts.length < 3) return { originM: { x: 0, y: 0 }, outline: null };
  return {
    originM: {
      x: Math.min(...pts.map((p) => p.x)),
      y: Math.min(...pts.map((p) => p.y)),
    },
    outline: outlinePolygon(pts, arena.corner.style, arena.corner.radiusM),
  };
}
