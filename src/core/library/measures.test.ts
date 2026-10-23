import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { addObject } from '@core/commands/ops';
import { createRectangleArena } from '@core/model/arena';
import { createDocument } from '@core/model/document';
import { getBounds, translate } from '@core/model/transform';
import type { CourseDocument, MeasureLine } from '@core/model/types';
import { validateDocument } from '@core/persistence/validate';
import {
  alignMeasureToFence,
  angleToFence,
  constrainToFence,
  createMeasure,
  measureLength,
  setMeasureLength,
} from './measures';

const quadrado = [
  { x: 0, y: 0 },
  { x: 60, y: 0 },
  { x: 60, y: 40 },
  { x: 0, y: 40 },
];

function comTrena(m: MeasureLine): CourseDocument {
  return produce(createDocument(), (d) => {
    d.objects.length = 0;
    addObject(d, createRectangleArena({ x: 0, y: 0 }, 60, 40));
    addObject(d, m);
  });
}
const trena = (doc: CourseDocument) => doc.objects.find((o): o is MeasureLine => o.kind === 'measure')!;

describe('trena (B-64)', () => {
  it('Shift: perpendicular à cerca mais próxima, com o comprimento projetado', () => {
    const b = constrainToFence(quadrado, { x: 20, y: 1 }, { x: 22, y: 9 });
    expect(b.x).toBeCloseTo(20, 9);
    expect(b.y).toBeCloseTo(9, 9);
  });

  it('Shift: paralela quando o gesto vai ao longo da cerca', () => {
    const b = constrainToFence(quadrado, { x: 20, y: 1 }, { x: 30, y: 2 });
    expect(b.y).toBeCloseTo(1, 9);
    expect(b.x).toBeCloseTo(30, 9);
  });

  it('o botão esquadra sem mudar o comprimento', () => {
    let doc = comTrena(createMeasure({ x: 20, y: 1 }, { x: 23, y: 9 }));
    const antes = measureLength(trena(doc));
    doc = produce(doc, (d) => {
      alignMeasureToFence(d, trena(d).id, 'perpendicular');
    });
    expect(measureLength(trena(doc))).toBeCloseTo(antes, 9);
    expect(angleToFence(doc, trena(doc))).toBeCloseTo(90, 6);
    expect(trena(doc).b.x).toBeCloseTo(20, 9);
  });

  it('comprimento digitado mantém a direção', () => {
    let doc = comTrena(createMeasure({ x: 0, y: 0 }, { x: 3, y: 4 }));
    doc = produce(doc, (d) => setMeasureLength(d, trena(d).id, 10));
    expect(trena(doc).b.x).toBeCloseTo(6, 9);
    expect(trena(doc).b.y).toBeCloseTo(8, 9);
  });

  it('anda inteira, tem envoltória e passa pela validação do arquivo', () => {
    const m = createMeasure({ x: 1, y: 1 }, { x: 5, y: 1 });
    translate(m, { x: 2, y: 0 }, 500);
    expect(m.a.x).toBe(3);
    expect(m.b.x).toBe(7);
    expect(getBounds(m, 500).max.x).toBeGreaterThan(7);
    const doc = comTrena(m);
    expect(validateDocument(JSON.parse(JSON.stringify(doc))).document.objects.some((o) => o.kind === 'measure')).toBe(true);
  });
});
