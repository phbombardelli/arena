import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { createObstacle } from '@core/library/obstacles';
import { createDocument } from '@core/model/document';
import { distance } from '@core/geometry/vec';
import type { CourseDocument, Obstacle, ObstacleType } from '@core/model/types';
import { addObject } from './ops';
import { alignCombination, arcGapBetween, COMBINATION_GAP, confirmCombination, currentGaps, freeGaps, orderAlongLine, setArcGap, setFreeGap, splitCombination } from './alignOps';

const salto = (
  tipo: ObstacleType,
  x: number,
  y: number,
  numero: string,
  rotation = 0,
): Obstacle => {
  const o = createObstacle(tipo, { x, y }, numero);
  o.rotation = rotation;
  return o;
};

const cena = (...saltos: Obstacle[]): CourseDocument =>
  produce(createDocument(), (d) => {
    d.objects.length = 0;
    for (const s of saltos) addObject(d, s);
  });

const obstaculos = (doc: CourseDocument) =>
  doc.objects.filter((o): o is Obstacle => o.kind === 'obstacle');

const acha = (doc: CourseDocument, numero: string) =>
  obstaculos(doc).find((o) => o.number === numero)!;

describe('ordem na linha', () => {
  it('é a da numeração do percurso, não a da geometria', () => {
    // De propósito fora de lugar: 5b antes de 5a no terreno.
    const b = salto('vertical', 40, 40, '5');
    const a = salto('vertical', 40, 30, '5');
    const c = salto('vertical', 40, 20, '5');
    a.letter = 'A';
    b.letter = 'B';
    c.letter = 'C';
    expect(orderAlongLine([c, b, a]).map((o) => o.letter)).toEqual(['A', 'B', 'C']);
  });

  it('ordena por número antes de letra: 3b vem antes de 4', () => {
    const tresA = salto('vertical', 40, 20, '3');
    const tresB = salto('vertical', 40, 40, '3');
    const quatro = salto('vertical', 40, 30, '4');
    tresA.letter = 'A';
    tresB.letter = 'B';
    expect(orderAlongLine([quatro, tresB, tresA]).map((o) => `${o.number}${o.letter}`)).toEqual([
      '3A',
      '3B',
      '4',
    ]);
  });

  it('sem número, cai na geometria', () => {
    // Saltos para o norte (Y decrescente): o de maior Y vem primeiro.
    const a = salto('vertical', 40, 40, '');
    const b = salto('vertical', 40, 30, '');
    const c = salto('vertical', 40, 20, '');
    const ordem = orderAlongLine([c, a, b]);
    expect(ordem.map((o) => o.pos.y)).toEqual([40, 30, 20]);
  });

  it('sem número e com a seta invertida, a geometria se inverte junto', () => {
    const a = salto('vertical', 40, 40, '');
    const b = salto('vertical', 40, 30, '');
    a.arrow.reversed = true;
    b.arrow.reversed = true;
    expect(orderAlongLine([a, b])[0]!.pos.y).toBe(30);
  });
});

describe('medida do vão', () => {
  it('entre verticais, é a distância entre os centros', () => {
    const doc = cena(salto('vertical', 40, 40, '1'), salto('vertical', 40, 32.5, '2'));
    expect(currentGaps(orderAlongLine(obstaculos(doc)))[0]).toBeCloseTo(7.5, 9);
  });

  it('com oxer, desconta a largura dos DOIS saltos', () => {
    const oxer = salto('oxer', 40, 40, '1');
    const vertical = salto('vertical', 40, 30, '2');
    const largura = oxer.spreadM!;
    expect(largura).toBeGreaterThan(0);

    const vao = currentGaps(orderAlongLine([oxer, vertical]))[0]!;
    // Centros a 10 m; o vão livre é menor, pela meia largura do oxer.
    expect(vao).toBeCloseTo(10 - largura / 2, 9);
  });

  it('vão negativo denuncia corpos sobrepostos', () => {
    const doc = cena(salto('oxer', 40, 40, '1'), salto('oxer', 40, 39.5, '2'));
    expect(currentGaps(orderAlongLine(obstaculos(doc)))[0]).toBeLessThan(0);
  });
});

