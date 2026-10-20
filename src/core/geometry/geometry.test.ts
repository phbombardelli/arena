import { describe, expect, it } from 'vitest';
import { angleOf, distance, fromAngle, normalizeAngle, rotate } from './vec';
import { snapAngle, snapValue, visibleGridStep, toMillimeterPrecision } from './snap';
import { outlinePolygon, polygonPathD, rectanglePoints } from './outline';
import { hatchSegments } from './hatch';

describe('vetores', () => {
  it('rotação de 90° é horária (Y cresce para baixo)', () => {
    const p = rotate({ x: 1, y: 0 }, 90);
    expect(p.x).toBeCloseTo(0, 12);
    expect(p.y).toBeCloseTo(1, 12);
  });

  it('rotação em torno de uma origem preserva a distância', () => {
    const origin = { x: 35.25, y: 17.4 };
    const p = { x: 40, y: 20 };
    const r = rotate(p, 127, origin);
    expect(distance(r, origin)).toBeCloseTo(distance(p, origin), 12);
  });

  it('quatro rotações de 90° voltam ao ponto de partida', () => {
    let p = { x: 3, y: -7 };
    for (let i = 0; i < 4; i += 1) p = rotate(p, 90);
    expect(p.x).toBeCloseTo(3, 10);
    expect(p.y).toBeCloseTo(-7, 10);
  });

  it('ângulo e vetor unitário são consistentes', () => {
    for (const deg of [0, 45, 127, 270, 359]) {
      expect(angleOf(fromAngle(deg))).toBeCloseTo(deg, 10);
    }
  });

  it('normaliza ângulos negativos', () => {
    expect(normalizeAngle(-30)).toBe(330);
    expect(normalizeAngle(450)).toBe(90);
  });
});

describe('snap', () => {
  it('arredonda para o passo', () => {
    expect(snapValue(17.43, 0.5)).toBe(17.5);
    expect(snapValue(17.2, 0.5)).toBe(17);
    expect(snapValue(3.7, 0)).toBe(3.7);
  });

  it('snap de ângulo', () => {
    expect(snapAngle(127, 15)).toBe(120);
    expect(snapAngle(128, 15)).toBe(135);
  });

  it('escolhe passo de grid legível conforme a densidade', () => {
    expect(visibleGridStep(0.01, 8)).toBe(0.25);
    expect(visibleGridStep(0.5, 8)).toBe(5);
    expect(visibleGridStep(3, 8)).toBe(50);
  });

  it('limpa o resíduo de ponto flutuante no milímetro', () => {
    expect(toMillimeterPrecision(0.1 + 0.2)).toBe(0.3);
  });
});

describe('contorno da pista', () => {
  const rect = rectanglePoints({ x: 0, y: 0 }, 80, 40);

  it('retângulo tem 4 vértices em sentido horário', () => {
    expect(rect).toEqual([
      { x: 0, y: 0 },
      { x: 80, y: 0 },
      { x: 80, y: 40 },
      { x: 0, y: 40 },
    ]);
  });

  it('canto quadrado gera path com linhas retas', () => {
    const d = polygonPathD(rect, 'square', 0, (p) => p);
    expect(d).toBe('M 0 0 L 80 0 L 80 40 L 0 40 Z');
  });

  it('chanfro nunca ultrapassa metade da aresta', () => {
    const d = polygonPathD(rect, 'chamfer', 999, (p) => p);
    // Com raio absurdo o corte satura em 20 m (metade da aresta curta).
    expect(d).toContain('M 0 20');
    expect(d).not.toContain('NaN');
  });

  it('canto arredondado usa curva quadrática', () => {
    const d = polygonPathD(rect, 'rounded', 4, (p) => p);
    expect(d).toContain('Q');
  });

  it('a projeção é aplicada a todos os pontos', () => {
    const d = polygonPathD(rect, 'square', 0, (p) => ({ x: p.x * 4 + 10, y: p.y * 4 + 10 }));
    expect(d).toBe('M 10 10 L 330 10 L 330 170 L 10 170 Z');
  });
});

describe('contorno com canto arredondado como polígono (B-24)', () => {
  const quadrado = rectanglePoints({ x: 0, y: 0 }, 10, 10);

  it('canto vivo devolve os próprios vértices', () => {
    expect(outlinePolygon(quadrado, 'square', 3)).toEqual(quadrado);
  });

  it('a hachura não passa pelo canto arredondado', () => {
    const contorno = outlinePolygon(quadrado, 'rounded', 3);
    // Bem no canto (0,2;0,2) o canto vivo teria hachura; o redondo, não.
    const linhas = hatchSegments(contorno, 0, 0.2);
    const noCanto = linhas.some(([a, b]) => {
      const y = a.y;
      const xMin = Math.min(a.x, b.x);
      return y < 0.3 && xMin < 0.3;
    });
    expect(noCanto).toBe(false);
    expect(linhas.length).toBeGreaterThan(10);
  });
});
