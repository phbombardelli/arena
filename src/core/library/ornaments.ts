import { newId } from '@core/model/ids';
import type { Ornament, OrnamentType } from '@core/model/types';
import type { Vec2 } from '@core/geometry/vec';

/**
 * Elementos de pista. São puramente gráficos: não têm lógica esportiva e
 * não participam de nenhum cálculo. A biblioteca cresce na fase 11.
 */
export interface OrnamentDef {
  type: OrnamentType;
  label: string;
  /** Tamanho padrão em metros (diâmetro/lado da envoltória). */
  defaultSizeM: number;
  defaultColor: string;
  /** Rotacionar não altera a aparência de formas radialmente simétricas. */
  rotatable: boolean;
}

export const ORNAMENTS: readonly OrnamentDef[] = [
  { type: 'arvore', label: 'Árvore', defaultSizeM: 3, defaultColor: '#3f7d3f', rotatable: false },
  { type: 'arbusto', label: 'Arbusto', defaultSizeM: 1.6, defaultColor: '#5a9448', rotatable: false },
  { type: 'vaso', label: 'Vaso', defaultSizeM: 1, defaultColor: '#7a6a52', rotatable: true },
  { type: 'cerca', label: 'Cerca', defaultSizeM: 4, defaultColor: '#6b6b6b', rotatable: true },
  { type: 'cronometro', label: 'Cronômetro', defaultSizeM: 1.2, defaultColor: '#111111', rotatable: false },
  { type: 'seta', label: 'Seta', defaultSizeM: 3, defaultColor: '#d32020', rotatable: true },
  { type: 'entrada', label: 'Entrada', defaultSizeM: 3, defaultColor: '#2e7d32', rotatable: true },
  { type: 'saida', label: 'Saída', defaultSizeM: 3, defaultColor: '#d32020', rotatable: true },
] as const;

/** Entrada e saída da pista (B-13, B-21): a mesma seta, com papel próprio. */
export const isGateArrow = (type: OrnamentType): boolean => type === 'entrada' || type === 'saida';

export const GATE_LABEL: Record<'entrada' | 'saida', string> = { entrada: 'ENTRADA', saida: 'SAÍDA' };

/**
 * Giro de uma seta de entrada ou saída colocada em `pos`: perpendicular à
 * cerca mais próxima, para dentro da pista na entrada e para fora na
 * saída. Sem pista, aponta para a direita.
 */
export function gateRotation(type: 'entrada' | 'saida', pos: Vec2, outline: Vec2[] | null): number {
  if (!outline || outline.length < 3) return 0;
  let melhor = Infinity;
  let normal = { x: 1, y: 0 };
  for (let i = 0; i < outline.length; i += 1) {
    const a = outline[i]!;
    const b = outline[(i + 1) % outline.length]!;
    const ab = { x: b.x - a.x, y: b.y - a.y };
    const len2 = ab.x * ab.x + ab.y * ab.y;
    if (len2 === 0) continue;
    const t = Math.max(0, Math.min(1, ((pos.x - a.x) * ab.x + (pos.y - a.y) * ab.y) / len2));
    const p = { x: a.x + ab.x * t, y: a.y + ab.y * t };
    const d = Math.hypot(pos.x - p.x, pos.y - p.y);
    if (d < melhor) {
      melhor = d;
      const len = Math.sqrt(len2);
      normal = { x: -ab.y / len, y: ab.x / len };
      // A normal tem de apontar para DENTRO: testa meio metro adiante.
      const teste = { x: p.x + normal.x * 0.5, y: p.y + normal.y * 0.5 };
      if (!pointInPolygon(teste, outline)) normal = { x: -normal.x, y: -normal.y };
    }
  }
  const dir = type === 'entrada' ? normal : { x: -normal.x, y: -normal.y };
  return Math.round((Math.atan2(dir.y, dir.x) * 180) / Math.PI);
}

function pointInPolygon(p: Vec2, poly: Vec2[]): boolean {
  let dentro = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) dentro = !dentro;
  }
  return dentro;
}

export const ornamentDef = (type: OrnamentType): OrnamentDef =>
  ORNAMENTS.find((o) => o.type === type) ?? ORNAMENTS[0]!;

export function createOrnament(type: OrnamentType, pos: Vec2): Ornament {
  const def = ornamentDef(type);
  return {
    id: newId('orn'),
    kind: 'ornament',
    layer: 'ornaments',
    locked: false,
    visible: true,
    scope: 'pista',
    z: 0,
    type,
    pos,
    rotation: 0,
    sizeM: def.defaultSizeM,
    color: def.defaultColor,
    ...(isGateArrow(type) ? { showLabel: true } : {}),
  };
}
