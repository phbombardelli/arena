import { describe, expect, it } from 'vitest';
import { createObstacle } from '@core/library/obstacles';
import { createRectangleArena } from '@core/model/arena';
import { createPath, flattenPath } from '@core/model/path';
import { distance } from '@core/geometry/vec';
import type { Obstacle } from '@core/model/types';
import { DEFAULT_RIDE, entryPose, exitPose, fieldFrom } from './ridePath';
import { legCandidates, roundDubins, solveLegCurve, turnOfPoints } from './legCurve';
import { dubinsPaths } from '@core/geometry/dubins';

const salto = (numero: string, x: number, y: number, rotation: number): Obstacle => {
  const o = createObstacle('vertical', { x, y }, numero);
  o.rotation = rotation;
  return o;
};

const pista = createRectangleArena({ x: 0, y: 0 }, 90, 55);

function volta(a: Obstacle, b: Obstacle) {
  const campo = fieldFrom(pista, [a, b]);
  const de = exitPose(a, DEFAULT_RIDE, campo);
  const para = entryPose(b, DEFAULT_RIDE, campo);
  const s = solveLegCurve(de, para, campo, DEFAULT_RIDE);
  return {
    ...s,
    vaoM: distance(de.pos, para.pos),
    giroDeg: turnOfPoints(flattenPath(createPath(s.nodes), 0.05)),
  };
}

describe('curva para trás', () => {
  /**
   * A cena que quebrou o assistente na prova real: o 5 é saltado para
   * leste e o 6 fica logo ao lado, saltado para o norte. Entre a saída de
   * um e a entrada do outro sobram menos de 4 m, com 90 graus de diferença
   * de direção — não existe ligação curta possível.
   *
   * A saída do cavaleiro é seguir em frente, dar a volta por fora e voltar
   * numa aproximação bem mais longa. É a curva para trás.
   */
  const cinco = salto('5', 40, 40, 90);
  const seis = salto('6', 52, 32, 0);

  it('a cena é mesmo impossível de ligar curto', () => {
    const v = volta(cinco, seis);
    expect(v.vaoM).toBeLessThan(5);
  });

  it('resolve alongando a reta, não espremendo a curva', () => {
    const v = volta(cinco, seis);
    // Alongou de algum lado: é isso que cria o espaço da volta.
    expect(Math.max(v.lead.after, v.lead.before)).toBeGreaterThan(0);
    expect(v.warnings).toEqual([]);
  });

  it('a volta resultante é galopável e gira mais de meia volta', () => {
    const v = volta(cinco, seis);
    expect(v.minRadiusM).toBeGreaterThanOrEqual(DEFAULT_RIDE.tightRadiusM);
    // Curva para trás gira muito por definição — proibir volta grande
    // proibia justamente a única saída possível aqui.
    expect(v.giroDeg).toBeGreaterThan(180);
  });

  it('e não troca de mão à toa no caminho', () => {
    expect(volta(cinco, seis).inflections).toBeLessThanOrEqual(1);
  });
});

