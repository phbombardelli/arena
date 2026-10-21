import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import {
  OBSTACLES,
  acceptsLiverpool,
  arrowGeometry,
  createObstacle,
  fitElementsToType,
  formatHeights,
  hasBars,
  labelOffset,
  nextObstacleNumber,
  obstacleExtent,
  obstacleLabel,
  wingDepth,
} from '@core/library/obstacles';
import { createDocument } from '@core/model/document';
import { getBounds } from '@core/model/transform';
import type { CourseDocument, Obstacle } from '@core/model/types';
import { addObject, rotateObjects } from './ops';
import {
  addElement,
  allObstacles,
  resetLabel,
  setBarAppearance,
  setLabelOffset,
  setLiverpool,
  setWings,
  flipArrow,
  removeElement,
  renumberByInsertion,
  setArrow,
  setElementHeight,
  setFaceWidth,
  setObstacleLetter,
  setObstacleNumber,
  setObstacleType,
  setSpread,
} from './obstacleOps';

const edit = (doc: CourseDocument, recipe: (d: CourseDocument) => void) => produce(doc, recipe);

function docCom(...obstaculos: Obstacle[]): CourseDocument {
  return edit(createDocument(), (d) => {
    for (const o of obstaculos) addObject(d, o);
  });
}

const obs = (doc: CourseDocument, id: string) =>
  doc.objects.find((o): o is Obstacle => o.id === id)!;

describe('biblioteca', () => {
  it('cada tipo nasce com a quantidade certa de elementos', () => {
    expect(createObstacle('vertical', { x: 0, y: 0 }).elements).toHaveLength(1);
    expect(createObstacle('oxer', { x: 0, y: 0 }).elements).toHaveLength(2);
    expect(createObstacle('triplice', { x: 0, y: 0 }).elements).toHaveLength(3);
  });

  it('vertical não tem largura de salto; oxer tem', () => {
    expect(createObstacle('vertical', { x: 0, y: 0 }).spreadM).toBeNull();
    expect(createObstacle('oxer', { x: 0, y: 0 }).spreadM).toBe(1.5);
  });

  it('sugere o próximo número a partir do maior existente', () => {
    expect(nextObstacleNumber([])).toBe('1');
    const lista = [
      createObstacle('vertical', { x: 0, y: 0 }, '3'),
      createObstacle('vertical', { x: 0, y: 0 }, '7'),
      createObstacle('vertical', { x: 0, y: 0 }, ''),
    ];
    expect(nextObstacleNumber(lista)).toBe('8');
  });
});

describe('numeração e combinação', () => {
  it('aceita qualquer texto, inclusive vazio', () => {
    const o = createObstacle('vertical', { x: 0, y: 0 }, '1');
    let doc = docCom(o);
    doc = edit(doc, (d) => setObstacleNumber(d, o.id, '  10  '));
    expect(obs(doc, o.id).number).toBe('10');
    doc = edit(doc, (d) => setObstacleNumber(d, o.id, ''));
    expect(obs(doc, o.id).number).toBe('');
  });

  it('número mais letra formam o rótulo do croqui', () => {
    const o = createObstacle('oxer', { x: 0, y: 0 }, '4');
    let doc = docCom(o);
    doc = edit(doc, (d) => setObstacleLetter(d, o.id, 'B'));
    expect(obstacleLabel(obs(doc, o.id))).toBe('4b');
  });

  it('renumerar é explícito e segue a ordem de inserção', () => {
    const a = createObstacle('vertical', { x: 0, y: 0 }, '9');
    const b = createObstacle('oxer', { x: 5, y: 0 }, '2');
    let doc = docCom(a, b);
    doc = edit(doc, (d) => renumberByInsertion(d));
    expect(allObstacles(doc).map((o) => o.number)).toEqual(['1', '2']);
  });
});

