import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { distance } from '@core/geometry/vec';
import { createDocument } from '@core/model/document';
import {
  createPath,
  createPathNode,
  pathMidpoint,
  smoothedNodes,
  flattenPath,
  formatDistance,
  legLength,
  legMidpoint,
  legStraightDistance,
  pathD,
  pathLength,
  segmentAt,
} from '@core/model/path';
import { getBounds } from '@core/model/transform';
import type { Vec2 } from '@core/geometry/vec';
import type { CourseDocument, CoursePath } from '@core/model/types';
import { addObject } from './ops';
import {
  addNode,
  insertNode,
  moveHandle,
  moveNode,
  placeAssistantPath,
  removeNode,
  setAllLegLabels,
  setLegLabel,
  setDistanceMode,
  setNodeType,
  setPathStyle,
  sharpenPath,
  smoothPath,
  straightenLeg,
} from './pathOps';

const edit = (doc: CourseDocument, recipe: (d: CourseDocument) => void) => produce(doc, recipe);

function docCom(path: CoursePath): CourseDocument {
  return edit(createDocument(), (d) => addObject(d, path));
}

const get = (doc: CourseDocument, id: string) =>
  doc.objects.find((o): o is CoursePath => o.id === id)!;

const reto = (pontos: Vec2[]) => createPath(pontos.map((p) => createPathNode(p)));

describe('comprimento do traçado', () => {
  it('em linha reta é a soma dos segmentos', () => {
    const p = reto([
      { x: 0, y: 0 },
      { x: 30, y: 40 }, // 50
      { x: 30, y: 60 }, // 20
    ]);
    expect(pathLength(p)).toBeCloseTo(70, 9);
    expect(legLength(p, 0)).toBeCloseTo(50, 9);
    expect(legLength(p, 1)).toBeCloseTo(20, 9);
  });

  it('mede o traçado desenhado, NÃO a distância em linha reta (§19)', () => {
    const p = reto([
      { x: 0, y: 0 },
      { x: 24.5, y: 0 },
    ]);
    expect(legStraightDistance(p, 0)).toBeCloseTo(24.5, 9);
    expect(legLength(p, 0)).toBeCloseTo(24.5, 9);

    // Curvando o trecho, a reta continua 24,50 mas o traçado alonga.
    const curvo = produce(p, (d) => {
      d.nodes[0]!.type = 'smooth';
      d.nodes[0]!.handleOut = { x: 6, y: -9 };
      d.nodes[1]!.handleIn = { x: -6, y: -9 };
    });
    expect(legStraightDistance(curvo, 0)).toBeCloseTo(24.5, 9);
    expect(legLength(curvo, 0)).toBeGreaterThan(24.5);
    // É este o número que vai para o croqui.
    expect(formatDistance(legLength(curvo, 0))).not.toBe('24,50');
  });

  it('curvar um trecho aumenta o total, sem mexer nos outros', () => {
    const p = reto([
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 40, y: 0 },
    ]);
    const antes = { total: pathLength(p), segundo: legLength(p, 1) };
    const curvo = produce(p, (d) => {
      d.nodes[0]!.handleOut = { x: 5, y: 8 };
      d.nodes[1]!.handleIn = { x: -5, y: 8 };
    });
    expect(pathLength(curvo)).toBeGreaterThan(antes.total);
    expect(legLength(curvo, 1)).toBeCloseTo(antes.segundo, 9);
  });

  it('traçado de um nó só não tem comprimento', () => {
    expect(pathLength(createPath([createPathNode({ x: 0, y: 0 })]))).toBe(0);
  });

  it('formata com vírgula, como o croqui', () => {
    expect(formatDistance(27.8)).toBe('27,80');
    expect(formatDistance(27.8, 1)).toBe('27,8');
  });
});

