import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { buildCourseRide } from '@core/assist/courseRide';
import { createObstacle } from '@core/library/obstacles';
import { placeTimingLine, syncTimingLines } from '@core/library/timing';
import { createRectangleArena } from '@core/model/arena';
import { createDocument } from '@core/model/document';
import { createPath, createPathNode } from '@core/model/path';
import type { CourseDocument, CoursePath, Obstacle } from '@core/model/types';
import { canSetDistance, courseDistances, enforceLockedDistances, lockDistance, setCourseDistance, slideAlongPath } from './distanceOps';
import { addObject, moveObjects } from './ops';
import { confirmCombination } from './alignOps';
import { syncPathAnchors } from './pathAnchors';
import { placeAssistantPath } from './pathOps';

const edit = (doc: CourseDocument, recipe: (d: CourseDocument) => void) =>
  produce(doc, (d) => {
    recipe(d);
    syncTimingLines(d);
    syncPathAnchors(d);
  });

function salto(numero: string, x: number, y: number, rot = 0): Obstacle {
  const o = createObstacle('vertical', { x, y }, numero);
  o.rotation = rot;
  return o;
}

/** Pista, partida, três saltos com volta entre eles, chegada e o traçado do assistente. */
function percurso(): CourseDocument {
  const saltos = [salto('1', 25, 40), salto('2', 60, 30, 90), salto('3', 45, 12, 180)];
  let doc = edit(createDocument(), (d) => {
    d.objects.length = 0;
    addObject(d, createRectangleArena({ x: 0, y: 0 }, 80, 50));
    for (const s of saltos) addObject(d, s);
    addObject(d, placeTimingLine('start', saltos[0]!, 12));
    addObject(d, placeTimingLine('finish', saltos[2]!, 12));
  });
  const r = buildCourseRide(doc)!;
  doc = edit(doc, (d) => placeAssistantPath(d, r.path));
  return doc;
}

const tracado = (doc: CourseDocument) => doc.objects.find((o): o is CoursePath => o.kind === 'path')!;
const par = (doc: CourseDocument, de: string, para: string) =>
  courseDistances(doc, tracado(doc)).find((d) => d.fromLabel === de && d.toLabel === para)!;

describe('digitar a distância (B-60)', () => {
  it('na volta, o obstáculo de destino anda até a medida bater', () => {
    let doc = percurso();
    const antes = par(doc, '1', '2');
    const alvo = Math.round(antes.meters) + 2;
    let ok = false;
    doc = edit(doc, (d) => {
      ok = setCourseDistance(d, tracado(d).id, antes.key, alvo);
    });
    expect(ok).toBe(true);
    expect(par(doc, '1', '2').meters).toBeCloseTo(alvo, 2);
    // O salto 1 não andou; o 2 andou sobre a própria reta (só em x, girado 90°).
    const dois = doc.objects.find((o) => o.id === antes.toId) as Obstacle;
    expect(dois.pos.y).toBeCloseTo(30, 6);
  });

  it('partida e chegada: anda a cruzada', () => {
    let doc = percurso();
    const p = par(doc, 'Partida', '1');
    doc = edit(doc, (d) => {
      setCourseDistance(d, tracado(d).id, p.key, p.meters - 2);
    });
    expect(par(doc, 'Partida', '1').meters).toBeCloseTo(p.meters - 2, 2);
    expect((doc.objects.find((o) => o.id === p.toId) as Obstacle).pos).toEqual({ x: 25, y: 40 });
  });

  it('traçado à mão: o destino desliza pela linha, que fica onde está', () => {
    let doc = edit(createDocument(), (d) => {
      d.objects.length = 0;
      addObject(d, salto('1', 0, 0, 90));
      addObject(d, salto('2', 40, 0, 90));
      addObject(
        d,
        createPath([createPathNode({ x: -5, y: 0 }), createPathNode({ x: 20, y: 15 }), createPathNode({ x: 45, y: 0 })]),
      );
    });
    const antes = JSON.stringify(tracado(doc).nodes);
    const p = par(doc, '1', '2');
    expect(canSetDistance(doc, tracado(doc), p)).toBe(true);
    doc = edit(doc, (d) => {
      setCourseDistance(d, tracado(d).id, p.key, p.meters - 3);
    });
    expect(par(doc, '1', '2').meters).toBeCloseTo(p.meters - 3, 2);
    expect(JSON.stringify(tracado(doc).nodes)).toBe(antes);
  });
});