describe('alinhar a combinação', () => {
  it('aplica a distância pedida, medida de vara a vara', () => {
    const doc = cena(salto('vertical', 40, 40, '1'), salto('vertical', 43, 31, '2'));
    const alinhado = produce(doc, (d) => {
      alignCombination(d, obstaculos(d).map((o) => o.id), [7.5]);
    });
    expect(currentGaps(orderAlongLine(obstaculos(alinhado)))[0]).toBeCloseTo(7.5, 9);
  });

  it('num oxer, a distância pedida é o vão livre, não a de centro a centro', () => {
    const oxer = salto('oxer', 40, 40, '1');
    const largura = oxer.spreadM!;
    const doc = cena(oxer, salto('vertical', 41, 30, '2'));

    const alinhado = produce(doc, (d) => {
      alignCombination(d, obstaculos(d).map((o) => o.id), [7.5]);
    });
    const um = acha(alinhado, '1');
    const dois = acha(alinhado, '2');

    expect(currentGaps([um, dois])[0]).toBeCloseTo(7.5, 9);
    // De centro a centro dá meia largura a mais: é a diferença que o
    // desenhador erraria medindo pelo desenho em vez de pelas varas.
    expect(distance(um.pos, dois.pos)).toBeCloseTo(7.5 + largura / 2, 9);
  });

  it('o primeiro não se mexe: alinhar acerta os outros em relação a ele', () => {
    const doc = cena(salto('vertical', 40, 40, '1'), salto('vertical', 43, 31, '2'));
    const antes = acha(doc, '1').pos;
    const alinhado = produce(doc, (d) => {
      alignCombination(d, obstaculos(d).map((o) => o.id), [7.5]);
    });
    expect(acha(alinhado, '1').pos).toEqual(antes);
  });

  it('todos ficam no mesmo eixo e com a mesma inclinação', () => {
    const doc = cena(
      salto('vertical', 40, 40, '1', 30),
      salto('vertical', 46, 28, '2', 75),
      salto('vertical', 50, 18, '3', 10),
    );
    const alinhado = produce(doc, (d) => {
      alignCombination(d, obstaculos(d).map((o) => o.id), [7.5, 10.8]);
    });
    const [um, dois, tres] = orderAlongLine(obstaculos(alinhado));

    expect(dois!.rotation).toBe(30);
    expect(tres!.rotation).toBe(30);
    // Colineares: o produto vetorial dos dois passos é nulo.
    const p1 = { x: dois!.pos.x - um!.pos.x, y: dois!.pos.y - um!.pos.y };
    const p2 = { x: tres!.pos.x - dois!.pos.x, y: tres!.pos.y - dois!.pos.y };
    expect(Math.abs(p1.x * p2.y - p1.y * p2.x)).toBeLessThan(1e-9);
  });

  it('triplo: as duas distâncias saem exatas', () => {
    const doc = cena(
      salto('oxer', 40, 40, '5', 0),
      salto('vertical', 41, 31, '5', 0),
      salto('oxer', 39, 20, '5', 0),
    );
    const alinhado = produce(doc, (d) => {
      alignCombination(d, obstaculos(d).map((o) => o.id), [7.6, 10.9]);
    });
    const vaos = currentGaps(orderAlongLine(obstaculos(alinhado)));
    expect(vaos[0]).toBeCloseTo(7.6, 9);
    expect(vaos[1]).toBeCloseTo(10.9, 9);
  });

  it('com um só obstáculo, não faz nada', () => {
    const doc = cena(salto('vertical', 40, 40, '1'));
    const antes = acha(doc, '1').pos;
    const depois = produce(doc, (d) => {
      alignCombination(d, obstaculos(d).map((o) => o.id), []);
    });
    expect(acha(depois, '1').pos).toEqual(antes);
  });
});

