import { describe, expect, it } from 'vitest';
import {
  findIslands,
  findMeasureMarkers,
  findRoofs,
  fitRectangle,
  parseDistance,
  segmentArena,
  type Pixels,
} from './mapImport';

/** Print sintético: grama, uma pista de areia, uma ilha, um telhado e a medida. */
function printSintetico(): Pixels {
  const w = 400;
  const h = 300;
  const data = new Uint8ClampedArray(w * h * 4);
  const pinta = (x0: number, y0: number, x1: number, y1: number, [r, g, b]: number[]) => {
    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        const i = (y * w + x) * 4;
        data[i] = r!;
        data[i + 1] = g!;
        data[i + 2] = b!;
        data[i + 3] = 255;
      }
    }
  };
  const circulo = (cx: number, cy: number, r: number, cor: number[]) => {
    for (let y = cy - r; y <= cy + r; y += 1) {
      for (let x = cx - r; x <= cx + r; x += 1) {
        if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) pinta(x, y, x + 1, y + 1, cor);
      }
    }
  };
  pinta(0, 0, w, h, [90, 130, 70]); // grama
  pinta(40, 30, 320, 230, [193, 180, 157]); // pista
  // Areia do lado de fora da cerca da esquerda, ligada só por frestas.
  pinta(5, 30, 34, 230, [193, 180, 157]);
  for (let y = 30; y < 230; y += 1) if (y % 20 !== 0) pinta(34, y, 40, y + 1, [120, 120, 120]);
  pinta(150, 90, 190, 130, [110, 150, 80]); // ilha de grama
  pinta(150, 240, 230, 280, [190, 90, 60]); // telhado laranja
  // Medida do Maps: dois discos brancos com contorno escuro e a linha.
  circulo(100, 180, 8, [40, 40, 40]);
  circulo(100, 180, 6, [255, 255, 255]);
  circulo(220, 180, 8, [40, 40, 40]);
  circulo(220, 180, 6, [255, 255, 255]);
  pinta(109, 179, 212, 181, [250, 250, 250]);
  return { data, width: w, height: h };
}

describe('pista pelo print do Maps (B-40)', () => {
  const img = printSintetico();

  it('acha os dois marcadores da medida', () => {
    const m = findMeasureMarkers(img)!;
    expect(m).not.toBeNull();
    expect(m.a.x).toBeCloseTo(100, 0);
    expect(m.b.x).toBeCloseTo(220, 0);
    expect(m.a.y).toBeCloseTo(180, 0);
  });

  it('lê a distância escrita pelo Maps', () => {
    expect(parseDistance('27,03 m')).toBeCloseTo(27.03, 6);
    expect(parseDistance(' 1,2 km\n')).toBeCloseTo(1200, 6);
    expect(parseDistance('0')).toBeNull();
    expect(parseDistance('120 m')).toBe(120);
    // OCR que perde a vírgula pequena do Maps.
    expect(parseDistance('27 03 m\n')).toBeCloseTo(27.03, 6);
    expect(parseDistance('1 25 km')).toBeCloseTo(1250, 6);
  });

  it('a areia não vaza pelas frestas da cerca', () => {
    const g = segmentArena(img, { x: 160, y: 200 })!;
    const xs = g.outline.map((p) => p.x);
    const ys = g.outline.map((p) => p.y);
    expect(Math.min(...xs)).toBeGreaterThan(30);
    expect(Math.min(...xs)).toBeLessThan(46);
    expect(Math.max(...xs)).toBeGreaterThan(312);
    expect(Math.min(...ys)).toBeLessThan(36);
    expect(Math.max(...ys)).toBeGreaterThan(222);
  });

  it('ajustar a retângulo devolve quatro cantos', () => {
    const g = segmentArena(img, { x: 160, y: 200 })!;
    expect(fitRectangle(g.outline)).toHaveLength(4);
  });

  it('sugere a ilha e o telhado', () => {
    const g = segmentArena(img, { x: 160, y: 200 })!;
    const m = findMeasureMarkers(img)!;
    const ilhas = findIslands(g, img, [m.a, m.b]);
    expect(ilhas).toHaveLength(1);
    const ix = ilhas[0]!.outline.map((p) => p.x);
    expect(Math.min(...ix)).toBeGreaterThanOrEqual(148);
    expect(Math.max(...ix)).toBeLessThanOrEqual(191);
    const telhados = findRoofs(img, g.outline);
    expect(telhados).toHaveLength(1);
    expect(telhados[0]!.outline).toHaveLength(4);
  });
});
