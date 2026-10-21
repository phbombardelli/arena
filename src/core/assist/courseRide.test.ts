import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { addObject } from '@core/commands/ops';
import { createObstacle } from '@core/library/obstacles';
import { createPolygonStructure } from '@core/library/structures';
import { placeTimingLine } from '@core/library/timing';
import { createDocument } from '@core/model/document';
import { createRectangleArena } from '@core/model/arena';
import { flattenPath, pathLength } from '@core/model/path';
import { distance } from '@core/geometry/vec';
import type { Arena, CourseDocument, Obstacle } from '@core/model/types';
import { DEFAULT_RIDE, entryPose, exitPose, fieldFrom } from './ridePath';
import { findInterferences, jumpCrossing } from './interference';
import { buildCourseRide, courseOrder, straightBudget } from './courseRide';

function obstaculo(numero: string, letra: '' | 'A' | 'B' | 'C', x: number, y: number, rot = 0): Obstacle {
  const o = createObstacle('vertical', { x, y }, numero);
  o.letter = letra;
  o.rotation = rot;
  return o;
}

/** Percurso pequeno mas honesto: pista, partida, quatro saltos, chegada. */
function percurso(): CourseDocument {
  const pecas = [
    createRectangleArena({ x: 0, y: 0 }, 80, 50),
    obstaculo('1', '', 25, 40),
    obstaculo('2', '', 60, 30, 90),
    obstaculo('3', '', 45, 12, 180),
    obstaculo('4', '', 20, 22, 270),
  ];
  // Cruzadas colocadas em relação ao primeiro e ao último salto, como o
  // programa as coloca: no eixo do salto, paralelas à face.
  const partida = placeTimingLine('start', pecas[1] as Obstacle, 12);
  const chegada = placeTimingLine('finish', pecas[4] as Obstacle, 12);
  return produce(createDocument(), (d) => {
    // O documento novo já vem com uma pista padrão: sem limpar, ficariam
    // duas, e as checagens de contorno mediriam contra a errada.
    d.objects.length = 0;
    for (const p of [...pecas, partida, chegada]) addObject(d, p);
  });
}

describe('ordem do percurso', () => {
  it('segue a numeração lançada, não a ordem de inserção', () => {
    const stops = courseOrder([
      obstaculo('3', '', 0, 0),
      obstaculo('1', '', 0, 0),
      obstaculo('2', '', 0, 0),
    ]);
    expect(stops.map((s) => s.label)).toEqual(['1', '2', '3']);
  });

  it('agrupa a combinação num degrau só, na ordem das letras', () => {
    const stops = courseOrder([
      obstaculo('8', 'B', 0, 0),
      obstaculo('7', '', 0, 0),
      obstaculo('8', 'A', 0, 0),
      obstaculo('8', 'C', 0, 0),
    ]);
    expect(stops.map((s) => s.label)).toEqual(['7', '8ABC']);
    expect(stops[1]!.elements.map((e) => e.letter)).toEqual(['A', 'B', 'C']);
  });

  it('ignora obstáculo sem número em vez de chutar onde ele entra', () => {
    const stops = courseOrder([obstaculo('1', '', 0, 0), obstaculo('', '', 0, 0)]);
    expect(stops.map((s) => s.label)).toEqual(['1']);
  });
});