describe('nós', () => {
  it('acrescenta nó e o trecho correspondente', () => {
    const p = reto([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ]);
    let doc = docCom(p);
    doc = edit(doc, (d) => addNode(d, p.id, { x: 20, y: 0 }));
    expect(get(doc, p.id).nodes).toHaveLength(3);
    expect(get(doc, p.id).legs).toHaveLength(2);
  });

  it('insere no meio sem mover as pontas', () => {
    const p = reto([
      { x: 0, y: 0 },
      { x: 20, y: 0 },
    ]);
    let doc = docCom(p);
    doc = edit(doc, (d) => {
      insertNode(d, p.id, 0, { x: 10, y: 5 });
    });
    const depois = get(doc, p.id);
    expect(depois.nodes).toHaveLength(3);
    expect(depois.nodes[0]!.pos).toEqual({ x: 0, y: 0 });
    expect(depois.nodes[2]!.pos).toEqual({ x: 20, y: 0 });
    expect(depois.nodes[1]!.pos).toEqual({ x: 10, y: 5 });
  });

  it('preserva os rótulos já ajustados ao inserir', () => {
    const p = reto([
      { x: 0, y: 0 },
      { x: 20, y: 0 },
    ]);
    let doc = docCom(p);
    doc = edit(doc, (d) => setLegLabel(d, p.id, 0, { decimals: 1, visible: false }));
    doc = edit(doc, (d) => {
      insertNode(d, p.id, 0, { x: 10, y: 0 });
    });
    expect(get(doc, p.id).legs[0]!.label.decimals).toBe(1);
    expect(get(doc, p.id).legs[0]!.label.visible).toBe(false);
  });

  it('não deixa o traçado ficar com menos de dois nós', () => {
    const p = reto([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ]);
    let doc = docCom(p);
    doc = edit(doc, (d) => {
      removeNode(d, p.id, 0);
    });
    expect(get(doc, p.id).nodes).toHaveLength(2);
  });

  it('mover um nó desfaz o vínculo com o obstáculo', () => {
    const p = reto([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ]);
    p.nodes[0]!.anchor = { objectId: 'obs1', ref: 'center' };
    let doc = docCom(p);
    doc = edit(doc, (d) => moveNode(d, p.id, 0, { x: 1, y: 1 }));
    expect(get(doc, p.id).nodes[0]!.anchor).toBeNull();
  });
});

describe('curvas', () => {
  it('nó liso mantém as alças opostas, sem bico', () => {
    const p = reto([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 20, y: 0 },
    ]);
    let doc = docCom(p);
    doc = edit(doc, (d) => setNodeType(d, p.id, 1, 'smooth'));
    doc = edit(doc, (d) => moveHandle(d, p.id, 1, 'out', { x: 3, y: 4 }));
    const no = get(doc, p.id).nodes[1]!;
    expect(no.handleOut).toEqual({ x: 3, y: 4 });
    // A oposta aponta exatamente ao contrário: colinear, sem bico. O
    // produto vetorial zerado é a forma direta de dizer isso.
    const cruzado = no.handleIn!.x * no.handleOut!.y - no.handleIn!.y * no.handleOut!.x;
    expect(Math.abs(cruzado)).toBeLessThan(1e-12);
    expect(no.handleIn!.x * no.handleOut!.x + no.handleIn!.y * no.handleOut!.y).toBeLessThan(0);
  });

  it('nó de canto move só a alça mexida', () => {
    const p = reto([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 20, y: 0 },
    ]);
    let doc = docCom(p);
    doc = edit(doc, (d) => moveHandle(d, p.id, 1, 'out', { x: 3, y: 4 }));
    const no = get(doc, p.id).nodes[1]!;
    expect(no.handleOut).toEqual({ x: 3, y: 4 });
    expect(no.handleIn).toBeNull();
  });

  it('voltar para canto remove as alças e endireita', () => {
    const p = reto([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 20, y: 0 },
    ]);
    let doc = docCom(p);
    doc = edit(doc, (d) => setNodeType(d, p.id, 1, 'smooth'));
    doc = edit(doc, (d) => moveHandle(d, p.id, 1, 'out', { x: 0, y: 8 }));
    const curvo = pathLength(get(doc, p.id));
    doc = edit(doc, (d) => setNodeType(d, p.id, 1, 'corner'));
    expect(pathLength(get(doc, p.id))).toBeLessThan(curvo);
    expect(pathLength(get(doc, p.id))).toBeCloseTo(20, 9);
  });

  it('endireitar um trecho não mexe nos vizinhos', () => {
    const p = reto([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 20, y: 0 },
    ]);
    let doc = docCom(p);
    doc = edit(doc, (d) => {
      moveHandle(d, p.id, 0, 'out', { x: 3, y: 6 });
      moveHandle(d, p.id, 1, 'out', { x: 3, y: -6 });
    });
    const segundoAntes = legLength(get(doc, p.id), 1);
    doc = edit(doc, (d) => straightenLeg(d, p.id, 0));
    expect(legLength(get(doc, p.id), 0)).toBeCloseTo(10, 9);
    expect(legLength(get(doc, p.id), 1)).toBeCloseTo(segundoAntes, 9);
  });
});

