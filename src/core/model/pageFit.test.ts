import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { addObject } from '@core/commands/ops';
import { createHeightTable, createInfoBox } from '@core/library/annotations';
import { createObstacle } from '@core/library/obstacles';
import { usableArea } from '@core/scale/units';
import type { CourseDocument } from './types';
import { createDocument, centerOnPage, firstArena, fitScaleToPage, freeAreaMm } from './document';
import { createPolygonArena } from './arena';

const comQuadroNoTopo = (doc: CourseDocument): CourseDocument =>
  produce(doc, (d) => {
    const area = usableArea(d.page);
    addObject(d, createInfoBox({ x: area.xMm, y: area.yMm }));
  });

describe('área livre da folha', () => {
  it('sem anotação nenhuma, é a área útil inteira', () => {
    const doc = createDocument({ arena: true });
    const util = usableArea(doc.page);
    const livre = freeAreaMm(doc);
    expect(livre.widthMm).toBeCloseTo(util.widthMm, 9);
    expect(livre.heightMm).toBeCloseTo(util.heightMm, 9);
  });

  it('encolhe pelo lado onde a anotação entra', () => {
    const doc = createDocument({ arena: true });
    const util = usableArea(doc.page);
    // Quadro estreito e alto, colado na margem esquerda: come largura.
    const comQuadro = produce(doc, (d) => {
      const box = createInfoBox({ x: util.xMm, y: util.yMm + 40 });
      box.widthMm = 60;
      addObject(d, box);
    });
    const livre = freeAreaMm(comQuadro);
    expect(livre.widthMm).toBeLessThan(util.widthMm);
    expect(livre.xMm).toBeGreaterThan(util.xMm);
  });

  it('anotação no meio da folha não encolhe nada', () => {
    const doc = createDocument({ arena: true });
    const util = usableArea(doc.page);
    const central = produce(doc, (d) => {
      addObject(
        d,
        createInfoBox({ x: util.xMm + util.widthMm / 2, y: util.yMm + util.heightMm / 2 }),
      );
    });
    // Quem põe o quadro no meio quis que ficasse ali, sobre o desenho.
    expect(freeAreaMm(central).widthMm).toBeCloseTo(freeAreaMm(doc).widthMm, 9);
    expect(freeAreaMm(central).heightMm).toBeCloseTo(freeAreaMm(doc).heightMm, 9);
  });

  it('a tabela cresce com os obstáculos e come mais folha', () => {
    const base = produce(createDocument({ arena: true }), (d) => {
      const area = usableArea(d.page);
      addObject(d, createHeightTable({ x: area.xMm, y: area.yMm }));
    });
    const comSaltos = produce(base, (d) => {
      for (let i = 1; i <= 12; i += 1) {
        addObject(d, createObstacle('vertical', { x: i, y: 0 }, String(i)));
      }
    });

    // O que encolhe é a ÁREA, e não necessariamente a altura: a tabela
    // vazia é baixa e larga, e desconta como cabeçalho; cheia de linhas
    // ela vira alta e estreita, e passa a descontar como lateral.
    const area = (r: { widthMm: number; heightMm: number }) => r.widthMm * r.heightMm;
    expect(area(freeAreaMm(comSaltos))).toBeLessThan(area(freeAreaMm(base)));
  });
});

describe('ajustar ao papel', () => {
  it('com quadro na folha, a escala fica igual ou mais afastada', () => {
    const doc = createDocument({ arena: true });
    const escalaLimpa = fitScaleToPage(doc);
    const escalaComQuadro = fitScaleToPage(comQuadroNoTopo(doc));
    // Escala maior é desenho menor: 1:300 desenha menor que 1:250.
    expect(escalaComQuadro).toBeGreaterThanOrEqual(escalaLimpa);
  });

  it('a pista continua dentro da área livre depois de centralizar', () => {
    const doc = produce(comQuadroNoTopo(createDocument({ arena: true })), (d) => {
      d.page.printScale = fitScaleToPage(d);
      centerOnPage(d);
    });

    const arena = firstArena(doc)!;
    const k = 1000 / doc.page.printScale;
    const livre = freeAreaMm(doc);
    const x = doc.originMm.x + arena.origin.x * k;
    const y = doc.originMm.y + arena.origin.y * k;

    expect(x).toBeGreaterThanOrEqual(livre.xMm - 0.001);
    expect(y).toBeGreaterThanOrEqual(livre.yMm - 0.001);
    expect(x + arena.widthM * k).toBeLessThanOrEqual(livre.xMm + livre.widthMm + 0.001);
    expect(y + arena.heightM * k).toBeLessThanOrEqual(livre.yMm + livre.heightMm + 0.001);
  });

  it('margem maior deixa menos folha para o desenho', () => {
    const apertado = produce(createDocument({ arena: true }), (d) => {
      d.page.marginsMm = { top: 40, right: 40, bottom: 40, left: 40 };
    });
    expect(freeAreaMm(apertado).widthMm).toBeLessThan(freeAreaMm(createDocument({ arena: true })).widthMm);
    expect(fitScaleToPage(apertado)).toBeGreaterThanOrEqual(fitScaleToPage(createDocument({ arena: true })));
  });
});

describe('contorno livre (decisão 64)', () => {
  it('a escala e o centro saem da envoltória dos vértices', () => {
    const doc = produce(createDocument(), (d) => {
      addObject(
        d,
        createPolygonArena([
          { x: 0, y: 0 },
          { x: 150, y: 0 },
          { x: 150, y: 100 },
          { x: 0, y: 100 },
        ]),
      );
    });
    // 150 × 100 m em A4 paisagem pede 1:600; um contorno lido como 0×0
    // daria a menor escala da lista.
    expect(fitScaleToPage(doc)).toBe(600);
  });
});
