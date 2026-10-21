import { describe, expect, it } from 'vitest';
import { produce, enablePatches } from 'immer';
import { createDocument } from '@core/model/document';
import { createOrnament } from '@core/library/ornaments';
import { createRectangleArena } from '@core/model/arena';
import type { CourseDocument, CoursePath, Ornament } from '@core/model/types';
import {
  boundsContains,
  getBounds,
  getPosition,
  getRotation,
  unionBounds,
} from '@core/model/transform';
import {
  addObject,
  bringToFront,
  deleteObjects,
  duplicateObjects,
  moveObjects,
  rotateObjects,
  sendToBack,
  setLocked,
  setObjectPosition,
  setObjectRotation,
} from './ops';

enablePatches();

const edit = (doc: CourseDocument, recipe: (d: CourseDocument) => void): CourseDocument =>
  produce(doc, recipe);

function docWith(...objs: Ornament[]): CourseDocument {
  return edit(createDocument({ arena: true }), (d) => {
    for (const o of objs) addObject(d, o);
  });
}

const orn = (x: number, y: number): Ornament => createOrnament('arvore', { x, y });

describe('mover', () => {
  it('desloca só a seleção', () => {
    const a = orn(10, 10);
    const b = orn(20, 20);
    const doc = docWith(a, b);
    const next = edit(doc, (d) => moveObjects(d, [a.id], { x: 5, y: -2 }));
    expect(getPosition(next.objects.find((o) => o.id === a.id)!, 200)).toEqual({ x: 15, y: 8 });
    expect(getPosition(next.objects.find((o) => o.id === b.id)!, 200)).toEqual({ x: 20, y: 20 });
  });

  it('não move objeto bloqueado', () => {
    const a = orn(10, 10);
    let doc = docWith(a);
    doc = edit(doc, (d) => setLocked(d, [a.id], true));
    const next = edit(doc, (d) => moveObjects(d, [a.id], { x: 5, y: 5 }));
    expect(getPosition(next.objects[1]!, 200)).toEqual({ x: 10, y: 10 });
  });

  it('posição absoluta pelo painel', () => {
    const a = orn(10, 10);
    const doc = docWith(a);
    const next = edit(doc, (d) => setObjectPosition(d, a.id, { x: 42.35, y: 18.2 }));
    expect(getPosition(next.objects[1]!, 200)).toEqual({ x: 42.35, y: 18.2 });
  });
});

describe('girar', () => {
  it('um objeto gira em torno de si mesmo', () => {
    const a = orn(10, 10);
    const doc = docWith(a);
    const next = edit(doc, (d) => rotateObjects(d, [a.id], 30));
    expect(getPosition(next.objects[1]!, 200)).toEqual({ x: 10, y: 10 });
    expect(getRotation(next.objects[1]!)).toBe(30);
  });

  it('seleção múltipla gira em torno do centro comum', () => {
    const a = orn(0, 0);
    const b = orn(10, 0);
    const doc = docWith(a, b);
    const next = edit(doc, (d) => rotateObjects(d, [a.id, b.id], 90));
    const pa = getPosition(next.objects.find((o) => o.id === a.id)!, 200);
    const pb = getPosition(next.objects.find((o) => o.id === b.id)!, 200);
    // Centro em (5,0); 90° horário leva (0,0)→(5,-5) e (10,0)→(5,5).
    expect(pa.x).toBeCloseTo(5, 9);
    expect(pa.y).toBeCloseTo(-5, 9);
    expect(pb.x).toBeCloseTo(5, 9);
    expect(pb.y).toBeCloseTo(5, 9);
  });

  it('rotação é absoluta e normalizada, nunca acumulada com deriva', () => {
    const a = orn(10, 10);
    let doc = docWith(a);
    for (let i = 0; i < 8; i += 1) doc = edit(doc, (d) => rotateObjects(d, [a.id], 45));
    expect(getRotation(doc.objects[1]!)).toBeCloseTo(0, 9);
    doc = edit(doc, (d) => setObjectRotation(d, a.id, -30));
    expect(getRotation(doc.objects[1]!)).toBe(330);
  });
});

