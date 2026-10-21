import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { addObject } from '@core/commands/ops';
import { createObstacle } from '@core/library/obstacles';
import { createPolygonStructure } from '@core/library/structures';
import { createOrnament } from '@core/library/ornaments';
import { createDocument } from '@core/model/document';
import { createRectangleArena } from '@core/model/arena';
import { createPath, createPathNode, flattenPath } from '@core/model/path';
import type { Vec2 } from '@core/geometry/vec';
import type { CourseDocument, Obstacle } from '@core/model/types';
import { findInterferences, jumpCrossing } from './interference';

const salto = (x: number, y: number, rot = 0, numero = '1'): Obstacle => {
  const o = createObstacle('vertical', { x, y }, numero);
  o.rotation = rot;
  return o;
};

const comPista = (recipe: (d: CourseDocument) => void): CourseDocument =>
  produce(createDocument(), (d) => {
    d.objects.length = 0;
    addObject(d, createRectangleArena({ x: 0, y: 0 }, 80, 50));
    recipe(d);
  });

const linha = (pontos: Vec2[]) => createPath(pontos.map((p) => createPathNode(p)));
const tipos = (doc: CourseDocument) => findInterferences(doc).map((a) => a.kind);

describe('medida do cruzamento', () => {
  // Obstáculo em (40,25) sem rotação: a vara deita no eixo X e o salto
  // atravessa no eixo Y.
  const o = salto(40, 25);

  it('reta pelo centro cruza no zero, com esquadro perfeito', () => {
    const c = jumpCrossing(flattenPath(linha([{ x: 40, y: 40 }, { x: 40, y: 10 }])), o)!;
    expect(c.offCentreM).toBeCloseTo(0, 9);
    expect(c.offSquareDeg).toBeCloseTo(0, 9);
  });

  it('mede o desvio do centro em metros', () => {
    const c = jumpCrossing(flattenPath(linha([{ x: 41.2, y: 40 }, { x: 41.2, y: 10 }])), o)!;
    expect(Math.abs(c.offCentreM)).toBeCloseTo(1.2, 6);
    expect(c.offSquareDeg).toBeCloseTo(0, 9);
  });

  it('mede o desvio do esquadro em graus', () => {
    const c = jumpCrossing(flattenPath(linha([{ x: 25, y: 40 }, { x: 55, y: 10 }])), o)!;
    expect(c.offSquareDeg).toBeCloseTo(45, 6);
  });

  it('linha que passa longe da vara não é cruzamento nenhum', () => {
    expect(jumpCrossing(flattenPath(linha([{ x: 60, y: 40 }, { x: 60, y: 10 }])), o)).toBeNull();
  });
});

describe('o desenho é de quem assina', () => {
  it('reta pelo centro e a 90 graus não acusa nada', () => {
    const doc = comPista((d) => {
      addObject(d, salto(40, 25, 0, '1'));
      addObject(d, linha([{ x: 40, y: 40 }, { x: 40, y: 10 }]));
    });
    expect(findInterferences(doc)).toEqual([]);
  });

  it('salto tomado fora do centro é aceito sem reclamação', () => {
    const doc = comPista((d) => {
      addObject(d, salto(40, 25, 0, '1'));
      // 80 cm ao lado do centro. Não é o traçado ideal, mas quem desenhou
      // desenhou assim, e o programa não opina sobre desenho alheio.
      addObject(d, linha([{ x: 40.8, y: 40 }, { x: 40.8, y: 10 }]));
    });
    expect(findInterferences(doc)).toEqual([]);
  });

  it('salto tomado torto também é aceito', () => {
    const doc = comPista((d) => {
      addObject(d, salto(40, 25, 0, '1'));
      addObject(d, linha([{ x: 30, y: 40 }, { x: 50, y: 10 }]));
    });
    expect(findInterferences(doc)).toEqual([]);
  });

  it('mas atravessar a vara no comprimento continua sendo estorvo', () => {
    const doc = comPista((d) => {
      addObject(d, salto(40, 25, 0, '1'));
      addObject(d, linha([{ x: 10, y: 25 }, { x: 70, y: 25 }]));
    });
    expect(tipos(doc)).toContain('tracado-cruza-obstaculo');
  });

  it('e passar pelo paraflanco é bater no pilar, não saltar', () => {
    const doc = comPista((d) => {
      const o = salto(40, 25, 0, '1');
      addObject(d, o);
      // Além da ponta da vara, na faixa do paraflanco.
      const foraDaVara = o.faceWidthM / 2 + o.wings.widthM / 2;
      addObject(d, linha([
        { x: 40 + foraDaVara, y: 40 },
        { x: 40 + foraDaVara, y: 10 },
      ]));
    });
    expect(tipos(doc)).toContain('tracado-cruza-obstaculo');
  });
});

