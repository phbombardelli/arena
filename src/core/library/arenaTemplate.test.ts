import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { addObject } from '@core/commands/ops';
import { createObstacle } from '@core/library/obstacles';
import { createOrnament } from '@core/library/ornaments';
import { createRectangleArena } from '@core/model/arena';
import { createDocument } from '@core/model/document';
import { createPath, createPathNode } from '@core/model/path';
import { defaultScope, objectScope } from '@core/model/transform';
import type { CourseDocument } from '@core/model/types';
import { SCHEMA_VERSION } from '@core/model/types';
import { applyTemplate, arenaScopeObjects, buildTemplate, isArenaTemplate } from './arenaTemplate';

const edit = (doc: CourseDocument, recipe: (d: CourseDocument) => void) => produce(doc, recipe);

/** Documento com cenário (pista + árvore + imagem) e percurso. */
function docCompleto(): CourseDocument {
  return edit(createDocument(), (d) => {
    d.objects = [];
    addObject(d, createRectangleArena({ x: 0, y: 0 }, 80, 40));
    addObject(d, createOrnament('arvore', { x: 10, y: 10 }));
    addObject(d, createObstacle('oxer', { x: 20, y: 20 }, '1'));
    addObject(d, createPath([createPathNode({ x: 0, y: 0 }), createPathNode({ x: 10, y: 0 })]));

    d.assets.img1 = {
      mime: 'image/png',
      dataUrl: 'data:image/png;base64,AAAA',
      width: 100,
      height: 100,
      name: 'satelite.png',
    };
    d.assets.orfao = {
      mime: 'image/png',
      dataUrl: 'data:image/png;base64,BBBB',
      width: 10,
      height: 10,
      name: 'nao-usada.png',
    };
    d.objects.push({
      id: 'img-1',
      kind: 'image',
      layer: 'background',
      locked: false,
      visible: true,
      scope: 'pista',
      z: 0,
      assetId: 'img1',
      origin: { x: 0, y: 0 },
      metersPerPixel: 0.8,
      widthPx: 100,
      heightPx: 100,
      rotation: 0,
      opacity: 0.6,
      calibration: null,
    });
  });
}

describe('escopo', () => {
  it('o cenário é o que é do local; o resto é percurso', () => {
    expect(defaultScope('arena')).toBe('pista');
    expect(defaultScope('image')).toBe('pista');
    expect(defaultScope('ornament')).toBe('pista');
    expect(defaultScope('obstacle')).toBe('percurso');
    expect(defaultScope('path')).toBe('percurso');
    expect(defaultScope('timing')).toBe('percurso');
  });

  it('objeto sem escopo gravado cai no padrão do tipo', () => {
    const semEscopo = { ...createOrnament('arvore', { x: 0, y: 0 }) };
    delete (semEscopo as Partial<typeof semEscopo>).scope;
    expect(objectScope(semEscopo as typeof semEscopo)).toBe('pista');
  });

  it('separa cenário de percurso no documento', () => {
    const doc = docCompleto();
    const cenario = arenaScopeObjects(doc);
    expect(cenario.map((o) => o.kind).sort()).toEqual(['arena', 'image', 'ornament']);
  });
});

describe('guardar a pista', () => {
  it('leva só o cenário, nunca o percurso', () => {
    const t = buildTemplate(docCompleto(), 'Haras do Sol', SCHEMA_VERSION);
    expect(t.objects.map((o) => o.kind).sort()).toEqual(['arena', 'image', 'ornament']);
    expect(t.objects.some((o) => o.kind === 'obstacle')).toBe(false);
    expect(t.objects.some((o) => o.kind === 'path')).toBe(false);
  });

  it('leva os arquivos que o cenário usa, e só esses', () => {
    const t = buildTemplate(docCompleto(), 'Haras do Sol', SCHEMA_VERSION);
    expect(Object.keys(t.assets)).toEqual(['img1']);
  });

  it('guarda um resumo utilizável para listar sem abrir', () => {
    const t = buildTemplate(docCompleto(), 'Haras do Sol', SCHEMA_VERSION);
    expect(t.summary).toEqual({ widthM: 80, heightM: 40, objectCount: 3 });
    expect(t.name).toBe('Haras do Sol');
  });

  it('nome em branco não passa', () => {
    expect(buildTemplate(docCompleto(), '   ', SCHEMA_VERSION).name).toBe('Pista sem nome');
  });

  it('é uma cópia: mexer no documento depois não altera o modelo', () => {
    const doc = docCompleto();
    const t = buildTemplate(doc, 'Haras', SCHEMA_VERSION);
    const mexido = edit(doc, (d) => {
      const arena = d.objects.find((o) => o.kind === 'arena');
      if (arena?.kind === 'arena') arena.widthM = 999;
    });
    expect(mexido.objects.find((o) => o.kind === 'arena')).toBeTruthy();
    const noModelo = t.objects.find((o) => o.kind === 'arena');
    expect(noModelo?.kind === 'arena' ? noModelo.widthM : 0).toBe(80);
  });
});

