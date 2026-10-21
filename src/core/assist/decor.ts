import type { Vec2 } from '@core/geometry/vec';
import { arenaPoints } from '@core/model/arena';
import type { CourseDocument } from '@core/model/types';

/**
 * Ornamentos que ocupam o chão e influenciam o traçado (decisão 74): as
 * ilhas (fixas da pista ou decorativas da prova) e os vasos. O assistente
 * contorna esses corpos como contorna obstáculos, e um traçado desenhado
 * que passa por cima de um deles vira aviso de interferência.
 */
export interface DecorBody {
  id: string;
  kind: 'ilha' | 'vaso';
  outline: Vec2[];
}

/** Oval inscrito num retângulo, como polígono. */
export function ovalPoints(canto: Vec2, larguraM: number, alturaM: number, passos = 24): Vec2[] {
  const c = { x: canto.x + larguraM / 2, y: canto.y + alturaM / 2 };
  return Array.from({ length: passos }, (_, i) => {
    const t = (i / passos) * Math.PI * 2;
    return {
      x: Math.round((c.x + (Math.cos(t) * larguraM) / 2) * 1000) / 1000,
      y: Math.round((c.y + (Math.sin(t) * alturaM) / 2) * 1000) / 1000,
    };
  });
}

export function decorBodies(doc: CourseDocument): DecorBody[] {
  const out: DecorBody[] = [];
  for (const o of doc.objects) {
    if (!o.visible) continue;
    if (o.kind === 'arena' && o.structure?.type === 'ilha') {
      out.push({ id: o.id, kind: 'ilha', outline: arenaPoints(o) });
    } else if (o.kind === 'ornament' && o.type === 'vaso') {
      // O vaso é desenhado num quadrado de lado `sizeM`.
      const r = o.sizeM / 2;
      out.push({
        id: o.id,
        kind: 'vaso',
        outline: [
          { x: o.pos.x - r, y: o.pos.y - r },
          { x: o.pos.x + r, y: o.pos.y - r },
          { x: o.pos.x + r, y: o.pos.y + r },
          { x: o.pos.x - r, y: o.pos.y + r },
        ],
      });
    }
  }
  return out;
}