describe('traçado do percurso', () => {
  it('sai da partida, passa por todos e termina na chegada', () => {
    const r = buildCourseRide(percurso())!;
    expect(r.stops).toEqual(['partida', '1', '2', '3', '4', 'chegada']);
    expect(r.path.nodes.length).toBeGreaterThan(10);
  });

  it('o comprimento é plausível para a pista, e maior que a soma das retas', () => {
    const r = buildCourseRide(percurso())!;
    const total = pathLength(r.path);
    // Quatro saltos numa pista de 80x50: algumas centenas de metros.
    expect(total).toBeGreaterThan(150);
    expect(total).toBeLessThan(700);
  });

  it('passa rente a cada obstáculo, na ordem', () => {
    const doc = percurso();
    const r = buildCourseRide(doc)!;
    const obstaculos = doc.objects.filter((o): o is Obstacle => o.kind === 'obstacle');
    for (const o of obstaculos) {
      const perto = r.path.nodes.some(
        (n) => Math.hypot(n.pos.x - o.pos.x, n.pos.y - o.pos.y) < 12,
      );
      expect(perto).toBe(true);
    }
  });

  it('sem partida e sem chegada, ainda liga os obstáculos', () => {
    const doc = produce(createDocument(), (d) => {
      d.objects.length = 0;
      addObject(d, createRectangleArena({ x: 0, y: 0 }, 80, 50));
      addObject(d, obstaculo('1', '', 25, 40));
      addObject(d, obstaculo('2', '', 60, 30, 90));
    });
    const r = buildCourseRide(doc)!;
    expect(r.stops).toEqual(['1', '2']);
  });

  it('não traça nada com um degrau só', () => {
    const doc = produce(createDocument(), (d) => {
      addObject(d, obstaculo('1', '', 25, 40));
    });
    expect(buildCourseRide(doc)).toBeNull();
  });

  it('a combinação é ligada em reta, sem volta entre os elementos', () => {
    const doc = produce(createDocument(), (d) => {
      d.objects.length = 0;
      addObject(d, createRectangleArena({ x: 0, y: 0 }, 80, 50));
      addObject(d, obstaculo('1', '', 20, 40));
      // 2A e 2B alinhados no mesmo eixo, a 8 m: uma combinação de verdade.
      addObject(d, obstaculo('2', 'A', 55, 35));
      addObject(d, obstaculo('2', 'B', 55, 27));
    });
    const r = buildCourseRide(doc)!;
    expect(r.stops).toEqual(['1', '2AB']);

    // A saída de 2A e a entrada de 2B têm de ser nós VIZINHOS: um nó
    // intermediário ali significaria uma curva onde só pode haver reta.
    const elementos = doc.objects.filter(
      (o): o is Obstacle => o.kind === 'obstacle' && o.number === '2',
    );
    const campo = fieldFrom(
      doc.objects.find((o): o is Arena => o.kind === 'arena')!,
      elementos,
    );
    // Mesmo orçamento de reta que o construtor usa: entre elementos de uma
    // combinação as retas de 8 m não caberiam inteiras.
    const vao = distance(
      exitPose(elementos[0]!, { ...DEFAULT_RIDE, getawayM: 0 }, campo).pos,
      entryPose(elementos[1]!, { ...DEFAULT_RIDE, approachM: 0 }, campo).pos,
    );
    const reta = straightBudget(vao, DEFAULT_RIDE.getawayM);
    const saidaA = exitPose(elementos[0]!, { ...DEFAULT_RIDE, getawayM: reta }, campo).pos;
    const entradaB = entryPose(elementos[1]!, { ...DEFAULT_RIDE, approachM: reta }, campo).pos;
    const indice = (alvo: { x: number; y: number }) =>
      r.path.nodes.findIndex((n) => Math.hypot(n.pos.x - alvo.x, n.pos.y - alvo.y) < 1e-6);

    expect(indice(saidaA)).toBeGreaterThanOrEqual(0);
    expect(indice(entradaB) - indice(saidaA)).toBe(1);
    expect(saidaA.x).toBeCloseTo(entradaB.x, 9);
  });

  it('avisa quando uma volta não cabe, e ainda assim entrega o traçado', () => {
    // Pista minúscula com dois saltos opostos. Meia-volta pede duas vezes
    // o raio de aperto em largura, e aqui não há nem isso: não existe volta
    // possível, por mais reta que se ceda.
    const doc = produce(createDocument(), (d) => {
      d.objects.length = 0;
      addObject(d, createRectangleArena({ x: 0, y: 0 }, 34, 15));
      addObject(d, obstaculo('1', '', 17, 5));
      addObject(d, obstaculo('2', '', 17, 11, 180));
    });
    const r = buildCourseRide(doc)!;
    expect(r.path.nodes.length).toBeGreaterThan(1);
    expect(r.problems.length).toBeGreaterThan(0);
    expect(r.problems[0]!.where).toBe('1 para 2');
  });

  it('cruza TODO obstáculo pelo centro e a 90 graus', () => {
    // A regra do ofício: o croqui é o traçado ideal, não o mais rápido.
    // Sem tolerância — o que se admite aqui é erro de arredondamento.
    const doc = percurso();
    const r = buildCourseRide(doc)!;
    const pontos = flattenPath(r.path, 0.02);

    for (const o of doc.objects.filter((x): x is Obstacle => x.kind === 'obstacle')) {
      const cruz = jumpCrossing(pontos, o);
      expect(cruz, `sem cruzamento no obstáculo ${o.number}`).not.toBeNull();
      expect(Math.abs(cruz!.offCentreM)).toBeLessThan(0.001);
      expect(cruz!.offSquareDeg).toBeLessThan(0.01);
    }
  });

  it('e o assistente não se acusa: percurso traçado por ele fica limpo', () => {
    const doc = percurso();
    const r = buildCourseRide(doc)!;
    const comTracado = produce(doc, (d) => addObject(d, r.path));
    expect(findInterferences(comTracado)).toEqual([]);
  });

  it('o traçado nasce sem bico: toda emenda é lisa', () => {
    const r = buildCourseRide(percurso())!;
    for (const no of r.path.nodes.slice(1, -1)) {
      if (!no.handleIn || !no.handleOut) continue;
      const cruzado = no.handleIn.x * no.handleOut.y - no.handleIn.y * no.handleOut.x;
      const escala = Math.hypot(no.handleIn.x, no.handleIn.y) * Math.hypot(no.handleOut.x, no.handleOut.y);
      // Seno do ângulo entre as alças: colinear de verdade, não por sorte.
      expect(Math.abs(cruzado) / (escala || 1)).toBeLessThan(1e-6);
    }
  });
});

describe('o assistente contorna ilhas e vasos (decisão 74)', () => {
  it('com uma ilha no caminho entre dois saltos, a volta não passa por cima dela', () => {
    const um = createObstacle('vertical', { x: 20, y: 20 }, '1');
    const dois = createObstacle('vertical', { x: 60, y: 20 }, '2');
    um.rotation = 90;
    dois.rotation = 90;
    const ilha = createPolygonStructure(
      [{ x: 36, y: 17 }, { x: 44, y: 17 }, { x: 44, y: 23 }, { x: 36, y: 23 }],
      'ilha',
    );
    ilha.scope = 'percurso';
    const doc = produce(createDocument({ arena: true }), (d) => {
      [um, dois, ilha].forEach((o) => addObject(d, o));
    });
    const r = buildCourseRide(doc)!;
    const pontos = flattenPath(r.path, 0.25);
    const dentro = pontos.some((p) => p.x > 36 && p.x < 44 && p.y > 17 && p.y < 23);
    // Contorna: passa ao lado da ilha, sem aviso.
    expect(dentro).toBe(false);
    expect(r.problems).toHaveLength(0);
  });
});