describe('duplicar e excluir', () => {
  it('duplica com deslocamento e novos ids', () => {
    const a = orn(10, 10);
    const doc = docWith(a);
    let ids: string[] = [];
    const next = edit(doc, (d) => {
      ids = duplicateObjects(d, [a.id], { x: 1, y: 1 });
    });
    expect(ids).toHaveLength(1);
    expect(ids[0]).not.toBe(a.id);
    expect(next.objects).toHaveLength(3);
    expect(getPosition(next.objects.find((o) => o.id === ids[0])!, 200)).toEqual({ x: 11, y: 11 });
  });

  it('cópia de traçado ancorado aponta para a cópia do obstáculo', () => {
    const a = orn(10, 10);
    let doc = docWith(a);
    const path: CoursePath = {
      id: 'p1',
      kind: 'path',
      layer: 'paths',
      locked: false,
      visible: true,
      scope: 'percurso',
      z: 0,
      nodes: [
        { pos: { x: 0, y: 0 }, type: 'corner', handleIn: null, handleOut: null, anchor: { objectId: a.id, ref: 'center' } },
        { pos: { x: 5, y: 5 }, type: 'corner', handleIn: null, handleOut: null, anchor: null },
      ],
      legs: [],
      distanceMode: 'nenhum',
      totalLabel: { visible: false, offsetM: { x: 0, y: 0 }, decimals: 2, color: '#d32020' },
      style: { dash: 'dashed', strokeMm: 0.35, color: '#6b6b6b' },
      obstacleDistances: {},
    };
    doc = edit(doc, (d) => addObject(d, path));

    let ids: string[] = [];
    const next = edit(doc, (d) => {
      ids = duplicateObjects(d, [a.id, 'p1'], { x: 0, y: 0 });
    });
    const copiedPath = next.objects.find(
      (o): o is CoursePath => o.kind === 'path' && ids.includes(o.id),
    )!;
    const copiedOrn = ids.find((id) => id !== copiedPath.id);
    expect(copiedPath.nodes[0]!.anchor?.objectId).toBe(copiedOrn);
  });

  it('âncora fora da seleção vira nó livre na cópia', () => {
    const a = orn(10, 10);
    let doc = docWith(a);
    const path: CoursePath = {
      id: 'p1', kind: 'path', layer: 'paths', locked: false, visible: true, scope: 'percurso', z: 0,
      nodes: [{ pos: { x: 0, y: 0 }, type: 'corner', handleIn: null, handleOut: null, anchor: { objectId: a.id, ref: 'center' } }],
      legs: [],
      distanceMode: 'nenhum',
      totalLabel: { visible: false, offsetM: { x: 0, y: 0 }, decimals: 2, color: '#d32020' },
      style: { dash: 'dashed', strokeMm: 0.35, color: '#6b6b6b' },
      obstacleDistances: {},
    };
    doc = edit(doc, (d) => addObject(d, path));
    let ids: string[] = [];
    const next = edit(doc, (d) => {
      ids = duplicateObjects(d, ['p1'], { x: 0, y: 0 });
    });
    const copy = next.objects.find((o): o is CoursePath => o.id === ids[0])!;
    expect(copy.nodes[0]!.anchor).toBeNull();
  });

  it('excluir remove os selecionados e preserva os bloqueados', () => {
    const a = orn(1, 1);
    const b = orn(2, 2);
    let doc = docWith(a, b);
    doc = edit(doc, (d) => setLocked(d, [b.id], true));
    const next = edit(doc, (d) => deleteObjects(d, [a.id, b.id]));
    expect(next.objects.map((o) => o.id)).toContain(b.id);
    expect(next.objects.map((o) => o.id)).not.toContain(a.id);
  });
});