describe('suavizar a poligonal de cliques', () => {
  /** Ângulo entre a chegada e a saída de um nó: 0 = sem bico. */
  function quebraNoNo(p: CoursePath, i: number): number {
    const antes = segmentAt(p, i - 1)!;
    const depois = segmentAt(p, i)!;
    // Em trecho reto os controles caem sobre as pontas: a direção é a da
    // própria corda, e não a diferença entre controle e ponta (que é zero).
    const naoNulo = (v: { x: number; y: number }, alt: { x: number; y: number }) =>
      Math.hypot(v.x, v.y) > 1e-12 ? v : alt;
    const chega = naoNulo(
      { x: antes.p3.x - antes.p2.x, y: antes.p3.y - antes.p2.y },
      { x: antes.p3.x - antes.p0.x, y: antes.p3.y - antes.p0.y },
    );
    const sai = naoNulo(
      { x: depois.p1.x - depois.p0.x, y: depois.p1.y - depois.p0.y },
      { x: depois.p3.x - depois.p0.x, y: depois.p3.y - depois.p0.y },
    );
    const cos =
      (chega.x * sai.x + chega.y * sai.y) /
      (Math.hypot(chega.x, chega.y) * Math.hypot(sai.x, sai.y));
    return Math.acos(Math.min(1, Math.max(-1, cos)));
  }

  const emL = () =>
    reto([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 20, y: 10 },
    ]);

  it('os nós continuam exatamente onde estavam', () => {
    const antes = emL();
    const depois = createPath(smoothedNodes(antes.nodes));
    expect(depois.nodes.map((n) => n.pos)).toEqual(antes.nodes.map((n) => n.pos));
  });

  it('o traçado deixa de ter bico nos nós internos', () => {
    const anguloso = emL();
    // Em canto vivo, a quebra é grande.
    expect(quebraNoNo(anguloso, 1)).toBeGreaterThan(1);

    const suave = createPath(smoothedNodes(anguloso.nodes));
    expect(quebraNoNo(suave, 1)).toBeLessThan(1e-9);
    expect(quebraNoNo(suave, 2)).toBeLessThan(1e-9);
  });

  it('a curva é mais longa que a poligonal, e por pouco', () => {
    const anguloso = emL();
    const suave = createPath(smoothedNodes(anguloso.nodes));
    const reta = pathLength(anguloso);
    const curva = pathLength(suave);
    expect(curva).toBeGreaterThan(reta);
    // Corta os cantos e arqueia os trechos: fica perto, não disparado.
    expect(curva).toBeLessThan(reta * 1.15);
  });

  it('as pontas ficam sem alça para fora, então o traçado não passa delas', () => {
    const suave = createPath(smoothedNodes(emL().nodes));
    expect(suave.nodes[0]!.handleIn).toBeNull();
    expect(suave.nodes[suave.nodes.length - 1]!.handleOut).toBeNull();
  });

  it('todos os nós viram lisos', () => {
    const suave = createPath(smoothedNodes(emL().nodes));
    expect(suave.nodes.every((n) => n.type === 'smooth')).toBe(true);
  });

  it('tensão menor encurta as alças e aproxima da poligonal', () => {
    const base = emL();
    const solto = createPath(smoothedNodes(base.nodes, 1));
    const firme = createPath(smoothedNodes(base.nodes, 0.4));
    expect(pathLength(firme)).toBeLessThan(pathLength(solto));
    expect(pathLength(firme)).toBeGreaterThan(pathLength(base) * 0.9);
  });

  it('suavizar e endireitar são reversíveis', () => {
    const p = emL();
    let doc = docCom(p);
    doc = edit(doc, (d) => smoothPath(d, p.id));
    expect(get(doc, p.id).nodes.every((n) => n.type === 'smooth')).toBe(true);
    doc = edit(doc, (d) => sharpenPath(d, p.id));
    expect(get(doc, p.id).nodes.every((n) => n.type === 'corner')).toBe(true);
    expect(pathLength(get(doc, p.id))).toBeCloseTo(pathLength(p), 9);
  });

  it('dois nós: suavizar não inventa curva onde não há para onde curvar', () => {
    const p = reto([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ]);
    const suave = createPath(smoothedNodes(p.nodes));
    expect(pathLength(suave)).toBeCloseTo(10, 9);
  });
});