describe('raio mínimo e teto de giro (decisão 49)', () => {
  // A mesma cena, 6 m mais perto do alambrado de baixo: a meia-volta de
  // raio mínimo desce 10 m e já não cabe na pista de 55 m.
  const cinco = salto('5', 40, 46, 90);
  const seis = salto('6', 52, 38, 0);

  it('sem espaço, desenha volta galopável e avisa — nunca um bico', () => {
    const v = volta(cinco, seis);
    expect(v.minRadiusM).toBeGreaterThanOrEqual(DEFAULT_RIDE.tightRadiusM);
    expect(v.warnings).toContain('fora-da-pista');
    expect(v.warnings).not.toContain('curva-fechada');
  });

  it('não oferece curva abaixo do raio mínimo quando existe uma que se galope', () => {
    const campo = fieldFrom(pista, [cinco, seis]);
    const lista = legCandidates(
      exitPose(cinco, DEFAULT_RIDE, campo),
      entryPose(seis, DEFAULT_RIDE, campo),
      campo,
      DEFAULT_RIDE,
    );
    expect(lista.length).toBeGreaterThan(0);
    for (const c of lista) expect(c.minRadiusM).toBeGreaterThanOrEqual(DEFAULT_RIDE.tightRadiusM);
  });

  it('volta direta de 200 a 270 graus é aceita, sem ir por fora à toa', () => {
    // Dois saltos para o norte, o segundo bem à direita e um pouco acima:
    // a direta gira uns 240 graus e é desenho de percurso, não defeito.
    const v = volta(salto('1', 20, 40, 0), salto('2', 65, 30, 0));
    expect(v.warnings).toEqual([]);
    expect(v.turnDeg).toBeGreaterThan(200);
    expect(v.turnDeg).toBeLessThanOrEqual(270);
    expect(v.lead.after).toBeLessThanOrEqual(0);
    expect(v.lead.before).toBeLessThanOrEqual(0);
  });

  it('saltos lado a lado: volta inteira galopável e marcada, não bico', () => {
    // Os dois para o norte, a 10 m um do outro: a única volta que se
    // galopa gira uns 360 graus. Ela é desenhada e denunciada; o bico que
    // girava menos era o que saía antes.
    const v = volta(salto('1', 40, 30, 0), salto('2', 50, 30, 0));
    expect(v.minRadiusM).toBeGreaterThanOrEqual(DEFAULT_RIDE.tightRadiusM);
    expect(v.turnDeg).toBeGreaterThan(DEFAULT_RIDE.maxTurnDeg);
    expect(v.warnings).toContain('giro-excessivo');
    expect(v.warnings).not.toContain('curva-fechada');
  });
});

describe('a volta grande só aparece quando é preciso', () => {
  it('dois saltos alinhados continuam ligados por reta', () => {
    const v = volta(salto('1', 20, 40, 0), salto('2', 20, 12, 0));
    expect(v.giroDeg).toBeLessThan(5);
    expect(v.lead).toEqual({ after: 0, before: 0 });
  });

  it('uma curva mansa não vira laçada', () => {
    // Saltos afastados, com virada suave entre eles: giro pequeno.
    const v = volta(salto('1', 20, 45, 0), salto('2', 60, 20, 45));
    expect(v.giroDeg).toBeLessThan(180);
    expect(v.warnings).toEqual([]);
  });

  it('a meia-volta larga gira o esperado, sem exagero', () => {
    // Um salta para o norte, o outro para o sul, bem afastados.
    const v = volta(salto('1', 25, 40, 0), salto('2', 60, 40, 180));
    expect(v.giroDeg).toBeGreaterThan(120);
    expect(v.giroDeg).toBeLessThan(260);
    expect(v.warnings).toEqual([]);
  });
});

describe('opções da pernada', () => {
  const opcoes = (a: Obstacle, b: Obstacle) => {
    const campo = fieldFrom(pista, [a, b]);
    return legCandidates(
      exitPose(a, DEFAULT_RIDE, campo),
      entryPose(b, DEFAULT_RIDE, campo),
      campo,
      DEFAULT_RIDE,
    );
  };

  it('numa reta absoluta, oferece uma opção só', () => {
    // Dois saltos alinhados e no mesmo sentido: não há o que escolher.
    const lista = opcoes(salto('1', 40, 45, 0), salto('2', 40, 15, 0));
    expect(lista).toHaveLength(1);
    expect(lista[0]!.turnDeg).toBeLessThan(5);
  });

  it('numa volta de verdade, oferece caminhos diferentes — sem contracurva', () => {
    // A virada de 90 graus já ofereceu "a que troca de mão para abrir a
    // entrada": é contracurva, e saiu (decisão 82). As ideias reais que
    // ficam variam o raio e o lugar onde a volta abre.
    const lista = opcoes(salto('1', 30, 40, 0), salto('2', 55, 15, 90));
    expect(lista.length).toBeGreaterThan(1);
    expect(lista.every((c) => !c.counterTurn)).toBe(true);
    const formas = new Set(lista.map((c) => `${Math.round(c.minRadiusM)}|${c.opensAt}|${c.lead.after > 0}`));
    expect(formas.size).toBeGreaterThan(1);
  });

  it('a primeira da lista é a que o assistente escolheria sozinho', () => {
    const a = salto('1', 25, 40, 0);
    const b = salto('2', 60, 40, 180);
    const campo = fieldFrom(pista, [a, b]);
    const de = exitPose(a, DEFAULT_RIDE, campo);
    const para = entryPose(b, DEFAULT_RIDE, campo);

    const sozinho = solveLegCurve(de, para, campo, DEFAULT_RIDE);
    const primeira = legCandidates(de, para, campo, DEFAULT_RIDE)[0]!;
    expect(primeira.turnDeg).toBeCloseTo(sozinho.turnDeg, 6);
  });

  it('não devolve uma lista enorme de variações do mesmo desenho', () => {
    const lista = opcoes(salto('1', 20, 45, 0), salto('2', 60, 20, 45));
    expect(lista.length).toBeLessThanOrEqual(6);
  });

  it('oferece a curva para trás quando ela é a saída', () => {
    // A cena do 5 para o 6: colados e virados para lados diferentes.
    const lista = opcoes(salto('5', 40, 40, 90), salto('6', 52, 32, 0));
    expect(lista.some((c) => c.lead.after > 0 || c.lead.before > 0)).toBe(true);
  });
});

