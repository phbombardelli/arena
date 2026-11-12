import { describe, expect, it } from 'vitest';
import { createHeightTable, createInfoBox, mostraFase2 } from '@core/library/annotations';
import { infoBoxLayout } from './annotationLayout';
import { createObstacle } from '@core/library/obstacles';
import { moveObjects } from '@core/commands/ops';
import { usableArea } from '@core/scale/units';
import { createRectangleArena } from './arena';
import { anotacaoMm, createDocument, freeAreaMm } from './document';
import type { RectMm } from './document';
import { posicionaPista, rearrumaFolha, syncArranjo } from './sheetLayout';
import { extensaoDoDesenho } from './document';
import type { CourseDocument, InfoBox } from './types';

function croqui(opts: { retrato?: boolean; arena?: [number, number] } = {}): CourseDocument {
  const doc = createDocument();
  if (opts.retrato) doc.page.orientation = 'portrait';
  const [w, h] = opts.arena ?? [80, 40];
  doc.objects.push(createRectangleArena({ x: 0, y: 0 }, w, h));
  for (let i = 1; i <= 6; i++) doc.objects.push(createObstacle('vertical', { x: 10 * i, y: 20 }, String(i)));
  doc.objects.push(createInfoBox({ x: 0, y: 0 }), createHeightTable({ x: 0, y: 0 }));
  return doc;
}

const caixas = (doc: CourseDocument): RectMm[] =>
  doc.objects.map((o) => anotacaoMm(doc, o)).filter((r): r is RectMm => r != null);

const cruza = (a: RectMm, b: RectMm) =>
  a.xMm < b.xMm + b.widthMm - 0.01 && b.xMm < a.xMm + a.widthMm - 0.01 &&
  a.yMm < b.yMm + b.heightMm - 0.01 && b.yMm < a.yMm + a.heightMm - 0.01;

function confereFolha(doc: CourseDocument) {
  const u = usableArea(doc.page);
  const rs = caixas(doc);
  for (const r of rs) {
    expect(r.xMm).toBeGreaterThanOrEqual(u.xMm - 0.1);
    expect(r.yMm).toBeGreaterThanOrEqual(u.yMm - 0.1);
    expect(r.xMm + r.widthMm).toBeLessThanOrEqual(u.xMm + u.widthMm + 0.1);
    expect(r.yMm + r.heightMm).toBeLessThanOrEqual(u.yMm + u.heightMm + 0.1);
  }
  for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) expect(cruza(rs[i]!, rs[j]!)).toBe(false);
  // E a pista, no que sobra, não fica embaixo de nenhum quadro.
  const livre = freeAreaMm(doc);
  for (const r of rs) expect(cruza(r, livre)).toBe(false);
}

