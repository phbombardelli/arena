import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { addObject } from '@core/commands/ops';
import { createObstacle } from '@core/library/obstacles';
import { createDocument } from '@core/model/document';
import { createRectangleArena } from '@core/model/arena';
import type { CourseDocument, InfoBox, TituloDaFolha } from '@core/model/types';
import { createInfoBox } from './annotations';
import { docDaFolha, folhaAtiva, syncFolhas, trocaFolha } from './folhas';
import { folhaRectMm, folhaEm, indiceDaFolhaAtiva } from './paginas';
import { anotacaoMm, freeAreaMm } from '@core/model/document';
import { scaleObject } from '@core/model/transform';
import { tituloLayout } from '@core/model/annotationLayout';

function prova(): CourseDocument {
  return produce(createDocument(), (d) => {
    d.objects.length = 0;
    addObject(d, createRectangleArena({ x: 0, y: 0 }, 80, 50));
    const a = createObstacle('vertical', { x: 20, y: 20 }, '1');
    const b = createObstacle('vertical', { x: 50, y: 20 }, '2');
    addObject(d, a);
    addObject(d, b);
    // Posto à mão: a arrumação automática não o move.
    addObject(d, { ...createInfoBox({ x: 200, y: 20 }), livre: true });
    d.desempate = { ordem: [b.id, a.id], folha: 'duas' };
  });
}

const quadro = (d: CourseDocument) => d.objects.find((o): o is InfoBox => o.kind === 'infobox')!;

describe('desempate em folha própria (B-107)', () => {
  it('cada folha guarda a sua diagramação; trocar devolve a outra', () => {
    let doc = prova();
    const origem = { ...doc.originMm };
    doc = produce(doc, (d) => trocaFolha(d, 'desempate'));
    expect(folhaAtiva(doc)).toBe('desempate');
    // Mexe só na folha do desempate.
    doc = produce(doc, (d) => {
      quadro(d).posMm = { x: 15, y: 150 };
      d.originMm = { x: 40, y: 30 };
    });
    doc = produce(doc, (d) => trocaFolha(d, 'percurso'));
    expect(folhaAtiva(doc)).toBe('percurso');
    expect(quadro(doc).posMm).toEqual({ x: 200, y: 20 });
    expect(doc.originMm).toEqual(origem);
    // E a do desempate continua lá.
    doc = produce(doc, (d) => trocaFolha(d, 'desempate'));
    expect(quadro(doc).posMm).toEqual({ x: 15, y: 150 });
    expect(doc.originMm).toEqual({ x: 40, y: 30 });
  });

  it('o conteúdo é um só: o que se escreve numa folha vale nas duas', () => {
    let doc = produce(prova(), (d) => trocaFolha(d, 'desempate'));
    doc = produce(doc, (d) => {
      quadro(d).fields[0]!.value = 'Grande Prêmio';
    });
    doc = produce(doc, (d) => trocaFolha(d, 'percurso'));
    expect(quadro(doc).fields[0]!.value).toBe('Grande Prêmio');
  });

  it('para imprimir, cada vista sai com a sua folha, sem mexer no documento', () => {
    let doc = produce(prova(), (d) => trocaFolha(d, 'desempate'));
    doc = produce(doc, (d) => {
      quadro(d).posMm = { x: 15, y: 150 };
    });
    expect(quadro(docDaFolha(doc, 'percurso')).posMm).toEqual({ x: 200, y: 20 });
    expect(quadro(docDaFolha(doc, 'desempate')).posMm).toEqual({ x: 15, y: 150 });
    expect(docDaFolha(doc, 'desempate')).toBe(doc);
  });

  it('a escala segue a do percurso até o usuário mudar a do desempate', () => {
    let doc = produce(prova(), (d) => trocaFolha(d, 'desempate'));
    doc = produce(doc, (d) => trocaFolha(d, 'percurso'));
    doc = produce(doc, (d) => {
      d.page.printScale = 800;
    });
    doc = produce(doc, (d) => trocaFolha(d, 'desempate'));
    expect(doc.page.printScale).toBe(800);
    doc = produce(doc, (d) => {
      d.page.printScale = 1000;
    });
    doc = produce(doc, (d) => trocaFolha(d, 'percurso'));
    expect(doc.page.printScale).toBe(800);
    doc = produce(doc, (d) => trocaFolha(d, 'desempate'));
    expect(doc.page.printScale).toBe(1000);
  });

  it('sem folha própria, volta à do percurso', () => {
    let doc = produce(prova(), (d) => trocaFolha(d, 'desempate'));
    doc = produce(doc, (d) => {
      quadro(d).posMm = { x: 15, y: 150 };
    });
    doc = produce(doc, (d) => {
      d.desempate!.folha = 'uma';
      syncFolhas(d);
    });
    expect(folhaAtiva(doc)).toBe('percurso');
    expect(doc.desempate?.folhaAtiva).toBeUndefined();
    expect(quadro(doc).posMm).toEqual({ x: 200, y: 20 });
  });

  it('na tela, a folha que se edita fica no lugar e as outras em volta', () => {
    const doc = produce(prova(), (d) => trocaFolha(d, 'desempate'));
    expect(indiceDaFolhaAtiva(doc)).toBe(1);
    expect(folhaRectMm(doc, 1).y).toBe(0);
    expect(folhaRectMm(doc, 0).y).toBeLessThan(0);
    expect(folhaEm(doc, 10)).toBe(1);
    expect(folhaEm(doc, folhaRectMm(doc, 0).y + 10)).toBe(0);
  });
});