describe('alturas', () => {
  it('formata como no croqui, com vírgula e hífen ASCII', () => {
    const o = createObstacle('oxer', { x: 0, y: 0 });
    let doc = docCom(o);
    doc = edit(doc, (d) => {
      setElementHeight(d, o.id, 0, 1.53);
      setElementHeight(d, o.id, 1, 1.6);
    });
    expect(formatHeights(obs(doc, o.id))).toBe('1,53-1,60');
    // Travessão e meia-risca somem no PDF (DECISOES, decisão 6).
    expect(formatHeights(obs(doc, o.id))).not.toContain('—');
    expect(formatHeights(obs(doc, o.id))).not.toContain('–');
  });

  it('elemento sem altura simplesmente não aparece', () => {
    const o = createObstacle('triplice', { x: 0, y: 0 });
    let doc = docCom(o);
    doc = edit(doc, (d) => {
      setElementHeight(d, o.id, 1, 1.2);
    });
    expect(formatHeights(obs(doc, o.id))).toBe('1,20');
  });

  it('altura zero ou negativa vira não informada', () => {
    const o = createObstacle('vertical', { x: 0, y: 0 });
    let doc = docCom(o);
    doc = edit(doc, (d) => {
      setElementHeight(d, o.id, 0, 0);
    });
    expect(obs(doc, o.id).elements[0]!.height).toBeNull();
    doc = edit(doc, (d) => {
      setElementHeight(d, o.id, 0, -1);
    });
    expect(obs(doc, o.id).elements[0]!.height).toBeNull();
  });

  it('acrescenta e remove elementos', () => {
    const o = createObstacle('vertical', { x: 0, y: 0 });
    let doc = docCom(o);
    doc = edit(doc, (d) => addElement(d, o.id));
    expect(obs(doc, o.id).elements).toHaveLength(2);
    doc = edit(doc, (d) => removeElement(d, o.id, 0));
    expect(obs(doc, o.id).elements).toHaveLength(1);
  });
});

describe('troca de tipo', () => {
  it('preserva as alturas já digitadas', () => {
    const o = createObstacle('vertical', { x: 0, y: 0 });
    let doc = docCom(o);
    doc = edit(doc, (d) => {
      setElementHeight(d, o.id, 0, 1.4);
    });
    doc = edit(doc, (d) => setObstacleType(d, o.id, 'oxer'));
    const depois = obs(doc, o.id);
    expect(depois.elements).toHaveLength(2);
    expect(depois.elements[0]!.height).toBe(1.4);
    expect(depois.elements[1]!.height).toBeNull();
  });

  it('não repõe a largura de salto já ajustada pelo usuário', () => {
    const o = createObstacle('oxer', { x: 0, y: 0 });
    let doc = docCom(o);
    doc = edit(doc, (d) => setSpread(d, o.id, 1.85));
    doc = edit(doc, (d) => setObstacleType(d, o.id, 'triplice'));
    expect(obs(doc, o.id).spreadM).toBe(1.85);
  });

  it('vertical vira oxer ganhando largura de salto', () => {
    const o = createObstacle('vertical', { x: 0, y: 0 });
    let doc = docCom(o);
    expect(obs(doc, o.id).spreadM).toBeNull();
    doc = edit(doc, (d) => setObstacleType(d, o.id, 'oxer'));
    expect(obs(doc, o.id).spreadM).toBe(1.5);
  });

  it('oxer vira vertical perdendo a largura de salto', () => {
    const o = createObstacle('oxer', { x: 0, y: 0 });
    let doc = docCom(o);
    doc = edit(doc, (d) => setObstacleType(d, o.id, 'vertical'));
    expect(obs(doc, o.id).spreadM).toBeNull();
  });

  it('fitElementsToType corta e completa sem apagar o que existe', () => {
    const cheio = [{ height: 1.1 }, { height: 1.2 }, { height: 1.3 }];
    expect(fitElementsToType(cheio, 'vertical')).toEqual([{ height: 1.1 }]);
    expect(fitElementsToType([{ height: 1.1 }], 'triplice')).toEqual([
      { height: 1.1 },
      { height: null },
      { height: null },
    ]);
  });
});

describe('seta de direção', () => {
  it('inverte sem mexer na rotação do obstáculo', () => {
    const o = createObstacle('vertical', { x: 10, y: 10 });
    let doc = docCom(o);
    doc = edit(doc, (d) => rotateObjects(d, [o.id], 127));
    doc = edit(doc, (d) => flipArrow(d, o.id));
    expect(obs(doc, o.id).arrow.reversed).toBe(true);
    expect(obs(doc, o.id).rotation).toBe(127);
  });

  it('pode ser escondida', () => {
    const o = createObstacle('vertical', { x: 0, y: 0 });
    let doc = docCom(o);
    doc = edit(doc, (d) => setArrow(d, o.id, { visible: false }));
    expect(obs(doc, o.id).arrow.visible).toBe(false);
  });
});