describe('empilhamento', () => {
  it('frente e trás mudam o z dentro da camada', () => {
    const a = orn(1, 1);
    const b = orn(2, 2);
    let doc = docWith(a, b);
    doc = edit(doc, (d) => bringToFront(d, [a.id]));
    const za = doc.objects.find((o) => o.id === a.id)!.z;
    const zb = doc.objects.find((o) => o.id === b.id)!.z;
    expect(za).toBeGreaterThan(zb);
    doc = edit(doc, (d) => sendToBack(d, [a.id]));
    expect(doc.objects.find((o) => o.id === a.id)!.z).toBeLessThan(zb);
  });
});

describe('laço de seleção', () => {
  const laco = (doc: CourseDocument, min: { x: number; y: number }, max: { x: number; y: number }) =>
    doc.objects
      .filter((o) => boundsContains({ min, max }, getBounds(o, doc.page.printScale)))
      .map((o) => o.id);

  it('pega o que está inteiramente dentro', () => {
    const a = orn(10, 10);
    const doc = docWith(a);
    expect(laco(doc, { x: 5, y: 5 }, { x: 15, y: 15 })).toEqual([a.id]);
  });

  it('NÃO pega a pista ao laçar dentro dela', () => {
    const a = orn(10, 10);
    const doc = docWith(a);
    const ids = laco(doc, { x: 5, y: 5 }, { x: 15, y: 15 });
    const arena = doc.objects.find((o) => o.kind === 'arena')!;
    expect(ids).not.toContain(arena.id);
  });

  it('objeto cortado pela borda fica de fora', () => {
    const a = orn(10, 10); // envoltória 8,5..11,5
    const doc = docWith(a);
    expect(laco(doc, { x: 9, y: 5 }, { x: 15, y: 15 })).toEqual([]);
  });
});

describe('envoltória', () => {
  it('união cobre todos os objetos', () => {
    const a = orn(0, 0);
    const b = orn(20, 10);
    const doc = docWith(a, b);
    const objs = doc.objects.filter((o) => o.kind === 'ornament');
    const u = unionBounds(objs.map((o) => getBounds(o, 200)))!;
    expect(u.min.x).toBeCloseTo(-1.5, 9);
    expect(u.max.x).toBeCloseTo(21.5, 9);
    expect(u.min.y).toBeCloseTo(-1.5, 9);
    expect(u.max.y).toBeCloseTo(11.5, 9);
  });
});

describe('girar o cenário vinculado (decisão 66)', () => {
  it('pista e árvore giram juntas em torno do centro comum, como uma peça só', () => {
    const pista = createRectangleArena({ x: 0, y: 0 }, 40, 20);
    const arvore = orn(50, 10);
    const doc = edit(createDocument(), (d) => {
      addObject(d, pista);
      addObject(d, arvore);
    });
    // Centro comum: x de 0 a 50,5 (a árvore tem 1 m), y de 0 a 20.
    const next = edit(doc, (d) => rotateObjects(d, [pista.id, arvore.id], 90));
    const p = next.objects.find((o) => o.id === pista.id)!;
    const pts = p.kind === 'arena' ? p.points : [];
    expect(pts).toHaveLength(4);
    // Girada 90°, a pista de 40 × 20 fica de pé: 20 de largura, 40 de altura.
    const xs = pts.map((q) => q.x);
    const ys = pts.map((q) => q.y);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(20, 6);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(40, 6);
    // A árvore, que estava à direita da pista, fica embaixo dela.
    const a = getPosition(next.objects.find((o) => o.id === arvore.id)!, 200);
    expect(a.y).toBeGreaterThan(Math.max(...ys) - 1);
  });

  it('uma construção sozinha gira em torno do próprio centro', () => {
    const c = createRectangleArena({ x: 10, y: 10 }, 10, 4);
    const doc = edit(createDocument(), (d) => addObject(d, c));
    const next = edit(doc, (d) => rotateObjects(d, [c.id], 90));
    const p = next.objects.find((o) => o.id === c.id)!;
    const pts = p.kind === 'arena' ? p.points : [];
    const xs = pts.map((q) => q.x);
    expect((Math.max(...xs) + Math.min(...xs)) / 2).toBeCloseTo(15, 6);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(4, 6);
  });
});
