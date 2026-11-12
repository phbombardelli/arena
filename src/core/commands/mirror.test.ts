import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { createDocument } from '@core/model/document';
import { createObstacle } from '@core/library/obstacles';
import { createOrnament } from '@core/library/ornaments';
import { createPath, createPathNode } from '@core/model/path';
import { fromAngle } from '@core/geometry/vec';
import { jumpHeading } from '@core/assist/ridePath';
import { anchorNodesToObstacles, syncPathAnchors } from './pathAnchors';
import type { CourseDocument, CoursePath, Obstacle } from '@core/model/types';
import { addObject, mirrorObjects } from './ops';

const rumo = (o: Obstacle) => fromAngle(jumpHeading(o));
const perto = (a: number, b: number) => expect(a).toBeCloseTo(b, 6);

function montar(): { doc: CourseDocument; a: Obstacle; b: Obstacle } {
  const a = { ...createObstacle('oxer', { x: 10, y: 20 }, '1'), rotation: 30 };
  const b = { ...createObstacle('vertical', { x: 30, y: 10 }, '2'), rotation: -60 };
  const doc = produce(createDocument({ arena: true }), (d) => {
    addObject(d, a);
    addObject(d, b);
  });
  return { doc, a, b };
}

describe('espelhar (B-96)', () => {
  it('esquerda ↔ direita: reflete posições e o sentido de salto em torno do centro', () => {
    const { doc, a, b } = montar();
    const antes = { ra: rumo(a), rb: rumo(b) };
    const out = produce(doc, (d) => mirrorObjects(d, [a.id, b.id], 'horizontal'));
    const a2 = out.objects.find((o) => o.id === a.id) as Obstacle;
    const b2 = out.objects.find((o) => o.id === b.id) as Obstacle;
    // As posições trocam de lado: a distância em x troca de sinal, o y fica.
    perto(a2.pos.x - b2.pos.x, -(a.pos.x - b.pos.x));
    perto(a2.pos.y, a.pos.y);
    perto(b2.pos.y, b.pos.y);
    // O rumo do salto é o refletido: x troca de sinal, y fica.
    perto(rumo(a2).x, -antes.ra.x);
    perto(rumo(a2).y, antes.ra.y);
    perto(rumo(b2).x, -antes.rb.x);
    perto(rumo(b2).y, antes.rb.y);
  });

  it('cima ↕ baixo: o rumo troca o y', () => {
    const { doc, a } = montar();
    const out = produce(doc, (d) => mirrorObjects(d, [a.id], 'vertical'));
    const a2 = out.objects.find((o) => o.id === a.id) as Obstacle;
    // Um só: espelha no próprio lugar.
    perto(a2.pos.x, a.pos.x);
    perto(a2.pos.y, a.pos.y);
    perto(rumo(a2).x, rumo(a).x);
    perto(rumo(a2).y, -rumo(a).y);
  });

  it('duas vezes volta ao original', () => {
    const { doc, a, b } = montar();
    const ids = [a.id, b.id];
    const out = produce(doc, (d) => {
      mirrorObjects(d, ids, 'horizontal');
      mirrorObjects(d, ids, 'horizontal');
    });
    const a2 = out.objects.find((o) => o.id === a.id) as Obstacle;
    perto(a2.pos.x, a.pos.x);
    perto(rumo(a2).x, rumo(a).x);
    perto(rumo(a2).y, rumo(a).y);
  });

  it('o traçado selecionado junto continua preso e passa pelos mesmos pontos refletidos', () => {
    const { doc, a } = montar();
    const h = rumo(a);
    const path = createPath([
      createPathNode({ x: a.pos.x - h.x * 8, y: a.pos.y - h.y * 8 }),
      createPathNode({ x: a.pos.x + h.x * 8, y: a.pos.y + h.y * 8 }),
    ]);
    const base = produce(doc, (d) => {
      addObject(d, path);
      const p = d.objects.find((o) => o.id === path.id) as CoursePath;
      anchorNodesToObstacles(p, d.objects.filter((o): o is Obstacle => o.kind === 'obstacle'));
    });
    const out = produce(base, (d) => {
      mirrorObjects(d, [a.id, path.id], 'horizontal');
      syncPathAnchors(d);
    });
    const p2 = out.objects.find((o) => o.id === path.id) as CoursePath;
    const a2 = out.objects.find((o) => o.id === a.id) as Obstacle;
    const h2 = rumo(a2);
    // Os dois nós continuam sobre a reta do salto, antes e depois do obstáculo.
    perto(p2.nodes[0]!.pos.x, a2.pos.x - h2.x * 8);
    perto(p2.nodes[0]!.pos.y, a2.pos.y - h2.y * 8);
    perto(p2.nodes[1]!.pos.x, a2.pos.x + h2.x * 8);
    expect(p2.nodes[0]!.anchor?.objectId).toBe(a.id);
  });

  it('a seta de entrada (x local) vira para o outro lado', () => {
    const seta = { ...createOrnament('entrada', { x: 0, y: 0 }), rotation: 0 };
    const doc = produce(createDocument({ arena: false }), (d) => addObject(d, seta));
    const out = produce(doc, (d) => mirrorObjects(d, [seta.id], 'horizontal'));
    const s2 = out.objects.find((o) => o.id === seta.id)!;
    expect(s2.kind === 'ornament' && s2.rotation).toBe(180);
  });
});