describe('uma distância por linha', () => {
  const tresNos = () =>
    reto([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 20, y: 0 },
    ]);

  it('traçado novo mostra só o total, não um número por trecho', () => {
    expect(tresNos().distanceMode).toBe('total');
  });

  it('o total é a soma dos trechos', () => {
    const p = tresNos();
    expect(pathLength(p)).toBeCloseTo(legLength(p, 0) + legLength(p, 1), 9);
  });

  it('o rótulo total fica no meio do percurso, medido em comprimento', () => {
    const p = reto([
      { x: 0, y: 0 },
      { x: 30, y: 0 },
      { x: 40, y: 0 },
    ]);
    // Metade de 40 m cai a 20 m do início, dentro do primeiro trecho.
    // A precisão vem da tolerância de medição: décimo de milímetro basta
    // de sobra para posicionar um rótulo.
    expect(pathMidpoint(p).x).toBeCloseTo(20, 4);
  });

  it('em curva, o meio segue o comprimento, não a média dos nós', () => {
    const p = reto([
      { x: 0, y: 0 },
      { x: 20, y: 0 },
    ]);
    const curvo = produce(p, (d) => {
      d.nodes[0]!.handleOut = { x: 0, y: 14 };
      d.nodes[1]!.handleIn = { x: 0, y: 14 };
    });
    const meio = pathMidpoint(curvo);
    expect(meio.x).toBeCloseTo(10, 3);
    expect(meio.y).toBeGreaterThan(5); // sobre a curva, não na reta
  });

  it('dá para voltar ao número por trecho, ou tirar tudo', () => {
    const p = tresNos();
    let doc = docCom(p);
    doc = edit(doc, (d) => setDistanceMode(d, p.id, 'trecho'));
    expect(get(doc, p.id).distanceMode).toBe('trecho');
    doc = edit(doc, (d) => setDistanceMode(d, p.id, 'nenhum'));
    expect(get(doc, p.id).distanceMode).toBe('nenhum');
  });
});

describe('desenho e envoltória', () => {
  it('o caminho SVG começa em M e usa cúbicas', () => {
    const p = reto([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ]);
    const d = pathD(p, (q) => ({ x: q.x * 5, y: q.y * 5 }));
    expect(d.startsWith('M 0 0')).toBe(true);
    expect(d).toContain('C ');
  });

  it('a envoltória cobre a curva, não só os nós', () => {
    const p = reto([
      { x: 0, y: 0 },
      { x: 20, y: 0 },
    ]);
    const curvo = produce(p, (d) => {
      d.nodes[0]!.handleOut = { x: 0, y: 12 };
      d.nodes[1]!.handleIn = { x: 0, y: 12 };
    });
    const b = getBounds(curvo, 250);
    // Os nós têm y = 0, mas a curva desce bem abaixo disso.
    expect(b.max.y).toBeGreaterThan(3);
  });

  it('o ponto médio do trecho fica sobre a curva', () => {
    const p = reto([
      { x: 0, y: 0 },
      { x: 20, y: 0 },
    ]);
    const curvo = produce(p, (d) => {
      d.nodes[0]!.handleOut = { x: 0, y: 10 };
      d.nodes[1]!.handleIn = { x: 0, y: 10 };
    });
    const meio = legMidpoint(curvo, 0);
    expect(meio.x).toBeCloseTo(10, 6);
    expect(meio.y).toBeGreaterThan(0);
  });

  it('a poligonal acompanha o traçado inteiro', () => {
    const p = reto([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 20, y: 0 },
    ]);
    const pontos = flattenPath(p);
    expect(pontos[0]).toEqual({ x: 0, y: 0 });
    expect(pontos[pontos.length - 1]).toEqual({ x: 20, y: 0 });
  });

  it('trecho sem alça é reta exata, não cúbica aproximada', () => {
    const p = reto([
      { x: 0, y: 0 },
      { x: 3, y: 4 },
    ]);
    const seg = segmentAt(p, 0)!;
    expect(seg.p1).toEqual(seg.p0);
    expect(seg.p2).toEqual(seg.p3);
    expect(legLength(p, 0)).toBe(distance({ x: 0, y: 0 }, { x: 3, y: 4 }));
  });
});

