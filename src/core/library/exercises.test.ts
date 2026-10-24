import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { distance } from '@core/geometry/vec';
import { createDocument } from '@core/model/document';
import { pathSampler } from '@core/assist/obstacleDistances';
import type { CoursePath, Obstacle } from '@core/model/types';
import {
  defaultPeDeGalinha,
  DEFAULT_CAVALETES,
  DEFAULT_RELOGIO,
  exercisePlacement,
  generateCavaletes,
  generatePeDeGalinha,
  generateRelogio,
  placeExercise,
  updateExercise,
} from './exercises';
import { obstacleDef } from './obstacles';

const meia = (o: Obstacle) => (obstacleDef(o.type).spreadM ?? 0) / 2;

describe('ginástica (B-37)', () => {
  it('cavaletes: quantos e a que distância, de centro a centro', () => {
    const g = generateCavaletes({ ...DEFAULT_CAVALETES, count: 5, spacingM: 1.4 });
    expect(g.obstacles).toHaveLength(5);
    expect(g.obstacles.map((o) => o.pos.x)).toEqual([0, 1.4, 2.8, 4.2, 5.6].map((x) => expect.closeTo(x, 9)));
    expect(g.obstacles.every((o) => !o.arrow.visible)).toBe(true);
  });

  it('pé de galinha completo: as distâncias do exemplo, de vara a vara', () => {
    const g = generatePeDeGalinha(defaultPeDeGalinha(true));
    const [c1, , , c4, x, vert, oxer] = g.obstacles;
    expect(c4!.pos.x - c1!.pos.x).toBeCloseTo(4.2, 9);
    expect(x!.pos.x - c4!.pos.x).toBeCloseTo(2.8, 9);
    expect(vert!.pos.x - x!.pos.x).toBeCloseTo(5.8, 9);
    // Até a vara de entrada do oxer: o centro dele fica meia largura além.
    expect(oxer!.pos.x - meia(oxer!) - vert!.pos.x).toBeCloseTo(9, 9);
    expect(x!.type).toBe('x');
  });

  it('saídas: a reta a 20,5 m e as curvas a 23,5 m medidos sobre a linha', () => {
    const g = generatePeDeGalinha(defaultPeDeGalinha(false));
    const [central, esquerda, reta, direita] = g.obstacles;
    const saida = central!.pos.x + meia(central!);
    expect(reta!.pos.x - meia(reta!) - saida).toBeCloseTo(20.5, 9);
    expect(esquerda!.pos.y).toBeLessThan(0);
    expect(direita!.pos.y).toBeGreaterThan(0);
    // A curva: o comprimento da linha até a vara de entrada é 23,5 m.
    const linhas = g.extras.filter((e): e is CoursePath => e.kind === 'path');
    expect(linhas).toHaveLength(3);
    const curva = linhas[0]!;
    const amostra = pathSampler(curva)!;
    const total = amostra.acumulado[amostra.acumulado.length - 1]!;
    expect(total - meia(central!) - meia(esquerda!)).toBeCloseTo(23.5, 1);
    expect(curva.label?.text).toBe('23,50 m');
  });

  it('duplo central: o segundo a 7 m do primeiro, e as saídas partem dele', () => {
    const p = defaultPeDeGalinha(false);
    p.central.type = 'vertical';
    p.central.duplo = { on: true, type: 'oxer', distM: 7 };
    const [a, b] = generatePeDeGalinha(p).obstacles;
    expect(b!.pos.x - meia(b!) - a!.pos.x).toBeCloseTo(7, 9);
  });

  it('relógio: 4 varas a 90°, no sentido do raio, a meio diâmetro do centro', () => {
    const g = generateRelogio({ ...DEFAULT_RELOGIO, diameterM: 20 });
    expect(g.obstacles).toHaveLength(4);
    for (const o of g.obstacles) expect(distance(o.pos, { x: 0, y: 0 })).toBeCloseTo(10, 9);
    expect(g.obstacles[0]!.pos.y).toBeCloseTo(-10, 9);
    expect(g.obstacles.every((o) => o.number === '')).toBe(true);
    // Topo, sentido horário: salta para a direita (leste).
    const topo = g.obstacles[0]!;
    const heading = topo.rotation + (topo.arrow.reversed ? 90 : -90);
    expect(((heading % 360) + 360) % 360).toBeCloseTo(0, 6);
  });

  it('editar redesenha no mesmo lugar e direção, mesmo depois de girado', () => {
    let doc = produce(createDocument(), (d) => {
      d.objects.length = 0;
      placeExercise(d, 'cavaletes', DEFAULT_CAVALETES, { x: 30, y: 20 }, 40, 'exe1');
    });
    const antes = exercisePlacement(doc, 'exe1')!;
    expect(antes.origem.x).toBeCloseTo(30, 9);
    expect(antes.giro).toBeCloseTo(40, 9);
    doc = produce(doc, (d) => {
      updateExercise(d, 'exe1', { ...DEFAULT_CAVALETES, count: 6 });
    });
    const obs = doc.objects.filter((o): o is Obstacle => o.kind === 'obstacle');
    expect(obs).toHaveLength(6);
    expect(new Set(obs.map((o) => o.group)).size).toBe(1);
    expect(exercisePlacement(doc, 'exe1')!.giro).toBeCloseTo(40, 9);
  });
});