describe('geometria da seta', () => {
  it('é perpendicular à frente: a haste não sai do eixo', () => {
    for (const tipo of ['vertical', 'oxer', 'triplice', 'muro'] as const) {
      const o = createObstacle(tipo, { x: 0, y: 0 });
      const { shaft, head } = arrowGeometry(o, 5);
      expect(shaft.x1).toBe(0);
      expect(shaft.x2).toBe(0);
      // A ponta é simétrica em torno do eixo.
      expect(head[1]!.x).toBe(0);
      expect(head[0]!.x).toBeCloseTo(-head[2]!.x, 12);
    }
  });

  it('aponta para fora do obstáculo, no sentido do salto', () => {
    const o = createObstacle('oxer', { x: 0, y: 0 });
    const g = arrowGeometry(o, 5);
    // Salto para −Y: a ponta fica acima do início da haste.
    expect(g.head[1]!.y).toBeLessThan(g.shaft.y1);
    expect(g.shaft.y1).toBeLessThan(0);
  });

  it('invertida, aponta para o outro lado, com o mesmo comprimento', () => {
    const normal = createObstacle('oxer', { x: 0, y: 0 });
    const invertida = createObstacle('oxer', { x: 0, y: 0 });
    invertida.arrow.reversed = true;
    const a = arrowGeometry(normal, 5);
    const b = arrowGeometry(invertida, 5);
    expect(b.head[1]!.y).toBeGreaterThan(0);
    expect(Math.abs(b.head[1]!.y)).toBeCloseTo(Math.abs(a.head[1]!.y), 12);
  });

  it('começa fora do corpo: um oxer largo empurra a seta para longe', () => {
    const estreito = createObstacle('oxer', { x: 0, y: 0 });
    const largo = createObstacle('oxer', { x: 0, y: 0 });
    largo.spreadM = 4;
    expect(Math.abs(arrowGeometry(largo, 5).shaft.y1)).toBeGreaterThan(
      Math.abs(arrowGeometry(estreito, 5).shaft.y1),
    );
  });
});

describe('paraflanco', () => {
  it('é o suporte padrão: obstáculo novo não nasce com vara solta no chão', () => {
    expect(createObstacle('vertical', { x: 0, y: 0 }).wings.style).toBe('paraflanco');
  });

  it('o obstáculo padrão mede 4 m de frente', () => {
    for (const tipo of ['vertical', 'oxer', 'triplice', 'plano', 'muro'] as const) {
      expect(createObstacle(tipo, { x: 0, y: 0 }).faceWidthM).toBe(4);
    }
  });

  it('acompanha a largura de salto, para o oxer ficar apoiado dos dois lados', () => {
    const vertical = createObstacle('vertical', { x: 0, y: 0 });
    const oxer = createObstacle('oxer', { x: 0, y: 0 });
    const triplice = createObstacle('triplice', { x: 0, y: 0 });
    expect(wingDepth(oxer)).toBeGreaterThan(wingDepth(vertical));
    expect(wingDepth(triplice)).toBeGreaterThan(wingDepth(oxer));
    // Sempre além das varas, nunca aquém.
    expect(wingDepth(oxer)).toBeGreaterThan(oxer.spreadM!);
  });

  it('a vara no chão continua disponível', () => {
    const o = createObstacle('vertical', { x: 0, y: 0 });
    let doc = docCom(o);
    doc = edit(doc, (d) => setWings(d, o.id, { style: 'nenhum' }));
    expect(obs(doc, o.id).wings.style).toBe('nenhum');
  });

  it('recusa dimensão degenerada', () => {
    const o = createObstacle('vertical', { x: 0, y: 0 });
    let doc = docCom(o);
    doc = edit(doc, (d) => setWings(d, o.id, { widthM: 0, depthM: -1 }));
    expect(obs(doc, o.id).wings.widthM).toBe(0.4);
    expect(obs(doc, o.id).wings.depthM).toBe(0.9);
  });
});

describe('estilo das varas', () => {
  it('só os tipos com vara aceitam estilo', () => {
    expect(hasBars('vertical')).toBe(true);
    expect(hasBars('oxer')).toBe(true);
    expect(hasBars('triplice')).toBe(true);
    expect(hasBars('muro')).toBe(false);
  });

  it('guarda estilo e as duas cores', () => {
    const o = createObstacle('oxer', { x: 0, y: 0 });
    let doc = docCom(o);
    doc = edit(doc, (d) =>
      setBarAppearance(d, o.id, { style: 'listrada', color: '#ffffff', accent: '#1565c0' }),
    );
    const bar = obs(doc, o.id).bar;
    expect(bar.style).toBe('listrada');
    expect(bar.accent).toBe('#1565c0');
  });

  it('mantém o número de faixas dentro do que é desenhável', () => {
    const o = createObstacle('vertical', { x: 0, y: 0 });
    let doc = docCom(o);
    doc = edit(doc, (d) => setBarAppearance(d, o.id, { stripes: 0 }));
    expect(obs(doc, o.id).bar.stripes).toBe(2);
    doc = edit(doc, (d) => setBarAppearance(d, o.id, { stripes: 999 }));
    expect(obs(doc, o.id).bar.stripes).toBe(24);
  });
});