describe('caixa de texto da folha (B-106)', () => {
  const caixa = (folha?: 'percurso' | 'desempate'): TituloDaFolha => ({
    id: `tit-${folha ?? 'duas'}`,
    kind: 'titulo' as const,
    layer: 'annotations',
    locked: false,
    visible: true,
    scope: 'percurso',
    z: 0,
    posMm: { x: 60, y: 10 },
    widthMm: 150,
    text: 'Grande Prêmio',
    sizeMm: 6,
    fonte: 'padrao' as const,
    bold: true,
    italic: false,
    align: 'middle' as const,
    color: '#111111',
    ...(folha ? { folha } : {}),
  });

  it('a caixa flutua por cima: não tira espaço da pista', () => {
    const antes = freeAreaMm(prova());
    const doc = produce(prova(), (d) => {
      addObject(d, caixa());
    });
    expect(freeAreaMm(doc)).toEqual(antes);
  });

  it('o canto muda largura e altura livremente, e a letra fica', () => {
    const doc = produce(prova(), (d) => {
      addObject(d, caixa());
    });
    const c = doc.objects.find((o) => o.kind === 'titulo') as TituloDaFolha;
    const depois = produce(c, (t) => {
      scaleObject(t, { x: 0, y: 0 }, 1, 3, doc.page.printScale);
    });
    expect(depois.widthMm).toBe(c.widthMm);
    expect(depois.sizeMm).toBe(c.sizeMm);
    expect(tituloLayout(depois).heightMm).toBeCloseTo(tituloLayout(c).heightMm * 3);
    // Nunca menor que o texto.
    const baixa = produce(c, (t) => {
      t.heightMm = 1;
    });
    expect(tituloLayout(baixa).heightMm).toBeCloseTo(tituloLayout(c).textoMm);
  });

  it('com o desempate em folha própria, a caixa sai só na folha dela', () => {
    let doc = produce(prova(), (d) => {
      addObject(d, caixa('desempate'));
    });
    expect(anotacaoMm(doc, doc.objects.find((o) => o.kind === 'titulo')!)).toBeNull();
    doc = produce(doc, (d) => trocaFolha(d, 'desempate'));
    expect(anotacaoMm(doc, doc.objects.find((o) => o.kind === 'titulo')!)).not.toBeNull();
  });
});