describe('rótulos e estilo', () => {
  it('liga e desliga todos os rótulos de uma vez', () => {
    const p = reto([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 20, y: 0 },
    ]);
    let doc = docCom(p);
    doc = edit(doc, (d) => setAllLegLabels(d, p.id, false));
    expect(get(doc, p.id).legs.every((l) => !l.label.visible)).toBe(true);
    doc = edit(doc, (d) => setAllLegLabels(d, p.id, true));
    expect(get(doc, p.id).legs.every((l) => l.label.visible)).toBe(true);
  });

  it('casas decimais ficam dentro do que faz sentido medir', () => {
    const p = reto([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ]);
    let doc = docCom(p);
    doc = edit(doc, (d) => setLegLabel(d, p.id, 0, { decimals: 9 }));
    expect(get(doc, p.id).legs[0]!.label.decimals).toBe(3);
    doc = edit(doc, (d) => setLegLabel(d, p.id, 0, { decimals: -2 }));
    expect(get(doc, p.id).legs[0]!.label.decimals).toBe(0);
  });

  it('nasce tracejado, como no croqui profissional', () => {
    expect(reto([{ x: 0, y: 0 }, { x: 1, y: 0 }]).style.dash).toBe('dashed');
  });

  it('espessura degenerada volta ao padrão', () => {
    const p = reto([{ x: 0, y: 0 }, { x: 10, y: 0 }]);
    let doc = docCom(p);
    doc = edit(doc, (d) => setPathStyle(d, p.id, { strokeMm: 0 }));
    expect(get(doc, p.id).style.strokeMm).toBe(0.4);
  });

  it('traçado bloqueado não muda', () => {
    const p = reto([{ x: 0, y: 0 }, { x: 10, y: 0 }]);
    p.locked = true;
    const doc = docCom(p);
    const next = edit(doc, (d) => {
      moveNode(d, p.id, 0, { x: 99, y: 99 });
      addNode(d, p.id, { x: 50, y: 50 });
    });
    expect(get(next, p.id).nodes).toHaveLength(2);
    expect(get(next, p.id).nodes[0]!.pos).toEqual({ x: 0, y: 0 });
  });
});

describe('assistente substitui o próprio traçado (B-04)', () => {
  const traco = (x: number) =>
    createPath([createPathNode({ x, y: 0 }, 'corner'), createPathNode({ x: x + 10, y: 0 }, 'corner')]);

  it('rodar duas vezes deixa um traçado só, com a apresentação do anterior', () => {
    let doc = edit(createDocument({ arena: true }), (d) => placeAssistantPath(d, traco(0)));
    const primeiro = doc.objects.find((o) => o.kind === 'path') as CoursePath;
    doc = edit(doc, (d) => {
      const p = d.objects.find((o) => o.id === primeiro.id) as CoursePath;
      p.distanceMode = 'trecho';
      p.obstacleDistances = { 'a>b': true };
    });
    doc = edit(doc, (d) => placeAssistantPath(d, traco(5)));
    const tracados = doc.objects.filter((o): o is CoursePath => o.kind === 'path');
    expect(tracados).toHaveLength(1);
    expect(tracados[0]!.nodes[0]!.pos.x).toBe(5);
    expect(tracados[0]!.distanceMode).toBe('trecho');
    expect(tracados[0]!.obstacleDistances).toEqual({ 'a>b': true });
  });

  it('não mexe no traçado desenhado à mão', () => {
    let doc = edit(createDocument({ arena: true }), (d) => addObject(d, traco(0)));
    doc = edit(doc, (d) => placeAssistantPath(d, traco(5)));
    doc = edit(doc, (d) => placeAssistantPath(d, traco(9)));
    expect(doc.objects.filter((o) => o.kind === 'path')).toHaveLength(2);
  });
});
