import { describe, expect, it } from 'vitest';
import { createObstacle } from './obstacles';
import {
  aplicaDisposicao,
  disposicaoAtual,
  espelhaMontagem,
  impedimento,
  itensEmOrdem,
  materialDe,
  montagemPadrao,
  topoMontagem,
} from './montagem';
import type { Montagem } from '@core/model/types';
import { createDocument } from '@core/model/document';
import { setElementHeight, setMontagem, setObstacleType } from '@core/commands/obstacleOps';

const varas = (...hs: number[]): Montagem => ({ pecas: hs.map((h) => ({ tipo: 'vara', esq: h, dir: h })) });
const pontas = (m: Montagem) => m.pecas.map((p) => [p.esq, p.dir]);

describe('montagem (B-108)', () => {
  it('padrão: varas paralelas até a altura do 1º elemento', () => {
    const o = createObstacle('vertical', { x: 0, y: 0 });
    o.elements[0]!.height = 1.3;
    const m = montagemPadrao(o);
    expect(m.pecas.every((p) => p.tipo === 'vara' && p.esq === p.dir)).toBe(true);
    expect(topoMontagem(m)).toBe(130);
    expect(m.pecas.length).toBe(4);
  });

  it('muro: uma peça na altura do obstáculo', () => {
    const o = createObstacle('muro', { x: 0, y: 0 });
    o.elements[0]!.height = 1.2;
    expect(montagemPadrao(o).pecas).toEqual([{ tipo: 'muro', esq: 120, dir: 120 }]);
  });

  it('leque dir.: à direita abre por igual, à esquerda junta a 10 cm', () => {
    const m = aplicaDisposicao(varas(10, 60, 110), 'leque-dir');
    expect(pontas(m)).toEqual([[90, 10], [100, 60], [110, 110]]);
    expect(disposicaoAtual(m)).toBe('leque-dir');
  });

  it('leque esq.: espelho do dir.', () => {
    const m = aplicaDisposicao(varas(10, 60, 110), 'leque-esq');
    expect(pontas(m)).toEqual([[10, 90], [60, 100], [110, 110]]);
  });

  it('leque precisa de 3 varas ou mais', () => {
    expect(impedimento(varas(50, 100), 'leque-dir')).toBe('leque');
    expect(impedimento(varas(30, 60, 90, 120), 'leque-dir')).toBeNull();
  });

  it('Z: retas em cima e embaixo, a do meio a 10 cm delas', () => {
    expect(pontas(aplicaDisposicao(varas(15, 70, 125), 'z'))).toEqual([[15, 15], [25, 115], [125, 125]]);
    expect(pontas(aplicaDisposicao(varas(15, 70, 125), 'z-inv'))).toEqual([[15, 15], [115, 25], [125, 125]]);
  });

  it('Z só com exatamente 3 varas', () => {
    expect(impedimento(varas(30, 60, 90, 120), 'z')).toBe('z');
    expect(aplicaDisposicao(varas(30, 60, 90, 120), 'z')).toEqual(varas(30, 60, 90, 120));
  });

  it('espaçar igual segue a altura das varas, não a ordem da lista', () => {
    // A vara mais baixa foi montada por último: a lista não está em ordem.
    const m: Montagem = { pecas: [
      { tipo: 'testeira', esq: 20, dir: 20 },
      { tipo: 'vara', esq: 120, dir: 120 },
      { tipo: 'vara', esq: 100, dir: 100 },
      { tipo: 'vara', esq: 30, dir: 30 },
    ] };
    const r = aplicaDisposicao(m, 'espacar');
    expect(pontas(r)).toEqual([[20, 20], [120, 120], [85, 85], [55, 55]]);
  });

  it('espaçar igual mantém a inclinação de cada vara', () => {
    const m: Montagem = { pecas: [
      { tipo: 'vara', esq: 10, dir: 50 },
      { tipo: 'vara', esq: 100, dir: 100 },
      { tipo: 'vara', esq: 120, dir: 120 },
    ] };
    const [a] = aplicaDisposicao(m, 'espacar').pecas;
    expect(a!.dir - a!.esq).toBe(40);
  });

  it('espelhar troca as pontas (sentido contrário no desempate)', () => {
    expect(pontas(espelhaMontagem(aplicaDisposicao(varas(10, 60, 110), 'leque-dir')))).toEqual([[10, 90], [60, 100], [110, 110]]);
  });

  it('material: a pilha, uma vara por plano de trás e o liverpool, em ordem fixa', () => {
    const o = createObstacle('oxer', { x: 0, y: 0 });
    o.montagem = { pecas: [{ tipo: 'portao', esq: 70, dir: 70 }, { tipo: 'vara', esq: 120, dir: 120 }] };
    o.liverpool.enabled = true;
    expect(itensEmOrdem(materialDe(o))).toEqual([['vara', 2], ['portao', 1], ['liverpool', 1]]);
  });

  it('a altura do 1º elemento acompanha a pilha, e a pilha acompanha a altura', () => {
    const doc = createDocument();
    const o = createObstacle('vertical', { x: 0, y: 0 });
    doc.objects.push(o);
    setMontagem(doc, o.id, varas(40, 80, 120));
    expect(o.elements[0]!.height).toBe(1.2);
    setElementHeight(doc, o.id, 0, 1.35);
    expect(pontas(o.montagem!)).toEqual([[40, 40], [80, 80], [135, 135]]);
  });

  it('trocar vertical por muro volta ao padrão; por oxer, mantém', () => {
    const doc = createDocument();
    const o = createObstacle('vertical', { x: 0, y: 0 });
    doc.objects.push(o);
    setMontagem(doc, o.id, varas(40, 80, 120));
    setObstacleType(doc, o.id, 'oxer');
    expect(o.montagem).toBeDefined();
    setObstacleType(doc, o.id, 'muro');
    expect(o.montagem).toBeUndefined();
  });
});