describe('arrumação da folha (B-103)', () => {
  it('folha deitada, pista comprida: tudo cabe, sem nada por cima de nada', () => {
    const doc = croqui();
    rearrumaFolha(doc);
    confereFolha(doc);
  });

  it('folha em pé com pista deitada: os quadros vão para uma faixa', () => {
    const doc = croqui({ retrato: true });
    rearrumaFolha(doc);
    expect(['baixo', 'cima']).toContain(doc.page.arranjo!.ultima);
    confereFolha(doc);
  });

  it('pista quadrada na folha deitada: os quadros vão para uma coluna', () => {
    const doc = croqui({ arena: [50, 50] });
    rearrumaFolha(doc);
    expect(['direita', 'esquerda']).toContain(doc.page.arranjo!.ultima);
    confereFolha(doc);
  });

  it('o lado pedido é obedecido', () => {
    const doc = croqui();
    doc.page.arranjo = { zona: 'cima' };
    rearrumaFolha(doc);
    const u = usableArea(doc.page);
    for (const r of caixas(doc)) expect(r.yMm).toBeCloseTo(u.yMm, 1);
  });

  it('o arrastado fica onde foi posto, e os outros se arrumam em volta', () => {
    const doc = croqui({ arena: [50, 50] });
    rearrumaFolha(doc);
    const quadro = doc.objects.find((o) => o.kind === 'infobox')!;
    const tabela = doc.objects.find((o) => o.kind === 'heighttable')!;
    const antes = tabela.kind === 'heighttable' ? { ...tabela.posMm } : null;
    // Põe o quadro no meio da coluna, onde estava a tabela.
    const passo = antes && quadro.kind === 'infobox' ? (antes.y - quadro.posMm.y) * (doc.page.printScale / 1000) : 0;
    moveObjects(doc, [quadro.id], { x: 0, y: passo });
    expect(quadro.kind === 'infobox' && quadro.livre).toBe(true);
    syncArranjo(doc);
    confereFolha(doc);
  });

  it('mover a pista não a puxa de volta para o centro', () => {
    const doc = croqui();
    rearrumaFolha(doc);
    syncArranjo(doc);
    const origem = { ...doc.originMm };
    const arena = doc.objects.find((o) => o.kind === 'arena')!;
    moveObjects(doc, [arena.id], { x: 5, y: 0 });
    syncArranjo(doc);
    expect(doc.originMm).toEqual(origem);
  });

  it('virar a folha reenquadra a pista no que sobra', () => {
    const doc = croqui();
    rearrumaFolha(doc);
    doc.page.orientation = 'portrait';
    syncArranjo(doc);
    confereFolha(doc);
  });

  it('croqui antigo, sem arrumação: nada se move sozinho', () => {
    const doc = croqui();
    delete doc.page.arranjo;
    const antes = JSON.stringify(doc);
    syncArranjo(doc);
    expect(JSON.stringify(doc)).toBe(antes);
  });

  it('rearrumar devolve o arrastado ao automático', () => {
    const doc = croqui();
    rearrumaFolha(doc);
    const quadro = doc.objects.find((o) => o.kind === 'infobox')!;
    moveObjects(doc, [quadro.id], { x: 10, y: 10 });
    rearrumaFolha(doc);
    expect(quadro.kind === 'infobox' && quadro.livre).toBeFalsy();
    confereFolha(doc);
  });
});

describe('quando uma coluna não basta (B-103)', () => {
  it('quadro alto e tabela vão para duas colunas, sem passar da folha', () => {
    const doc = croqui({ arena: [100, 80] });
    const quadro = doc.objects.find((o) => o.kind === 'infobox')!;
    // Quadro da prova em duas fases: bem mais alto.
    if (quadro.kind === 'infobox') for (const f of quadro.fields) f.enabled = true;
    rearrumaFolha(doc);
    confereFolha(doc);
  });
});

describe('escala preferida (B-103)', () => {
  it('o quadro cresce, a escala cai; volta a encolher, a escala volta', () => {
    const doc = croqui({ arena: [100, 80] });
    rearrumaFolha(doc);
    syncArranjo(doc);
    const antes = doc.page.printScale;
    const quadro = doc.objects.find((o) => o.kind === 'infobox')!;
    if (quadro.kind !== 'infobox') return;
    const ligados = quadro.fields.map((f) => f.enabled);
    quadro.widthMm = 150;
    syncArranjo(doc);
    expect(doc.page.printScale).toBeGreaterThan(antes);
    quadro.widthMm = 70;
    quadro.fields.forEach((f, i) => (f.enabled = ligados[i]!));
    syncArranjo(doc);
    expect(doc.page.printScale).toBe(antes);
  });

  it('a escala que o usuário escolhe vira a preferida', () => {
    const doc = croqui();
    rearrumaFolha(doc);
    syncArranjo(doc);
    doc.page.printScale = 1000;
    syncArranjo(doc);
    expect(doc.page.arranjo!.preferida).toBe(1000);
  });
});