describe('interferências entre objetos', () => {
  it('percurso limpo não acusa nada', () => {
    const doc = comPista((d) => {
      addObject(d, salto(20, 25, 0, '1'));
      addObject(d, salto(60, 25, 0, '2'));
    });
    expect(findInterferences(doc)).toEqual([]);
  });

  it('acusa dois obstáculos montados um sobre o outro', () => {
    const doc = comPista((d) => {
      addObject(d, salto(30, 25, 0, '1'));
      addObject(d, salto(30.5, 25, 0, '2'));
    });
    const achados = findInterferences(doc);
    expect(achados).toHaveLength(1);
    expect(achados[0]!.kind).toBe('obstaculos-sobrepostos');
  });

  it('não acusa os elementos de uma combinação, que ficam perto de propósito', () => {
    const doc = comPista((d) => {
      const a = salto(30, 25, 0, '5');
      a.letter = 'A';
      const b = salto(30, 24.6, 0, '5');
      b.letter = 'B';
      addObject(d, a);
      addObject(d, b);
    });
    expect(findInterferences(doc)).toEqual([]);
  });

  it('acusa obstáculo pisando no alambrado', () => {
    // Sem rotação a vara deita no eixo X: a 79,5 m a ponta passa dos 80 m.
    const doc = comPista((d) => addObject(d, salto(79.5, 25, 0, '1')));
    expect(tipos(doc)).toContain('obstaculo-fora-da-pista');
  });

  it('obstáculo escondido não é acusado', () => {
    const doc = comPista((d) => {
      const a = salto(30, 25, 0, '1');
      const b = salto(30.5, 25, 0, '2');
      b.visible = false;
      addObject(d, a);
      addObject(d, b);
    });
    expect(findInterferences(doc)).toEqual([]);
  });

  it('cada achado aponta os objetos envolvidos, para a interface destacar', () => {
    const doc = comPista((d) => {
      addObject(d, salto(40, 25, 0, '1'));
      addObject(d, linha([{ x: 10, y: 25 }, { x: 70, y: 25 }]));
    });
    const achado = findInterferences(doc)[0]!;
    expect(achado.ids).toHaveLength(2);
    for (const id of achado.ids) {
      expect(doc.objects.some((o) => o.id === id)).toBe(true);
    }
  });
});

describe('água do cenário (decisão 72)', () => {
  it("obstáculo sobre massa d'água é interferência; sobre o rio, não", () => {
    const lago = createPolygonStructure([{ x: 20, y: 10 }, { x: 30, y: 10 }, { x: 30, y: 20 }, { x: 20, y: 20 }], 'lago');
    const rio = createPolygonStructure([{ x: 40, y: 10 }, { x: 50, y: 10 }, { x: 50, y: 20 }, { x: 40, y: 20 }], 'rio');
    const noLago = createObstacle('vertical', { x: 25, y: 15 }, '1');
    const noRio = createObstacle('vertical', { x: 45, y: 15 }, '2');
    const doc = produce(createDocument({ arena: true }), (d) => {
      [lago, rio, noLago, noRio].forEach((o) => addObject(d, o));
    });
    const agua = findInterferences(doc).filter((i) => i.kind === 'obstaculo-na-agua');
    expect(agua).toHaveLength(1);
    expect(agua[0]!.ids).toContain(noLago.id);
  });
});

describe('ornamentos que ocupam o chão (decisão 74)', () => {
  it('traçado por cima de ilha decorativa ou de vaso vira aviso', () => {
    const ilha = createPolygonStructure([{ x: 20, y: 10 }, { x: 30, y: 10 }, { x: 30, y: 16 }, { x: 20, y: 16 }], 'ilha');
    ilha.scope = 'percurso';
    const vaso = createOrnament('vaso', { x: 50, y: 25 });
    const p = createPath([createPathNode({ x: 10, y: 13 }, 'corner'), createPathNode({ x: 60, y: 25 }, 'corner')]);
    const doc = produce(createDocument({ arena: true }), (d) => {
      [ilha, vaso, p].forEach((o) => addObject(d, o));
    });
    const avisos = findInterferences(doc).filter((i) => i.kind === 'tracado-cruza-ornamento');
    expect(avisos.map((a) => a.ids[1])).toContain(ilha.id);
    expect(vaso.scope).toBe('percurso');
  });
});