describe('aplicar a pista', () => {
  it('troca o cenário e PRESERVA o percurso', () => {
    const origem = docCompleto();
    const t = buildTemplate(origem, 'Haras', SCHEMA_VERSION);

    const destino = edit(createDocument(), (d) => {
      d.objects = [];
      addObject(d, createRectangleArena({ x: 0, y: 0 }, 20, 20));
      addObject(d, createObstacle('vertical', { x: 5, y: 5 }, '7'));
    });

    const depois = edit(destino, (d) => applyTemplate(d, t));
    const obstaculos = depois.objects.filter((o) => o.kind === 'obstacle');
    expect(obstaculos).toHaveLength(1);
    expect(obstaculos[0]!.kind === 'obstacle' ? obstaculos[0]!.number : '').toBe('7');

    const arena = depois.objects.find((o) => o.kind === 'arena');
    expect(arena?.kind === 'arena' ? arena.widthM : 0).toBe(80);
  });

  it('o cenário do modelo entra todo vinculado (decisão 61)', () => {
    const t = buildTemplate(docCompleto(), 'Haras', SCHEMA_VERSION);
    const depois = edit(createDocument(), (d) => applyTemplate(d, t));
    const cenario = arenaScopeObjects(depois);
    expect(cenario.length).toBeGreaterThan(1);
    const grupo = cenario[0]!.group;
    expect(grupo).toBeDefined();
    expect(cenario.every((o) => o.group === grupo)).toBe(true);
  });

  it('remove o cenário antigo em vez de acumular', () => {
    const t = buildTemplate(docCompleto(), 'Haras', SCHEMA_VERSION);
    const destino = edit(createDocument(), (d) => {
      d.objects = [];
      addObject(d, createRectangleArena({ x: 0, y: 0 }, 20, 20));
      addObject(d, createOrnament('arvore', { x: 1, y: 1 }));
    });
    const depois = edit(destino, (d) => applyTemplate(d, t));
    expect(depois.objects.filter((o) => o.kind === 'arena')).toHaveLength(1);
    expect(depois.objects.filter((o) => o.kind === 'ornament')).toHaveLength(1);
  });

  it('renova os ids, então aplicar duas vezes não colide', () => {
    const t = buildTemplate(docCompleto(), 'Haras', SCHEMA_VERSION);
    let doc = edit(createDocument(), (d) => {
      d.objects = [];
    });
    doc = edit(doc, (d) => applyTemplate(d, t));
    const primeiros = doc.objects.map((o) => o.id);
    doc = edit(doc, (d) => applyTemplate(d, t));
    const segundos = doc.objects.map((o) => o.id);
    expect(segundos.some((id) => primeiros.includes(id))).toBe(false);
    expect(new Set(segundos).size).toBe(segundos.length);
  });

  it('a imagem continua apontando para o arquivo certo', () => {
    const t = buildTemplate(docCompleto(), 'Haras', SCHEMA_VERSION);
    const doc = edit(createDocument(), (d) => {
      d.objects = [];
      applyTemplate(d, t);
    });
    const img = doc.objects.find((o) => o.kind === 'image');
    const assetId = img?.kind === 'image' ? img.assetId : '';
    expect(doc.assets[assetId]?.name).toBe('satelite.png');
  });

  it('tudo o que entra pelo modelo é cenário', () => {
    const t = buildTemplate(docCompleto(), 'Haras', SCHEMA_VERSION);
    const doc = edit(createDocument(), (d) => {
      d.objects = [];
      applyTemplate(d, t);
    });
    expect(doc.objects.every((o) => objectScope(o) === 'pista')).toBe(true);
  });
});

describe('arquivo de modelo', () => {
  it('reconhece o próprio formato', () => {
    expect(isArenaTemplate(buildTemplate(docCompleto(), 'X', SCHEMA_VERSION))).toBe(true);
  });

  it('recusa qualquer outra coisa', () => {
    expect(isArenaTemplate(null)).toBe(false);
    expect(isArenaTemplate({ format: 'outro-programa' })).toBe(false);
    expect(isArenaTemplate({ format: 'percurso-pista' })).toBe(false);
  });
});

describe('pista congelada no percurso (B-77)', () => {
  it('aplicar a pista guarda de onde ela veio, e a cópia não muda se o modelo mudar', () => {
    const origem = produce(createDocument(), (d) => {
      d.objects.length = 0;
      addObject(d, createRectangleArena({ x: 0, y: 0 }, 60, 40));
    });
    const modelo = buildTemplate(origem, 'AMAN - Pista Cel Jacques', 11);
    const percurso = produce(createDocument(), (d) => applyTemplate(d, modelo));
    expect(percurso.arenaSource?.name).toBe('AMAN - Pista Cel Jacques');
    // Mexer no modelo depois não alcança o percurso: a pista foi copiada.
    (modelo.objects[0] as { widthM: number }).widthM = 99;
    const pista = percurso.objects.find((o) => o.kind === 'arena') as { widthM: number };
    expect(pista.widthM).toBe(60);
  });
});