describe('quadro deitado na faixa (B-103, etapa 2)', () => {
  const comFases = (doc: CourseDocument) => {
    const quadro = doc.objects.find((o) => o.kind === 'infobox');
    if (quadro?.kind === 'infobox') mostraFase2(quadro, true);
    return quadro as InfoBox;
  };

  it('seções lado a lado: mais baixo e mais largo, com um fio vertical entre os blocos', () => {
    const quadro = comFases(croqui());
    const empe = infoBoxLayout(quadro);
    quadro.blocos = 'lado';
    const deitado = infoBoxLayout(quadro);
    expect(deitado.heightMm).toBeLessThan(empe.heightMm);
    expect(deitado.secoes).toHaveLength(2);
    expect(deitado.secoes.every((s) => s.linhaXMm > 0)).toBe(true);
    // Nenhum campo passa da borda.
    for (const c of deitado.cells) expect(c.xMm + c.widthMm).toBeLessThanOrEqual(deitado.widthMm + 0.01);
  });

  it('na faixa o quadro deita; na coluna, fica em pé', () => {
    const doc = croqui({ retrato: true });
    const quadro = comFases(doc);
    rearrumaFolha(doc);
    expect(['baixo', 'cima']).toContain(doc.page.arranjo!.ultima);
    expect(quadro.blocos).toBe('lado');
    confereFolha(doc);
    doc.page.arranjo!.zona = 'direita';
    syncArranjo(doc);
    expect(quadro.blocos).toBeUndefined();
    confereFolha(doc);
  });

  it('quadro posto à mão não é deitado pela folha', () => {
    const doc = croqui({ retrato: true });
    const quadro = comFases(doc);
    quadro.livre = true;
    rearrumaFolha(doc); // tira o livre…
    quadro.livre = true;
    delete quadro.blocos;
    syncArranjo(doc);
    expect(quadro.blocos).toBeUndefined();
  });
});

describe('o que fica em volta da pista também cabe (B-103)', () => {
  it('arquibancada e júri fora do contorno ficam na folha e fora dos quadros', () => {
    for (const retrato of [false, true]) {
      const doc = croqui({ retrato });
      const arquibancada = createRectangleArena({ x: 10, y: -25 }, 60, 8);
      arquibancada.structure = { type: 'arquibancada', label: 'Arquibancada' };
      const juri = createRectangleArena({ x: 90, y: 10 }, 12, 6);
      juri.structure = { type: 'edificacao', label: 'Júri' };
      doc.objects.push(arquibancada, juri);
      rearrumaFolha(doc);
      const u = usableArea(doc.page);
      const k = 1000 / doc.page.printScale;
      const livre = freeAreaMm(doc);
      for (const s of [arquibancada, juri]) {
        const r: RectMm = {
          xMm: doc.originMm.x + s.origin.x * k,
          yMm: doc.originMm.y + s.origin.y * k,
          widthMm: s.widthM * k,
          heightMm: s.heightM * k,
        };
        expect(r.xMm).toBeGreaterThanOrEqual(u.xMm);
        expect(r.yMm).toBeGreaterThanOrEqual(u.yMm);
        expect(r.xMm + r.widthMm).toBeLessThanOrEqual(u.xMm + u.widthMm);
        expect(r.yMm + r.heightMm).toBeLessThanOrEqual(u.yMm + u.heightMm);
        expect(r.xMm).toBeGreaterThanOrEqual(livre.xMm - 0.1);
        expect(r.xMm + r.widthMm).toBeLessThanOrEqual(livre.xMm + livre.widthMm + 0.1);
        expect(r.yMm).toBeGreaterThanOrEqual(livre.yMm - 0.1);
        expect(r.yMm + r.heightMm).toBeLessThanOrEqual(livre.yMm + livre.heightMm + 0.1);
      }
    }
  });
});

describe('tabela de alturas com tamanho (B-103)', () => {
  it('puxar o canto dá largura e altura à tabela', async () => {
    const { scaleInDoc } = await import('./transform');
    const { heightTableLayout } = await import('./annotationLayout');
    const doc = croqui();
    const tabela = doc.objects.find((o) => o.kind === 'heighttable')!;
    if (tabela.kind !== 'heighttable') return;
    const obst = doc.objects.filter((o) => o.kind === 'obstacle') as never[];
    const antes = heightTableLayout(tabela, obst);
    scaleInDoc(doc, tabela, { x: 0, y: 0 }, 1.5, 1.2);
    const depois = heightTableLayout(tabela, obst);
    expect(depois.widthMm).toBeCloseTo(antes.widthMm * 1.5, 0);
    expect(depois.heightMm).toBeCloseTo(antes.heightMm * 1.2, 0);
  });
});

