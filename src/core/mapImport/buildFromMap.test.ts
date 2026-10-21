import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { createDocument } from '@core/model/document';
import { arenaPoints } from '@core/model/arena';
import type { CourseDocument } from '@core/model/types';
import { buildFromMap, type MapResult } from './buildFromMap';

const resultado = (): MapResult => ({
  image: {
    widthPx: 400,
    heightPx: 300,
    asset: { mime: 'image/png', dataUrl: 'data:image/png;base64,', width: 400, height: 300, name: 'mapa' },
  },
  // 100 px = 10 m → 0,1 m por pixel
  measure: { a: { x: 100, y: 200 }, b: { x: 200, y: 200 }, meters: 10 },
  arena: [
    { x: 50, y: 40 },
    { x: 350, y: 40 },
    { x: 350, y: 240 },
    { x: 50, y: 240 },
  ],
  structures: [{ type: 'ilha', outline: [{ x: 150, y: 100 }, { x: 190, y: 100 }, { x: 190, y: 130 }] }],
  trees: [{ x: 30, y: 60 }],
});

describe('montar a pista pelo mapa (decisão 64)', () => {
  it('aplica a escala da medida e põe o canto da pista na origem', () => {
    let doc: CourseDocument = createDocument();
    doc = produce(doc, (d) => {
      buildFromMap(d, resultado());
    });
    const pista = doc.objects.find((o) => o.kind === 'arena' && !o.structure)!;
    const pts = pista.kind === 'arena' ? arenaPoints(pista) : [];
    expect(pts[0]).toEqual({ x: 0, y: 0 });
    expect(pts[2]).toEqual({ x: 30, y: 20 }); // 300 × 200 px a 0,1 m/px
    const img = doc.objects.find((o) => o.kind === 'image')!;
    expect(img.kind === 'image' && img.metersPerPixel).toBeCloseTo(0.1, 9);
    expect(img.kind === 'image' && img.origin).toEqual({ x: -5, y: -4 });
    const arvore = doc.objects.find((o) => o.kind === 'ornament')!;
    expect(arvore.kind === 'ornament' && arvore.pos).toEqual({ x: -2, y: 2 });
  });

  it('tudo entra vinculado e o cenário anterior sai', () => {
    let doc: CourseDocument = createDocument({ arena: true });
    doc = produce(doc, (d) => {
      buildFromMap(d, resultado());
    });
    const cenario = doc.objects.filter((o) => o.scope === 'pista');
    expect(cenario).toHaveLength(4); // imagem, pista, ilha, árvore
    expect(new Set(cenario.map((o) => o.group)).size).toBe(1);
    expect(cenario[0]!.group).toBeDefined();
  });
});