describe('liverpool como opção', () => {
  it('nasce 3,00 x 0,50 m, mais estreito que a vara de 4 m', () => {
    const o = createObstacle('vertical', { x: 0, y: 0 });
    expect(o.liverpool.widthM).toBe(3);
    expect(o.liverpool.spreadM).toBe(0.5);
    // As pontas da vara ficam para fora da água.
    expect(o.liverpool.widthM).toBeLessThan(o.faceWidthM);
  });

  it('o comprimento é ajustável, e a extensão acompanha quando ele passa da vara', () => {
    const o = createObstacle('vertical', { x: 0, y: 0 });
    let doc = docCom(o);
    doc = edit(doc, (d) => setLiverpool(d, o.id, { enabled: true, widthM: 5 }));
    expect(obstacleExtent(obs(doc, o.id)).halfWidthM).toBeCloseTo(2.5, 9);
  });

  it('com a lâmina menor que a vara, quem manda na extensão é a vara', () => {
    const o = createObstacle('vertical', { x: 0, y: 0 });
    let doc = docCom(o);
    doc = edit(doc, (d) => setLiverpool(d, o.id, { enabled: true, widthM: 3 }));
    expect(obstacleExtent(obs(doc, o.id)).halfWidthM).toBeCloseTo(2, 9);
  });

  it('deixou de ser um tipo de obstáculo', () => {
    expect(OBSTACLES.map((o) => o.type)).not.toContain('liverpool');
  });

  it('só vertical e oxer aceitam', () => {
    expect(acceptsLiverpool('vertical')).toBe(true);
    expect(acceptsLiverpool('oxer')).toBe(true);
    expect(acceptsLiverpool('triplice')).toBe(false);
    expect(acceptsLiverpool('muro')).toBe(false);
  });

  it('não liga em tipo que não aceita', () => {
    const o = createObstacle('triplice', { x: 0, y: 0 });
    let doc = docCom(o);
    doc = edit(doc, (d) => setLiverpool(d, o.id, { enabled: true }));
    expect(obs(doc, o.id).liverpool.enabled).toBe(false);
  });

  it('desliga sozinho ao trocar para um tipo que não aceita', () => {
    const o = createObstacle('oxer', { x: 0, y: 0 });
    let doc = docCom(o);
    doc = edit(doc, (d) => setLiverpool(d, o.id, { enabled: true }));
    expect(obs(doc, o.id).liverpool.enabled).toBe(true);
    doc = edit(doc, (d) => setObstacleType(d, o.id, 'muro'));
    expect(obs(doc, o.id).liverpool.enabled).toBe(false);
  });

  it('a água entra na extensão do obstáculo, e a envoltória cresce', () => {
    const o = createObstacle('vertical', { x: 0, y: 0 });
    let doc = docCom(o);
    const antes = getBounds(obs(doc, o.id), 250);
    doc = edit(doc, (d) =>
      setLiverpool(d, o.id, { enabled: true, spreadM: 3, offsetM: 0.5, widthM: 4 }),
    );
    const ext = obstacleExtent(obs(doc, o.id));
    expect(ext.frontM).toBeCloseTo(-1, 9); // 0,5 - 3/2
    expect(ext.backM).toBeCloseTo(2, 9); // 0,5 + 3/2
    expect(ext.halfWidthM).toBeCloseTo(2, 9); // a lâmina de 4 m manda
    const depois = getBounds(obs(doc, o.id), 250);
    expect(depois.max.y - depois.min.y).toBeGreaterThan(antes.max.y - antes.min.y);
  });

  it('a seta começa além da água, não em cima dela', () => {
    const seca = createObstacle('vertical', { x: 0, y: 0 });
    const molhada = createObstacle('vertical', { x: 0, y: 0 });
    molhada.liverpool = { enabled: true, widthM: 3, spreadM: 3, offsetM: -1, color: '#2b7fd4' };
    expect(Math.abs(arrowGeometry(molhada, 5).shaft.y1)).toBeGreaterThan(
      Math.abs(arrowGeometry(seca, 5).shaft.y1),
    );
  });
});