describe('peça nova (B-108)', () => {
  it('não muda a altura do obstáculo', async () => {
    const { comPecaNova } = await import('./montagem');
    const base = varas(35, 65, 100, 130).pecas;
    for (const tipo of ['vara', 'testeira', 'painel', 'portao', 'muro'] as const) {
      expect(topoMontagem({ pecas: comPecaNova(base, tipo).pecas })).toBe(130);
    }
  });

  it('a sólida entra no chão, primeira da montagem', async () => {
    const { comPecaNova } = await import('./montagem');
    const r = comPecaNova(varas(65, 100, 130).pecas, 'testeira');
    expect(r.indice).toBe(0);
    expect(r.pecas[0]).toEqual({ tipo: 'testeira', esq: 20, dir: 20 });
  });

  it('a vara entra no meio do maior vão', async () => {
    const { comPecaNova } = await import('./montagem');
    const r = comPecaNova(varas(40, 60, 130).pecas, 'vara');
    expect(r.indice).toBe(2);
    expect(r.pecas[2]).toEqual({ tipo: 'vara', esq: 95, dir: 95 });
  });
});

describe('peça nova não nasce atrás de outra (B-108)', () => {
  it('vara no muro: o muro baixa e a vara fica no topo', async () => {
    const { comPecaNova } = await import('./montagem');
    const r = comPecaNova([{ tipo: 'muro', esq: 120, dir: 120 }], 'vara');
    expect(r.pecas).toEqual([{ tipo: 'muro', esq: 110, dir: 110 }, { tipo: 'vara', esq: 120, dir: 120 }]);
  });

  it('vara acima do painel, fora dele', async () => {
    const { comPecaNova } = await import('./montagem');
    const r = comPecaNova([{ tipo: 'painel', esq: 50, dir: 50 }, { tipo: 'vara', esq: 130, dir: 130 }], 'vara');
    const v = r.pecas[r.indice]!;
    expect(v.esq).toBeGreaterThanOrEqual(55);
    expect(v.esq).toBeLessThanOrEqual(125);
  });

  it('painel sem vão: as varas tapadas sobem', async () => {
    const { comPecaNova } = await import('./montagem');
    const r = comPecaNova(varas(30, 60, 90, 120).pecas, 'painel');
    const painel = r.pecas[r.indice]!;
    expect(painel.esq).toBe(50);
    for (const p of r.pecas.filter((x) => x.tipo === 'vara')) expect(p.esq).toBeGreaterThan(50);
    expect(topoMontagem({ pecas: r.pecas })).toBe(120);
  });

  it('testeira no muro sem vão: vai em cima do muro', async () => {
    const { comPecaNova } = await import('./montagem');
    const r = comPecaNova([{ tipo: 'muro', esq: 120, dir: 120 }], 'testeira');
    expect(r.pecas).toEqual([{ tipo: 'muro', esq: 100, dir: 100 }, { tipo: 'testeira', esq: 120, dir: 120 }]);
  });
});
