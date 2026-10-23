import { describe, expect, it } from 'vitest';
import { createObstacle } from '@core/library/obstacles';
import { createPath, createPathNode } from '@core/model/path';
import { createTimingLine } from '@core/library/timing';
import { courseDistancesAlong, distanceKey, obstacleDistancesAlong } from './obstacleDistances';

const salto = (numero: string, y: number, tipo: 'vertical' | 'oxer' = 'vertical') =>
  createObstacle(tipo, { x: 20, y }, numero);

describe('distância entre obstáculos ao longo do traçado (decisão 54)', () => {
  const reta = createPath([createPathNode({ x: 20, y: 60 }), createPathNode({ x: 20, y: 0 })]);

  it('dois verticais numa reta: a distância entre as varas', () => {
    const [d] = obstacleDistancesAlong(reta, [salto('1', 50), salto('2', 24.8)]);
    expect(d!.meters).toBeCloseTo(25.2, 2);
    expect(d!.fromLabel).toBe('1');
    expect(d!.toLabel).toBe('2');
  });

  it('com oxer, desconta meia largura de cada um: é de vara a vara', () => {
    const a = salto('1', 50, 'oxer');
    const b = salto('2', 24, 'oxer');
    const [d] = obstacleDistancesAlong(reta, [a, b]);
    expect(d!.meters).toBeCloseTo(26 - (a.spreadM! + b.spreadM!) / 2, 2);
    expect(d!.key).toBe(distanceKey(a, b));
  });

  it('mede sobre a curva, não em linha reta', () => {
    const curva = createPath([
      createPathNode({ x: 0, y: 0 }),
      createPathNode({ x: 20, y: 20 }),
      createPathNode({ x: 40, y: 0 }),
    ]);
    const a = createObstacle('vertical', { x: 0, y: 0 }, '1');
    const b = createObstacle('vertical', { x: 40, y: 0 }, '2');
    const [d] = obstacleDistancesAlong(curva, [a, b]);
    expect(d!.meters).toBeGreaterThan(40);
  });

  it('obstáculo por onde o traçado não passa fica de fora', () => {
    expect(obstacleDistancesAlong(reta, [salto('1', 50), createObstacle('vertical', { x: 60, y: 30 }, '2')])).toEqual([]);
  });
});

describe('distâncias do percurso, da partida à chegada (decisão 76)', () => {
  const reta = createPath([createPathNode({ x: 20, y: 70 }), createPathNode({ x: 20, y: 0 })]);

  it('partida → 1 → 2 → chegada, cada uma de vara a vara', () => {
    const partida = createTimingLine('start', { x: 20, y: 65 });
    const chegada = createTimingLine('finish', { x: 20, y: 5 });
    const ds = courseDistancesAlong(reta, [salto('1', 50), salto('2', 21)], [partida, chegada]);
    expect(ds.map((d) => `${d.fromLabel}>${d.toLabel}`)).toEqual(['Partida>1', '1>2', '2>Chegada']);
    expect(ds[0]!.meters).toBeCloseTo(15, 2);
    expect(ds[1]!.meters).toBeCloseTo(29, 2);
    expect(ds[2]!.meters).toBeCloseTo(16, 2);
    expect(ds[0]!.fromId).toBe(partida.id);
  });

  it('sem cruzadas, só os obstáculos', () => {
    expect(courseDistancesAlong(reta, [salto('1', 50), salto('2', 21)], [])).toHaveLength(1);
  });
});
