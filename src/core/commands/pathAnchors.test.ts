import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { createObstacle } from '@core/library/obstacles';
import { createDocument } from '@core/model/document';
import { createPath, createPathNode } from '@core/model/path';
import type { CourseDocument, CoursePath, Obstacle } from '@core/model/types';
import { addObject, moveObjects, rotateObjects } from './ops';
import { syncPathAnchors } from './pathAnchors';
import { placeAssistantPath } from './pathOps';

// Como o documentStore: toda edição termina sincronizando as âncoras.
const edit = (doc: CourseDocument, recipe: (d: CourseDocument) => void) =>
  produce(doc, (d) => {
    recipe(d);
    syncPathAnchors(d);
  });

/** Dois verticais numa reta, cruzados de baixo para cima pelo centro. */
function montar() {
  const a = createObstacle('vertical', { x: 20, y: 50 }, '1');
  const b = createObstacle('vertical', { x: 20, y: 20 }, '2');
  const tracado = createPath([
    createPathNode({ x: 20, y: 56 }, 'corner'),
    createPathNode({ x: 20, y: 44 }, 'corner'),
    createPathNode({ x: 26, y: 35 }, 'corner'), // a volta: fora do eixo
    createPathNode({ x: 20, y: 26 }, 'corner'),
    createPathNode({ x: 20, y: 14 }, 'corner'),
  ]);
  let doc = edit(createDocument(), (d) => {
    d.objects.length = 0;
    addObject(d, a);
    addObject(d, b);
  });
  doc = edit(doc, (d) => placeAssistantPath(d, tracado));
  const path = () => doc.objects.find((o): o is CoursePath => o.kind === 'path')!;
  return { a, b, get doc() { return doc; }, set doc(v) { doc = v; }, path };
}

describe('traçado do assistente preso aos obstáculos (B-59)', () => {
  it('prende só os nós da reta do salto', () => {
    const t = montar();
    const presos = t.path().nodes.map((n) => n.anchor?.objectId ?? null);
    expect(presos).toEqual([t.a.id, t.a.id, null, t.b.id, t.b.id]);
  });

  it('mover o obstáculo leva a reta dele junto; a volta fica', () => {
    const t = montar();
    t.doc = edit(t.doc, (d) => moveObjects(d, [t.b.id], { x: 0, y: -3 }));
    const n = t.path().nodes;
    expect(n[3]!.pos).toEqual({ x: 20, y: 23 });
    expect(n[4]!.pos).toEqual({ x: 20, y: 11 });
    expect(n[2]!.pos).toEqual({ x: 26, y: 35 });
    expect(n[0]!.pos).toEqual({ x: 20, y: 56 });
  });

  it('girar o obstáculo gira a reta em torno dele', () => {
    const t = montar();
    t.doc = edit(t.doc, (d) => rotateObjects(d, [t.b.id], 90));
    const n = t.path().nodes;
    expect(n[3]!.pos.x).toBeCloseTo(14, 6); // horário, com y para baixo
    expect(n[3]!.pos.y).toBeCloseTo(20, 6);
  });

  it('mover tudo junto não move duas vezes', () => {
    const t = montar();
    const p = t.path();
    t.doc = edit(t.doc, (d) => moveObjects(d, [t.a.id, t.b.id, p.id], { x: 5, y: 0 }));
    expect(t.path().nodes[3]!.pos).toEqual({ x: 25, y: 26 });
    expect(t.path().nodes[3]!.anchor?.objectId).toBe(t.b.id);
  });

  it('mover só o traçado solta as âncoras', () => {
    const t = montar();
    const p = t.path();
    t.doc = edit(t.doc, (d) => moveObjects(d, [p.id], { x: 5, y: 0 }));
    expect(t.path().nodes.every((n) => n.anchor === null)).toBe(true);
    t.doc = edit(t.doc, (d) => moveObjects(d, [t.b.id], { x: 0, y: -3 }));
    expect(t.path().nodes[3]!.pos).toEqual({ x: 25, y: 26 });
  });

  it('apagar o obstáculo solta os nós dele', () => {
    const t = montar();
    t.doc = edit(t.doc, (d) => {
      d.objects = d.objects.filter((o) => o.id !== t.b.id);
    });
    expect(t.path().nodes[3]!.anchor).toBeNull();
    expect((t.doc.objects.find((o) => o.id === t.a.id) as Obstacle).pos).toEqual({ x: 20, y: 50 });
  });
});
