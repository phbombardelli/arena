import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { addObject } from '@core/commands/ops';
import { createObstacle } from '@core/library/obstacles';
import { placeTimingLine } from '@core/library/timing';
import { createDocument } from '@core/model/document';
import { createRectangleArena } from '@core/model/arena';
import { pathLength } from '@core/model/path';
import type { CourseDocument, Obstacle } from '@core/model/types';
import { buildFromChoices, prepareGuidedRide, trechosDeEscolha, withChoice } from './guidedRide';
import { corredoresDasCombinacoes, phaseStops } from './courseRide';
import { insidePolygon } from './ridePath';

const salto = (numero: string, x: number, y: number, rotacao = 0): Obstacle => {
  const o = createObstacle('vertical', { x, y }, numero);
  o.rotation = rotacao;
  return o;
};

function percurso(): CourseDocument {
  return produce(createDocument(), (d) => {
    d.objects.length = 0;
    addObject(d, createRectangleArena({ x: 0, y: 0 }, 90, 55));
    const um = salto('1', 30, 45, 0);
    const dois = salto('2', 68, 30, 90);
    const tres = salto('3', 30, 12, 180);
    addObject(d, um);
    addObject(d, dois);
    addObject(d, tres);
    addObject(d, placeTimingLine('start', um, 12));
    addObject(d, placeTimingLine('finish', tres, 12));
  });
}

describe('traçado por trechos', () => {
  it('quebra o percurso em pernadas nomeadas', () => {
    const guiado = prepareGuidedRide(percurso())!;
    expect(guiado.legs.map((l) => l.where)).toEqual([
      'partida para 1',
      '1 para 2',
      '2 para 3',
      '3 para chegada',
    ]);
  });

  it('já vem com a escolha do assistente marcada', () => {
    const guiado = prepareGuidedRide(percurso())!;
    for (const perna of guiado.legs) {
      expect(perna.chosen).toBe(0);
      expect(perna.options.length).toBeGreaterThan(0);
    }
  });

  it('as cruzadas de tempo não têm o que escolher', () => {
    const guiado = prepareGuidedRide(percurso())!;
    const primeira = guiado.legs[0]!;
    const ultima = guiado.legs[guiado.legs.length - 1]!;
    expect(primeira.options).toHaveLength(1);
    expect(primeira.options[0]!.turnDeg).toBeCloseTo(0, 6);
    expect(ultima.options).toHaveLength(1);
  });

  it('as voltas de verdade oferecem mais de um caminho', () => {
    const guiado = prepareGuidedRide(percurso())!;
    const doMeio = guiado.legs.filter((l) => !l.where.includes('partida') && !l.where.includes('chegada'));
    expect(doMeio.some((l) => l.options.length > 1)).toBe(true);
  });

  it('monta um traçado só, ligado do começo ao fim', () => {
    const path = buildFromChoices(prepareGuidedRide(percurso())!)!;
    expect(path.nodes.length).toBeGreaterThan(6);
    expect(pathLength(path)).toBeGreaterThan(100);
  });

  it('trocar a escolha muda o traçado', () => {
    const guiado = prepareGuidedRide(percurso())!;
    const perna = guiado.legs.findIndex((l) => l.options.length > 1);
    expect(perna).toBeGreaterThanOrEqual(0);

    const antes = pathLength(buildFromChoices(guiado)!);
    const depois = pathLength(buildFromChoices(withChoice(guiado, perna, 1))!);
    expect(Math.abs(depois - antes)).toBeGreaterThan(0.5);
  });

  it('e a escolha não deixa buraco entre a reta do salto e a curva', () => {
    const guiado = prepareGuidedRide(percurso())!;
    const perna = guiado.legs.findIndex((l) => l.options.length > 1);
    const path = buildFromChoices(withChoice(guiado, perna, 1))!;

    // Buraco é uma emenda que não emendou: a reta do salto termina num nó
    // sem alça de saída, a curva começa noutro sem alça de entrada, e os
    // dois não coincidem. Medir a distância entre nós não servia — uma
    // curva longa legítima tem os dois nós a mais de 60 m.
    for (let i = 1; i < path.nodes.length; i += 1) {
      const antes = path.nodes[i - 1]!;
      const atual = path.nodes[i]!;
      if (antes.handleOut === null && atual.handleIn === null) {
        expect(Math.hypot(atual.pos.x - antes.pos.x, atual.pos.y - antes.pos.y)).toBeLessThan(1e-3);
      }
    }
  });

  it('sem percurso não há o que guiar', () => {
    const vazio = produce(createDocument(), (d) => {
      d.objects.length = 0;
    });
    expect(prepareGuidedRide(vazio)).toBeNull();
  });
});

describe('trechos de escolha (decisão 109)', () => {
  it('partida e chegada ficam de fora: são sempre reta', () => {
    const guiado = prepareGuidedRide(percurso())!;
    expect(guiado.legs[0]!.fixa).toBe(true);
    expect(guiado.legs[guiado.legs.length - 1]!.fixa).toBe(true);
    expect(trechosDeEscolha(guiado)).toEqual([1, 2]);
  });
});

describe('vão da combinação', () => {
  it('cobre o espaço entre os elementos, sem os elementos', () => {
    const doc = produce(createDocument(), (d) => {
      d.objects.length = 0;
      addObject(d, createRectangleArena({ x: 0, y: 0 }, 90, 55));
      const a = salto('4', 40, 30, 90);
      a.letter = 'A';
      const b = salto('4', 48, 30, 90);
      b.letter = 'B';
      addObject(d, a);
      addObject(d, b);
    });
    const [vao] = corredoresDasCombinacoes(phaseStops(doc, 'percurso'));
    expect(vao).toBeDefined();
    expect(insidePolygon({ x: 44, y: 30 }, vao!)).toBe(true);
    expect(insidePolygon({ x: 40, y: 30 }, vao!)).toBe(false);
    expect(insidePolygon({ x: 48, y: 30 }, vao!)).toBe(false);
    expect(insidePolygon({ x: 44, y: 36 }, vao!)).toBe(false);
  });
});
