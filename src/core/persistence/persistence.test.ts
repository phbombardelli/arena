import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { addObject } from '@core/commands/ops';
import { createOrnament } from '@core/library/ornaments';
import { createDocument } from '@core/model/document';
import type { CourseDocument, CoursePath, Obstacle, TextLabel } from '@core/model/types';
import { SCHEMA_VERSION } from '@core/model/types';
import { CourseFileError, FILE_FORMAT } from './format';
import { applyMigrations, type Migration } from './migrations';
import { deserialize, serialize, suggestedFileName } from './serialize';
import { validateDocument } from './validate';

/** Documento com um objeto de cada tipo que já existe no modelo. */
function richDocument(): CourseDocument {
  return produce(createDocument(), (d) => {
    d.meta.title = 'Longines FEI Jumping World Cup Final';
    d.meta.designer = 'Anderson Lima';
    d.page.printScale = 250;
    d.grid.angleSnapDeg = 5;

    addObject(d, createOrnament('arvore', { x: 12.5, y: 7.25 }));
    addObject(d, createOrnament('cronometro', { x: 30, y: 22 }));

    const texto: TextLabel = {
      id: 'txt1', kind: 'text', layer: 'annotations', locked: false, visible: true, scope: 'percurso', z: 0,
      pos: { x: 5, y: 5 }, text: 'Entrada', sizeMm: 3.5, align: 'start',
      rotation: 0, color: '#111111', bold: false,
    };
    addObject(d, texto);

    const traco: CoursePath = {
      id: 'pth1', kind: 'path', layer: 'paths', locked: false, visible: true, scope: 'percurso', z: 0,
      nodes: [
        { pos: { x: 10, y: 10 }, type: 'smooth', handleIn: null, handleOut: { x: 3, y: 0 }, anchor: null },
        { pos: { x: 25.75, y: 18.4 }, type: 'corner', handleIn: { x: -2, y: -1 }, handleOut: null, anchor: null },
      ],
      legs: [{ fromNode: 0, toNode: 1, label: { visible: true, offsetM: { x: 0, y: -1 }, decimals: 2, color: '#d32020' } }],
      distanceMode: 'total',
      totalLabel: { visible: true, offsetM: { x: 0, y: -1.5 }, decimals: 2, color: '#d32020' },
      style: { dash: 'dashed', strokeMm: 0.35, color: '#6b6b6b' },
      obstacleDistances: {},
    };
    addObject(d, traco);
  });
}

describe('ida e volta', () => {
  it('reabre exatamente o que foi salvo', () => {
    const original = richDocument();
    const { document, warnings } = deserialize(serialize(original));
    expect(warnings).toEqual([]);
    expect(document).toEqual(original);
  });

  it('preserva os decimais das coordenadas sem arredondar', () => {
    const original = richDocument();
    const { document } = deserialize(serialize(original));
    const path = document.objects.find((o): o is CoursePath => o.kind === 'path')!;
    expect(path.nodes[1]!.pos).toEqual({ x: 25.75, y: 18.4 });
    expect(path.nodes[0]!.handleOut).toEqual({ x: 3, y: 0 });
  });

  it('preserva imagens embutidas', () => {
    const withAsset = produce(richDocument(), (d) => {
      d.assets.img1 = {
        mime: 'image/png',
        dataUrl: 'data:image/png;base64,AAAA',
        width: 800,
        height: 600,
        name: 'satelite.png',
      };
    });
    const { document } = deserialize(serialize(withAsset));
    expect(document.assets.img1).toEqual(withAsset.assets.img1);
  });

  it('o arquivo é JSON legível, com envelope e versão', () => {
    const text = serialize(createDocument());
    const parsed = JSON.parse(text);
    expect(parsed.format).toBe(FILE_FORMAT);
    expect(parsed.schemaVersion).toBe(SCHEMA_VERSION);
    expect(text).toContain('\n  '); // indentado
  });
});

