import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { addObject } from '@core/commands/ops';
import { createObstacle } from '@core/library/obstacles';
import { createDocument } from '@core/model/document';
import { createPath, createPathNode } from '@core/model/path';
import type { CourseDocument, Obstacle } from '@core/model/types';
import { LABEL_FONT_MM, layoutLabels, onLinePlacement } from './labelLayout';

const k = 1000 / 300;

/** Caixa do número, como o leiaute a estima: para checar choque. */
function caixa(c: { x: number; y: number }, texto: string, fontMm: number) {
  const w = (texto.length * fontMm * 0.66) / k;
  const h = (fontMm * 1.05) / k;
  return { min: { x: c.x - w / 2, y: c.y - h / 2 }, max: { x: c.x + w / 2, y: c.y + h / 2 } };
}

function cena(extra: (d: CourseDocument) => void): CourseDocument {
  return produce(createDocument(), (d) => {
    d.objects.length = 0;
    d.page.printScale = 300;
    extra(d);
  });
}

describe('rótulos automáticos não cobrem o desenho (decisão 55)', () => {
  it('sem nada por perto, o número fica no lugar de sempre: ao lado', () => {
    const doc = cena((d) => addObject(d, createObstacle('vertical', { x: 40, y: 30 }, '1')));
    const o = doc.objects[0] as Obstacle;
    const c = layoutLabels(doc).number.get(o.id)!;
    expect(c.x).toBeGreaterThan(o.pos.x + o.faceWidthM / 2);
    expect(Math.abs(c.y - o.pos.y)).toBeLessThan(0.5);
  });

  it('com o traçado passando ao lado, o número sai de cima da linha', () => {
    const doc = cena((d) => {
      addObject(d, createObstacle('vertical', { x: 40, y: 30 }, '1'));
      // Linha vertical exatamente onde o número ficaria (à direita).
      addObject(d, createPath([createPathNode({ x: 43, y: 10 }), createPathNode({ x: 43, y: 50 })]));
    });
    const o = doc.objects[0] as Obstacle;
    const b = caixa(layoutLabels(doc).number.get(o.id)!, '1', LABEL_FONT_MM.number);
    expect(b.min.x > 43 || b.max.x < 43).toBe(true);
  });

  it('dois obstáculos colados não empilham os números', () => {
    const doc = cena((d) => {
      addObject(d, createObstacle('vertical', { x: 40, y: 30 }, '1'));
      addObject(d, createObstacle('vertical', { x: 46, y: 30 }, '2'));
    });
    const [a, b] = doc.objects as Obstacle[];
    const l = layoutLabels(doc);
    const ba = caixa(l.number.get(a!.id)!, '1', LABEL_FONT_MM.number);
    const bb = caixa(l.number.get(b!.id)!, '2', LABEL_FONT_MM.number);
    const tocam = ba.min.x <= bb.max.x && ba.max.x >= bb.min.x && ba.min.y <= bb.max.y && ba.max.y >= bb.min.y;
    expect(tocam).toBe(false);
  });

  it('rótulo posicionado à mão fica onde foi posto', () => {
    const doc = cena((d) => {
      const o = createObstacle('vertical', { x: 40, y: 30 }, '1');
      o.numberLabel.auto = false;
      o.numberLabel.offsetM = { x: -5, y: 0 };
      addObject(d, o);
      addObject(d, createPath([createPathNode({ x: 35, y: 10 }), createPathNode({ x: 35, y: 50 })]));
    });
    const o = doc.objects[0] as Obstacle;
    expect(layoutLabels(doc).number.get(o.id)).toEqual({ x: 35, y: 30 });
  });
});

describe('distância escrita sobre a linha (decisão 56)', () => {
  it('linha horizontal: texto reto, logo acima dela', () => {
    const l = onLinePlacement({ x: 10, y: 10 }, { x: 1, y: 0 }, 1, 0.2);
    expect(l.angle).toBeCloseTo(0, 9);
    expect(l.pos.x).toBeCloseTo(10, 9);
    expect(l.pos.y).toBeCloseTo(10 - 0.7, 9);
  });

  it('linha percorrida da direita para a esquerda: o texto não fica de cabeça para baixo', () => {
    const l = onLinePlacement({ x: 10, y: 10 }, { x: -1, y: 0 }, 1, 0.2);
    expect(Math.abs(l.angle)).toBeLessThan(1e-9);
    expect(l.pos.y).toBeLessThan(10);
  });

  it('linha inclinada: o texto gira junto, entre −90 e 90 graus', () => {
    for (const [tx, ty] of [[1, 1], [-1, 1], [1, -1], [-1, -1], [0, 1], [0, -1]]) {
      const l = onLinePlacement({ x: 0, y: 0 }, { x: tx!, y: ty! }, 1, 0.2);
      expect(l.angle).toBeGreaterThan(-90 - 1e-9);
      expect(l.angle).toBeLessThanOrEqual(90 + 1e-9);
      // O centro fica a meia altura mais a folga da linha.
      expect(Math.hypot(l.pos.x, l.pos.y)).toBeCloseTo(0.7, 9);
    }
  });
});

describe('círculo da ordem do desempate (B-99)', () => {
  it('entra na caixa do número: dois obstáculos vizinhos não se cobrem', () => {
    // Como o 2 e o 12 do croqui do usuário: lado a lado, girados.
    const doc = cena((d) => {
      const a = createObstacle('oxer', { x: 40, y: 30 }, '2');
      a.rotation = 40;
      const b = createObstacle('oxer', { x: 46, y: 30 }, '12');
      b.rotation = 60;
      addObject(d, a);
      addObject(d, b);
    });
    const [a, b] = doc.objects as Obstacle[];
    const comOrdem = new Set([a!.id, b!.id]);
    const l = layoutLabels(doc, comOrdem);
    const ca = caixa(l.number.get(a!.id)!, '2  ', LABEL_FONT_MM.number);
    const cb = caixa(l.number.get(b!.id)!, '12  ', LABEL_FONT_MM.number);
    const cobre =
      ca.min.x < cb.max.x && cb.min.x < ca.max.x && ca.min.y < cb.max.y && cb.min.y < ca.max.y;
    expect(cobre).toBe(false);
  });
});