describe('posição dos rótulos', () => {
  it('no automático, o número sai do corpo pelo lado', () => {
    const o = createObstacle('oxer', { x: 0, y: 0 }); // frente 3,5 m
    const off = labelOffset(o, 'numberLabel');
    expect(off.x).toBeGreaterThan(3.5 / 2);
    expect(off.y).toBe(0);
  });

  it('o número foge da seta: nunca vai para o lado do salto', () => {
    const o = createObstacle('oxer', { x: 0, y: 0 });
    const off = labelOffset(o, 'numberLabel');
    // A seta sai por −Y; o número não pode estar lá.
    expect(off.y).not.toBeLessThan(0);
  });

  it('obstáculo mais largo empurra o número para mais longe', () => {
    const estreito = createObstacle('vertical', { x: 0, y: 0 });
    const largo = createObstacle('vertical', { x: 0, y: 0 });
    largo.faceWidthM = 8;
    expect(labelOffset(largo, 'numberLabel').x).toBeGreaterThan(
      labelOffset(estreito, 'numberLabel').x,
    );
  });

  it('as alturas ficam atrás, do lado oposto ao salto', () => {
    const o = createObstacle('oxer', { x: 0, y: 0 });
    const off = labelOffset(o, 'heightLabel');
    expect(off.y).toBeGreaterThan(0);
    expect(off.x).toBe(0);
  });

  it('a água desloca as alturas junto', () => {
    const o = createObstacle('oxer', { x: 0, y: 0 });
    const antes = labelOffset(o, 'heightLabel').y;
    o.liverpool = { enabled: true, widthM: 3, spreadM: 3, offsetM: 1.5, color: '#2b7fd4' };
    expect(labelOffset(o, 'heightLabel').y).toBeGreaterThan(antes);
  });

  it('posição manual manda, e volta ao automático quando pedido', () => {
    const o = createObstacle('vertical', { x: 0, y: 0 });
    let doc = docCom(o);
    doc = edit(doc, (d) => setLabelOffset(d, o.id, 'numberLabel', { x: -4, y: -4 }));
    expect(obs(doc, o.id).numberLabel.auto).toBe(false);
    expect(labelOffset(obs(doc, o.id), 'numberLabel')).toEqual({ x: -4, y: -4 });
    doc = edit(doc, (d) => resetLabel(d, o.id, 'numberLabel'));
    expect(labelOffset(obs(doc, o.id), 'numberLabel').x).toBeGreaterThan(0);
  });
});

describe('envoltória', () => {
  it('cobre a frente e a profundidade do paraflanco', () => {
    const o = createObstacle('oxer', { x: 20, y: 10 }); // frente 4, salto 1,5
    const doc = docCom(o);
    const b = getBounds(obs(doc, o.id), 250);
    const prof = wingDepth(obs(doc, o.id));
    expect(b.min.x).toBeCloseTo(20 - 2, 9);
    expect(b.max.x).toBeCloseTo(20 + 2, 9);
    // O paraflanco ultrapassa as varas: é ele quem manda na profundidade.
    expect(b.max.y - b.min.y).toBeCloseTo(prof, 9);
    expect(prof).toBeGreaterThan(1.5);
  });

  it('sem paraflanco, a envoltória volta a ser só as varas', () => {
    const o = createObstacle('oxer', { x: 0, y: 0 });
    let doc = docCom(o);
    doc = edit(doc, (d) => setWings(d, o.id, { style: 'nenhum' }));
    const b = getBounds(obs(doc, o.id), 250);
    expect(b.max.y - b.min.y).toBeCloseTo(1.5, 9);
  });

  it('acompanha a rotação', () => {
    const o = createObstacle('oxer', { x: 0, y: 0 });
    let doc = docCom(o);
    doc = edit(doc, (d) => setWings(d, o.id, { style: 'nenhum' }));
    doc = edit(doc, (d) => rotateObjects(d, [o.id], 90));
    const b = getBounds(obs(doc, o.id), 250);
    // Girado 90°, largura e profundidade trocam de eixo.
    expect(b.max.x - b.min.x).toBeCloseTo(1.5, 6);
    expect(b.max.y - b.min.y).toBeCloseTo(4, 6);
  });
});

describe('obstáculo bloqueado', () => {
  it('não muda nada', () => {
    const o = createObstacle('vertical', { x: 0, y: 0 }, '1');
    o.locked = true;
    const doc = docCom(o);
    const next = edit(doc, (d) => {
      setObstacleNumber(d, o.id, '99');
      setFaceWidth(d, o.id, 10);
      setObstacleType(d, o.id, 'muro');
    });
    expect(obs(next, o.id).number).toBe('1');
    expect(obs(next, o.id).faceWidthM).toBe(4);
    expect(obs(next, o.id).type).toBe('vertical');
  });
});