describe('recusa de arquivos', () => {
  it('rejeita texto que não é JSON', () => {
    expect(() => deserialize('isto não é json')).toThrow(CourseFileError);
  });

  it('rejeita JSON de outro programa', () => {
    expect(() => deserialize(JSON.stringify({ foo: 1 }))).toThrow(
      /não é um projeto do Percurso/,
    );
  });

  it('rejeita arquivo de versão futura, sem tentar adivinhar', () => {
    const text = serialize(createDocument()).replace(
      `"schemaVersion": ${SCHEMA_VERSION}`,
      `"schemaVersion": ${SCHEMA_VERSION + 5}`,
    );
    expect(() => deserialize(text)).toThrow(/versão mais nova/);
  });

  it('rejeita escala de impressão inválida em vez de abrir torto', () => {
    const doc = JSON.parse(serialize(createDocument()));
    doc.document.page.printScale = 0;
    expect(() => deserialize(JSON.stringify(doc))).toThrow(/escala de impressão/);
  });

  it('rejeita coordenada não numérica', () => {
    const doc = JSON.parse(serialize(richDocument()));
    const orn = doc.document.objects.find((o: { kind: string }) => o.kind === 'ornament');
    orn.pos.x = 'meio-metro';
    expect(() => deserialize(JSON.stringify(doc))).toThrow(/posição inválida/);
  });

  it('rejeita identificadores repetidos', () => {
    const doc = JSON.parse(serialize(richDocument()));
    doc.document.objects[2].id = doc.document.objects[1].id;
    expect(() => deserialize(JSON.stringify(doc))).toThrow(/mesmo identificador/);
  });
});

describe('tolerância ao que é acessório', () => {
  it('ignora objeto de tipo desconhecido e avisa', () => {
    const doc = JSON.parse(serialize(richDocument()));
    doc.document.objects.push({ id: 'x1', kind: 'holograma', layer: 'annotations', z: 9 });
    const { document, warnings } = deserialize(JSON.stringify(doc));
    expect(document.objects.some((o) => o.id === 'x1')).toBe(false);
    expect(warnings.join(' ')).toMatch(/holograma/);
  });

  it('restaura camadas ausentes', () => {
    const doc = JSON.parse(serialize(richDocument()));
    delete doc.document.layers;
    const { document, warnings } = deserialize(JSON.stringify(doc));
    expect(document.layers.length).toBeGreaterThan(0);
    expect(warnings.join(' ')).toMatch(/Camadas/);
  });

  it('corrige camada desconhecida de um objeto', () => {
    const doc = JSON.parse(serialize(richDocument()));
    const orn = doc.document.objects.find((o: { kind: string }) => o.kind === 'ornament');
    orn.layer = 'camada-que-nao-existe';
    const { document, warnings } = deserialize(JSON.stringify(doc));
    expect(document.objects.find((o) => o.id === orn.id)!.layer).toBe('ornaments');
    expect(warnings.join(' ')).toMatch(/camada/i);
  });
});

describe('migrações', () => {
  const tabela: Record<number, Migration> = {
    1: (d) => ({ ...d, campoNovo: 'veio da migração 1→2' }),
    2: (d) => ({ ...d, outroCampo: 42 }),
  };

  it('aplica a cadeia na ordem', () => {
    const out = applyMigrations({ a: 1 }, 1, 3, tabela);
    expect(out).toEqual({ a: 1, campoNovo: 'veio da migração 1→2', outroCampo: 42 });
  });

  it('não faz nada quando já está na versão atual', () => {
    expect(applyMigrations({ a: 1 }, 3, 3, tabela)).toEqual({ a: 1 });
  });

  it('falha claramente quando falta um degrau, dizendo qual', () => {
    expect(() => applyMigrations({ a: 1 }, 1, 4, tabela)).toThrow(CourseFileError);
    try {
      applyMigrations({ a: 1 }, 1, 4, tabela);
    } catch (err) {
      expect((err as CourseFileError).detail).toMatch(/versão 3 para a 4/);
    }
  });

  it('recusa versão futura', () => {
    expect(() => applyMigrations({ a: 1 }, 9, 3, tabela)).toThrow(/versão mais nova/);
  });
});