describe('vão do composto: de 7 a 12 m (decisão 49)', () => {
  const composto = (...letras: ('A' | 'B' | 'C')[]) =>
    cena(
      ...letras.map((l, i) => {
        const o = salto('vertical', 40, 40 - i * 8, '5', 0);
        o.letter = l;
        return o;
      }),
    );

  it('os limites são 7 e 12 m', () => {
    expect(COMBINATION_GAP).toEqual({ min: 7, max: 12 });
  });

  it('dentro do composto, vão curto demais sobe para 7 m e longo demais desce para 12 m', () => {
    const doc = composto('A', 'B', 'C');
    const alinhado = produce(doc, (d) => {
      alignCombination(d, obstaculos(d).map((o) => o.id), [5, 20]);
    });
    const vaos = currentGaps(orderAlongLine(obstaculos(alinhado)));
    expect(vaos[0]).toBeCloseTo(7, 9);
    expect(vaos[1]).toBeCloseTo(12, 9);
  });

  it('um ou dois galopes ficam como o desenhador pediu', () => {
    const doc = composto('A', 'B');
    const alinhado = produce(doc, (d) => {
      alignCombination(d, obstaculos(d).map((o) => o.id), [10.8]);
    });
    expect(currentGaps(orderAlongLine(obstaculos(alinhado)))[0]).toBeCloseTo(10.8, 9);
  });

  it('linha entre números diferentes tem distância livre', () => {
    const doc = cena(salto('vertical', 40, 60, '4', 0), salto('vertical', 40, 30, '5', 0));
    const alinhado = produce(doc, (d) => {
      alignCombination(d, obstaculos(d).map((o) => o.id), [25.2]);
    });
    expect(currentGaps(orderAlongLine(obstaculos(alinhado)))[0]).toBeCloseTo(25.2, 9);
  });
});

describe('confirmar composto (decisão 71)', () => {
  it('dois obstáculos numerados 4 e 5 viram 4A e 4B, na ordem do percurso', () => {
    const doc = cena(salto('vertical', 10, 20, '5'), salto('vertical', 10, 10, '4'), salto('oxer', 40, 40, '6'));
    const ids = obstaculos(doc).filter((o) => o.number !== '6').map((o) => o.id);
    const d = produce(doc, (x) => confirmCombination(x, ids));
    const letras = obstaculos(d).filter((o) => o.number === '4').map((o) => `${o.pos.y}${o.letter}`);
    expect(new Set(letras)).toEqual(new Set(['10A', '20B']));
    // O 6 desce para 5: a numeração continua sem buraco (decisão 80).
    expect(acha(d, '5').letter).toBe('');
    expect(obstaculos(d).some((o) => o.number === '6')).toBe(false);
  });

  it('sem número, ganham o seguinte ao maior do croqui', () => {
    const doc = cena(salto('vertical', 0, 0, '7'), salto('vertical', 30, 10, ''), salto('vertical', 30, 20, ''));
    const ids = obstaculos(doc).filter((o) => o.number === '').map((o) => o.id);
    const d = produce(doc, (x) => confirmCombination(x, ids));
    expect(obstaculos(d).filter((o) => o.number === '8')).toHaveLength(2);
  });
});

describe('linha curva ou quebrada (decisão 71)', () => {
  it('acerta o vão sem endireitar: o seguinte anda na reta entre os dois, e o resto junto', () => {
    const a = salto('vertical', 0, 0, '1', 0);
    const b = salto('vertical', 6, 8, '2', 30); // a 10 m do primeiro, girado
    const c = salto('vertical', 20, 8, '3', 60);
    const doc = cena(a, b, c);
    const ids = [a.id, b.id, c.id];
    const antes = freeGaps(orderAlongLine(obstaculos(doc)));
    const d = produce(doc, (x) => setFreeGap(x, ids, 0, 15));
    const depois = freeGaps(orderAlongLine(obstaculos(d)));
    expect(depois[0]).toBeCloseTo(15, 6);
    expect(depois[1]).toBeCloseTo(antes[1]!, 6);
    // Ninguém foi girado.
    expect(acha(d, '2').rotation).toBe(30);
    expect(acha(d, '3').rotation).toBe(60);
  });
});