describe('onde a pista fica (B-103)', () => {
  const caixaDoDesenho = (doc: CourseDocument): RectMm => {
    const e = extensaoDoDesenho(doc)!;
    const k = 1000 / doc.page.printScale;
    return { xMm: doc.originMm.x + e.origin.x * k, yMm: doc.originMm.y + e.origin.y * k, widthMm: e.widthM * k, heightMm: e.heightM * k };
  };

  it('a pista no canto: encosta nele, e os quadros vão para um lado oposto', () => {
    for (const retrato of [false, true]) {
      const doc = croqui({ retrato });
      rearrumaFolha(doc);
      posicionaPista(doc, 'sup-esq');
      syncArranjo(doc);
      expect(['direita', 'baixo']).toContain(doc.page.arranjo!.ultima);
      const livre = freeAreaMm(doc);
      const r = caixaDoDesenho(doc);
      expect(r.xMm - livre.xMm).toBeLessThanOrEqual(7.1);
      expect(r.yMm - livre.yMm).toBeLessThanOrEqual(7.1);
      confereFolha(doc);
    }
  });

  it('a pista embaixo: os quadros vão para cima', () => {
    const doc = croqui({ arena: [50, 50] });
    rearrumaFolha(doc);
    posicionaPista(doc, 'baixo');
    syncArranjo(doc);
    expect(doc.page.arranjo!.ultima).toBe('cima');
    const livre = freeAreaMm(doc);
    const r = caixaDoDesenho(doc);
    expect(livre.yMm + livre.heightMm - (r.yMm + r.heightMm)).toBeLessThanOrEqual(7.1);
    confereFolha(doc);
  });

  it('de volta ao centro, a pista centraliza no que sobra', () => {
    const doc = croqui();
    rearrumaFolha(doc);
    posicionaPista(doc, 'inf-dir');
    syncArranjo(doc);
    posicionaPista(doc, 'centro');
    syncArranjo(doc);
    expect(doc.page.arranjo!.pista).toBeUndefined();
    const livre = freeAreaMm(doc);
    const r = caixaDoDesenho(doc);
    expect(r.xMm - livre.xMm).toBeCloseTo(livre.xMm + livre.widthMm - (r.xMm + r.widthMm), 0);
  });
});

describe('a pista é o principal da folha (B-103)', () => {
  it('pista grande na A4 deitada: os quadros encolhem e a pista sobe de escala', () => {
    // 120 m: a 1:600 a pista deixa só ~59 mm para a coluna; o quadro tem 78.
    const doc = croqui({ arena: [120, 80] });
    delete doc.page.arranjo;
    rearrumaFolha(doc);
    expect(doc.page.printScale).toBe(600);
    const quadro = doc.objects.find((o) => o.kind === 'infobox')!;
    expect(quadro.kind === 'infobox' && quadro.reduzido).toBeGreaterThanOrEqual(0.7);
    confereFolha(doc);
  });

  it('a escala que o usuário escolhe fica, e os quadros se ajeitam a ela', () => {
    const doc = croqui({ arena: [120, 80] });
    rearrumaFolha(doc);
    const melhor = doc.page.printScale;
    doc.page.printScale = 750;
    syncArranjo(doc);
    // Com folga, os quadros voltam ao tamanho cheio.
    const quadro = doc.objects.find((o) => o.kind === 'infobox')!;
    expect(quadro.kind === 'infobox' && quadro.reduzido).toBeFalsy();
    doc.page.printScale = melhor;
    syncArranjo(doc);
    posicionaPista(doc, 'inf-dir');
    syncArranjo(doc);
    expect(doc.page.printScale).toBe(melhor);
    confereFolha(doc);
  });
});