describe('redondeza (decisão 50)', () => {
  it('virada de 90 graus com espaço sai em curva contínua, não em arco entre retas', () => {
    const v = volta(salto('1', 30, 40, 0), salto('2', 55, 15, 90));
    expect(v.warnings).toEqual([]);
    expect(v.shape).toBe('curva');
  });

  it('a volta grande sai pela rota do arco-reta-arco, arredondada (decisão 51)', () => {
    // A meia-volta para trás: a cúbica única bica, e só a rota em arcos
    // resolve. Ela sai arredondada — curvatura contínua, sem esquina.
    // Com espaço para o raio de 6 m: mais colado, a arredondada fica abaixo
    // do piso e o arco-reta-arco assume (decisão 82).
    const v = volta(salto('5', 40, 40, 90), salto('6', 46, 23, 0));
    expect(v.shape).toBe('curva');
    expect(v.turnDeg).toBeGreaterThan(180);
    expect(v.inflections).toBe(0);
    expect(v.minRadiusM).toBeGreaterThanOrEqual(DEFAULT_RIDE.tightRadiusM);
    expect(v.warnings).toEqual([]);
  });

  it('arredondar não muda a rota: começa e termina nas mesmas poses', () => {
    const de = { pos: { x: 10, y: 10 }, heading: 0 };
    const para = { pos: { x: 10, y: 30 }, heading: 180 };
    const rota = dubinsPaths(de, para, 10)[0]!;
    const r = roundDubins(rota);
    expect(r.nodes[0]!.pos.x).toBeCloseTo(de.pos.x, 9);
    expect(r.nodes[0]!.pos.y).toBeCloseTo(de.pos.y, 9);
    expect(r.nodes[r.nodes.length - 1]!.pos.x).toBeCloseTo(para.pos.x, 9);
    expect(r.nodes[r.nodes.length - 1]!.pos.y).toBeCloseTo(para.pos.y, 9);
    // Uma meia-volta de raio 10 arredondada continua com raio perto de 10.
    expect(r.minRadiusM).toBeGreaterThan(9);
  });

  it('entre duas formas de giro parecido, fica a de raio mais aberto', () => {
    const campo = fieldFrom(pista, []);
    const a = salto('1', 20, 45, 0);
    const b = salto('2', 60, 20, 45);
    const lista = legCandidates(exitPose(a, DEFAULT_RIDE, campo), entryPose(b, DEFAULT_RIDE, campo), campo, DEFAULT_RIDE, 12);
    const escolhida = lista[0]!;
    for (const c of lista) {
      if (Math.abs(c.turnDeg - escolhida.turnDeg) <= 5 && c.inflections === escolhida.inflections) {
        expect(escolhida.minRadiusM).toBeGreaterThanOrEqual(Math.min(c.minRadiusM, DEFAULT_RIDE.radiusM) - 1e-6);
      }
    }
  });
});