describe('composto ou linha (decisão 80)', () => {
  const montar = () => {
    const nums = ['1', '2', '3', '4'];
    const obs = nums.map((n, i) => createObstacle('vertical', { x: i * 10, y: 0 }, n));
    const doc = produce(createDocument(), (d) => {
      d.objects.length = 0;
      for (const o of obs) addObject(d, o);
    });
    return { doc, obs };
  };
  const rotulos = (doc: CourseDocument) =>
    doc.objects.filter((o): o is Obstacle => o.kind === 'obstacle').map((o) => `${o.number}${o.letter}`);

  it('2 e 3 viram composto; o 4 desce para 3; desfazer volta tudo', () => {
    const { doc, obs } = montar();
    const composto = produce(doc, (d) => confirmCombination(d, [obs[1]!.id, obs[2]!.id]));
    expect(rotulos(composto)).toEqual(['1', '2A', '2B', '3']);
    const linha = produce(composto, (d) => splitCombination(d, [obs[1]!.id, obs[2]!.id]));
    expect(rotulos(linha)).toEqual(['1', '2', '3', '4']);
  });


});

describe('curva por distância (B-81)', () => {
  it('põe o seguinte no fim do arco, de frente para ele, e lê de volta o mesmo vão e abertura', () => {
    const doc = cena(salto('oxer', 0, 0, '1'), salto('vertical', 20, 0, '2'));
    const ids = obstaculos(doc).map((o) => o.id);
    const depois = produce(doc, (d) => setArcGap(d, ids, 0, { gapM: 18, angleDeg: 40 }));
    const lido = arcGapBetween(acha(depois, '1'), acha(depois, '2'));
    expect(lido.gapM).toBeCloseTo(18, 6);
    expect(lido.angleDeg).toBeCloseTo(40, 6);
    // De frente para a curva: girou os mesmos 40°.
    expect(acha(depois, '2').rotation).toBeCloseTo(40, 6);
  });

  it('abrir mais não muda a distância sobre o arco, e abre para o lado pedido', () => {
    const doc = cena(salto('vertical', 0, 0, '1'), salto('vertical', 20, 0, '2'));
    const ids = obstaculos(doc).map((o) => o.id);
    const esquerda = produce(doc, (d) => setArcGap(d, ids, 0, { gapM: 20, angleDeg: -60 }));
    const lido = arcGapBetween(acha(esquerda, '1'), acha(esquerda, '2'));
    expect(lido.gapM).toBeCloseTo(20, 6);
    expect(lido.angleDeg).toBeCloseTo(-60, 6);
    // O salto 1 pula para o norte (rotação 0 → rumo -90°): virar à esquerda vai para oeste.
    expect(acha(esquerda, '2').pos.x).toBeLessThan(0);
  });

  it('os de depois acompanham como bloco', () => {
    const doc = cena(salto('vertical', 0, 0, '1'), salto('vertical', 0, -20, '2'), salto('vertical', 0, -40, '3'));
    const ids = obstaculos(doc).map((o) => o.id);
    const antes = distance(acha(doc, '2').pos, acha(doc, '3').pos);
    const depois = produce(doc, (d) => setArcGap(d, ids, 0, { gapM: 20, angleDeg: 30 }));
    expect(distance(acha(depois, '2').pos, acha(depois, '3').pos)).toBeCloseTo(antes, 6);
    expect(acha(depois, '3').rotation).toBeCloseTo(30, 6);
  });
});