describe('migração 1 → 2, com arquivo do formato antigo', () => {
  /** Arquivo como era gravado no esquema 1, antes das mudanças de aparência. */
  const arquivoV1 = () =>
    JSON.stringify({
      format: FILE_FORMAT,
      schemaVersion: 1,
      savedAt: '2026-01-01T00:00:00.000Z',
      appVersion: '0.1.0',
      document: {
        ...JSON.parse(JSON.stringify(createDocument())),
        objects: [
          {
            id: 'obs-liverpool',
            kind: 'obstacle',
            layer: 'obstacles',
            locked: false,
            visible: true,
            z: 0,
            type: 'liverpool',
            pos: { x: 20, y: 15 },
            rotation: 45,
            faceWidthM: 3.5,
            spreadM: 2.4,
            number: '9',
            letter: '',
            elements: [{ height: 1.4 }, { height: 1.5 }],
            arrow: { visible: true, reversed: false, lengthMm: 6 },
            heightLabel: { visible: true, offsetM: { x: 0, y: 2.2 } },
            numberLabel: { visible: true, offsetM: { x: 0, y: -2.2 } },
            note: '',
          },
        ],
      },
    });

  it('o liverpool antigo vira oxer com a lâmina de água ligada', () => {
    const { document } = deserialize(arquivoV1());
    const o = document.objects.find((x): x is Obstacle => x.kind === 'obstacle')!;
    expect(o.type).toBe('oxer');
    expect(o.liverpool.enabled).toBe(true);
    expect(o.liverpool.spreadM).toBe(2.4);
  });

  it('preserva o que o usuário já tinha: posição, rotação, número, alturas', () => {
    const { document } = deserialize(arquivoV1());
    const o = document.objects.find((x): x is Obstacle => x.kind === 'obstacle')!;
    expect(o.pos).toEqual({ x: 20, y: 15 });
    expect(o.rotation).toBe(45);
    expect(o.number).toBe('9');
    expect(o.elements.map((e) => e.height)).toEqual([1.4, 1.5]);
  });

  it('rótulo antigo não é reposicionado: fica onde o usuário via', () => {
    const { document } = deserialize(arquivoV1());
    const o = document.objects.find((x): x is Obstacle => x.kind === 'obstacle')!;
    expect(o.numberLabel.auto).toBe(false);
    expect(o.numberLabel.offsetM).toEqual({ x: 0, y: -2.2 });
  });

  it('ganha os campos novos com valores utilizáveis', () => {
    const { document } = deserialize(arquivoV1());
    const o = document.objects.find((x): x is Obstacle => x.kind === 'obstacle')!;
    expect(o.bar.style).toBe('pontas');
    expect(o.bar.color).toBeTruthy();
    expect(document.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('o arquivo migrado é gravado já na versão nova', () => {
    const { document } = deserialize(arquivoV1());
    const regravado = JSON.parse(serialize(document));
    expect(regravado.schemaVersion).toBe(SCHEMA_VERSION);
    expect(deserialize(serialize(document)).warnings).toEqual([]);
  });
});

describe('migração 2 → 3, aparência do obstáculo', () => {
  const arquivoV2 = (liverpool: Record<string, unknown>) =>
    JSON.stringify({
      format: FILE_FORMAT,
      schemaVersion: 2,
      savedAt: '2026-02-01T00:00:00.000Z',
      appVersion: '0.1.0',
      document: {
        ...JSON.parse(JSON.stringify(createDocument())),
        objects: [
          {
            id: 'obs-antigo',
            kind: 'obstacle',
            layer: 'obstacles',
            locked: false,
            visible: true,
            z: 0,
            type: 'oxer',
            pos: { x: 10, y: 10 },
            rotation: 0,
            faceWidthM: 3.5,
            spreadM: 1.5,
            number: '5',
            letter: '',
            elements: [{ height: 1.3 }, { height: 1.4 }],
            bar: { style: 'lisa', color: '#ffffff', accent: '#c62828', stripes: 6 },
            liverpool,
            arrow: { visible: true, reversed: false, lengthMm: 6 },
            heightLabel: { visible: true, auto: true, offsetM: { x: 0, y: 0 } },
            numberLabel: { visible: true, auto: true, offsetM: { x: 0, y: 0 } },
            note: '',
          },
        ],
      },
    });

  it('a sobra nos lados vira comprimento equivalente, sem mudar o desenho', () => {
    const texto = arquivoV2({
      enabled: true,
      spreadM: 2,
      offsetM: 0,
      overhangM: 0.25,
      color: '#2b7fd4',
    });
    const { document } = deserialize(texto);
    const o = document.objects.find((x): x is Obstacle => x.kind === 'obstacle')!;
    // 3,50 de frente + 0,25 de cada lado = 4,00 de lâmina.
    expect(o.liverpool.widthM).toBe(4);
    expect(o.liverpool.spreadM).toBe(2);
    expect('overhangM' in o.liverpool).toBe(false);
  });

  it('croqui antigo não ganha paraflanco sozinho', () => {
    const { document } = deserialize(
      arquivoV2({ enabled: false, spreadM: 2, offsetM: 0, overhangM: 0, color: '#2b7fd4' }),
    );
    const o = document.objects.find((x): x is Obstacle => x.kind === 'obstacle')!;
    expect(o.wings.style).toBe('pilar');
  });

  it('a cadeia 1 → 3 roda inteira, num arquivo da primeira versão', () => {
    const v1 = JSON.stringify({
      format: FILE_FORMAT,
      schemaVersion: 1,
      savedAt: '2026-01-01T00:00:00.000Z',
      appVersion: '0.1.0',
      document: {
        ...JSON.parse(JSON.stringify(createDocument())),
        objects: [
          {
            id: 'obs-v1',
            kind: 'obstacle',
            layer: 'obstacles',
            locked: false,
            visible: true,
            z: 0,
            type: 'liverpool',
            pos: { x: 5, y: 5 },
            rotation: 30,
            faceWidthM: 3.5,
            spreadM: 2,
            number: '2',
            letter: '',
            elements: [{ height: 1.2 }],
            arrow: { visible: true, reversed: false, lengthMm: 6 },
            heightLabel: { visible: true, offsetM: { x: 0, y: 2.2 } },
            numberLabel: { visible: true, offsetM: { x: 0, y: -2.2 } },
            note: '',
          },
        ],
      },
    });
    const { document, warnings } = deserialize(v1);
    const o = document.objects.find((x): x is Obstacle => x.kind === 'obstacle')!;
    expect(warnings).toEqual([]);
    expect(o.type).toBe('oxer');
    expect(o.liverpool.enabled).toBe(true);
    expect(o.wings.style).toBe('pilar');
    expect(o.rotation).toBe(30);
    expect(document.schemaVersion).toBe(SCHEMA_VERSION);
  });
});

describe('nome de arquivo sugerido', () => {
  it('tira acentos e espaços do título', () => {
    const doc = produce(createDocument(), (d) => {
      d.meta.title = 'Grande Prêmio São João — 1ª Etapa';
    });
    expect(suggestedFileName(doc)).toBe('grande-premio-sao-joao-1a-etapa');
  });

  it('cai para um nome padrão quando não há título', () => {
    expect(suggestedFileName(createDocument())).toBe('croqui');
  });
});

describe('validação direta', () => {
  it('aceita um documento recém-criado', () => {
    const { warnings } = validateDocument(JSON.parse(JSON.stringify(createDocument())));
    expect(warnings).toEqual([]);
  });
});

describe('7 -> 8: bandeirolas e distâncias escolhidas (decisão 54)', () => {
  it('croqui antigo abre sem bandeirola e sem distância entre obstáculos', () => {
    const antigo = {
      objects: [{ kind: 'path', id: 'p', nodes: [] }],
    } as Record<string, unknown>;
    const migrado = applyMigrations(antigo, 7, 8) as Record<string, unknown>;
    expect(migrado.flags).toBe(false);
    expect((migrado.objects as Record<string, unknown>[])[0]!.obstacleDistances).toEqual({});
  });
});

describe('8 -> 9: o ímã saiu (B-38)', () => {
  it('apaga os campos do ímã e mantém o passo do giro', () => {
    const antigo = {
      grid: { visible: true, stepM: 0, subdivisions: 5, snap: true, snapStepM: 0.5, angleSnapDeg: 15 },
      objects: [],
    } as Record<string, unknown>;
    const migrado = applyMigrations(antigo, 8, 9) as Record<string, unknown>;
    const grid = migrado.grid as Record<string, unknown>;
    expect(grid.snap).toBeUndefined();
    expect(grid.snapStepM).toBeUndefined();
    expect(grid.angleSnapDeg).toBe(15);
  });
});

describe('9 -> 10: as bandeirolas saíram (decisão 62)', () => {
  it('apaga o campo do arquivo', () => {
    const antigo = { flags: true, objects: [] } as Record<string, unknown>;
    const migrado = applyMigrations(antigo, 9, 10) as Record<string, unknown>;
    expect('flags' in migrado).toBe(false);
  });
});
