import { describe, expect, it } from 'vitest';
import { createHeightTable, createInfoBox, mostraFase2 } from '@core/library/annotations';
import { infoBoxLayout } from './annotationLayout';
import { createObstacle } from '@core/library/obstacles';
import { moveObjects } from '@core/commands/ops';
import { usableArea } from '@core/scale/units';
import { createRectangleArena } from './arena';
import { anotacaoMm, createDocument, freeAreaMm } from './document';
import type { RectMm } from './document';
import { rearrumaFolha, syncArranjo } from './sheetLayout';
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