describe('travar a distância (B-62)', () => {
  const comTrava = (d: CourseDocument) => {
    syncTimingLines(d);
    syncPathAnchors(d);
    enforceLockedDistances(d);
  };
  const editar = (doc: CourseDocument, recipe: (d: CourseDocument) => void) =>
    produce(doc, (d) => {
      recipe(d);
      comTrava(d);
    });

  it('mover o salto de origem arrasta o destino e a medida fica', () => {
    let doc = percurso();
    const p = par(doc, '1', '2');
    doc = editar(doc, (d) => lockDistance(d, tracado(d).id, p.key, p.meters));
    doc = editar(doc, (d) => moveObjects(d, [p.fromId], { x: 0, y: 2 }));
    expect(par(doc, '1', '2').meters).toBeCloseTo(p.meters, 2);
    expect((doc.objects.find((o) => o.id === p.toId) as Obstacle).pos.y).toBeCloseTo(30, 6);
  });

  it('destravar deixa a medida mudar', () => {
    let doc = percurso();
    const p = par(doc, '1', '2');
    doc = editar(doc, (d) => lockDistance(d, tracado(d).id, p.key, p.meters));
    doc = editar(doc, (d) => lockDistance(d, tracado(d).id, p.key, null));
    doc = editar(doc, (d) => moveObjects(d, [p.fromId], { x: 0, y: 2 }));
    expect(Math.abs(par(doc, '1', '2').meters - p.meters)).toBeGreaterThan(0.5);
  });
});

describe('Alt + setas sobre o traçado (B-65)', () => {
  it('o salto anda sobre a própria reta e a distância muda o mesmo tanto', () => {
    let doc = percurso();
    const p = par(doc, '1', '2');
    doc = edit(doc, (d) => {
      slideAlongPath(d, p.toId, 1);
    });
    expect(par(doc, '1', '2').meters).toBeCloseTo(p.meters + 1, 1);
    expect((doc.objects.find((o) => o.id === p.toId) as Obstacle).pos.y).toBeCloseTo(30, 6);
  });
});

describe('vinculados andam juntos (decisão 81)', () => {
  it('distância de 4 a 5A empurra 5B junto; a de 5A a 5B só mexe no 5B', () => {
    let doc = edit(createDocument(), (d) => {
      d.objects.length = 0;
      addObject(d, salto('4', 0, 0, 90));
      addObject(d, salto('5', 20, 0, 90));
      addObject(d, salto('6', 28, 0, 90));
      addObject(d, createPath([createPathNode({ x: -5, y: 0 }), createPathNode({ x: 40, y: 0 })]));
    });
    const [, a, b] = doc.objects.filter((o): o is Obstacle => o.kind === 'obstacle');
    doc = edit(doc, (d) => confirmCombination(d, [a!.id, b!.id]));
    const pos = (id: string) => (doc.objects.find((o) => o.id === id) as Obstacle).pos.x;
    const p = par(doc, '4', '5A');
    doc = edit(doc, (d) => {
      setCourseDistance(d, tracado(d).id, p.key, p.meters + 3);
    });
    expect(pos(a!.id)).toBeCloseTo(23, 2);
    expect(pos(b!.id)).toBeCloseTo(31, 2);
    const q = par(doc, '5A', '5B');
    doc = edit(doc, (d) => {
      setCourseDistance(d, tracado(d).id, q.key, q.meters + 1);
    });
    expect(pos(a!.id)).toBeCloseTo(23, 2);
    expect(pos(b!.id)).toBeCloseTo(32, 2);
  });
});
