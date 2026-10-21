import type { Vec2 } from '@core/geometry/vec';
import { longestEdgeAngle } from '@core/geometry/hatch';
import { arenaPoints, createPolygonArena, createRectangleArena } from '@core/model/arena';
import type { Arena, StructureType } from '@core/model/types';

/**
 * Construções do local (decisão 54).
 *
 * Cada tipo tem um preenchimento que se lê em preto e branco, porque o
 * croqui circula impresso e fotocopiado: degraus para a arquibancada,
 * hachura para o concreto, cinza cheio para a edificação.
 */
export interface StructureDef {
  type: StructureType;
  label: string;
  fill: string;
  /** Linhas internas: degraus ou hachura. `null` = sem linhas. */
  hatch: { angle: 'aresta' | number; spacingM: number; color: string } | null;
}

export const STRUCTURES: readonly StructureDef[] = [
  {
    type: 'arquibancada',
    label: 'Arquibancada',
    fill: '#ececec',
    // Degraus paralelos à aresta mais longa: é o lado que dá para a pista.
    hatch: { angle: 'aresta', spacingM: 0.9, color: '#8a8a8a' },
  },
  {
    type: 'concreto',
    label: 'Concreto',
    fill: '#dedede',
    hatch: { angle: 45, spacingM: 1.2, color: '#a0a0a0' },
  },
  { type: 'edificacao', label: 'Edificação', fill: '#c4c4c4', hatch: null },
  // Ilha fixa de grama dentro da pista (decisão 64): o cavalo contorna.
  { type: 'ilha', label: 'Ilha', fill: '#dbe9d0', hatch: null },
  { type: 'outra', label: 'Construção', fill: '#efefef', hatch: null },
] as const;

export const structureDef = (type: StructureType): StructureDef =>
  STRUCTURES.find((s) => s.type === type) ?? STRUCTURES[STRUCTURES.length - 1]!;

/** Põe o rótulo, o preenchimento e o traço de construção num contorno novo. */
function asStructure(arena: Arena, type: StructureType): Arena {
  const def = structureDef(type);
  return {
    ...arena,
    // Ilha não se escreve no croqui: o desenho verde já diz o que é.
    structure: { type, label: type === 'ilha' ? '' : def.label },
    corner: { style: 'square', radiusM: 0 },
    perimeterRuler: { ...arena.perimeterRuler, visible: false },
    style: { strokeMm: 0.25, fill: def.fill, stroke: '#3a3a3a' },
  };
}

export const createRectangleStructure = (
  origin: Vec2,
  widthM: number,
  heightM: number,
  type: StructureType,
): Arena => asStructure(createRectangleArena(origin, widthM, heightM), type);

export const createPolygonStructure = (points: Vec2[], type: StructureType): Arena =>
  asStructure(createPolygonArena(points), type);

/** Tamanho padrão da letra do rótulo de construção, em mm de papel. */
export const STRUCTURE_LABEL_MM = 2.8;

/**
 * Giro do rótulo de uma construção (B-23): o que o desenhador escolheu, ou,
 * no automático, o da aresta mais longa — nunca de cabeça para baixo.
 */
export function structureLabelAngle(arena: Arena): number {
  const manual = arena.structure?.labelRotation;
  if (manual !== undefined) return manual;
  let giro = ((longestEdgeAngle(arenaPoints(arena)) % 180) + 180) % 180;
  if (giro > 90) giro -= 180;
  return giro;
}

/**
 * Ângulo de uma construção (decisão 66): o da aresta mais longa, entre −90
 * e 90°. Contorno não guarda giro; o ângulo se lê da própria forma, e
 * mudá-lo gira os pontos em torno do centro.
 */
export function structureAngle(arena: Arena): number {
  let a = ((longestEdgeAngle(arenaPoints(arena)) % 180) + 180) % 180;
  if (a > 90) a -= 180;
  return Math.round(a * 10) / 10;
}
