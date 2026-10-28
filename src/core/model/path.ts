import type { Cubic } from '@core/geometry/bezier';
import {
  closestPointOnCubic,
  cubicLength,
  cubicPoint,
  cubicSplit,
  flattenCubic,
} from '@core/geometry/bezier';
import { add, distance, type Vec2 } from '@core/geometry/vec';
import { newId } from '@core/model/ids';
import { formatDecimal } from '@core/i18n/i18n';
import type { CoursePath, PathNode } from './types';

/**
 * Geometria do traçado.
 *
 * O comprimento medido é sempre o do traçado EFETIVAMENTE desenhado, nunca
 * a distância em linha reta entre os obstáculos (§19). É a diferença entre
 * dizer 24,50 m e dizer 27,80 m, e a segunda é a que o desenhador precisa.
 */

export function createPathNode(pos: Vec2, type: PathNode['type'] = 'corner'): PathNode {
  return { pos, type, handleIn: null, handleOut: null, anchor: null };
}

const distanceLabel = (offsetY: number) => ({
  visible: true,
  offsetM: { x: 0, y: offsetY },
  decimals: 2,
  color: '#d32020',
});

export function createPath(nodes: PathNode[]): CoursePath {
  return {
    id: newId('pth'),
    kind: 'path',
    layer: 'paths',
    locked: false,
    visible: true,
    scope: 'percurso',
    z: 0,
    nodes,
    legs: legsFor(nodes.length),
    // Um número por linha, como no croqui impresso. Distância por trecho
    // só faz sentido em traçado de poucos nós, e polui o desenho quando a
    // curva foi feita com muitos cliques.
    distanceMode: 'total',
    totalLabel: distanceLabel(-1.5),
    style: { dash: 'dashed', strokeMm: 0.4, color: '#333333' },
    obstacleDistances: {},
  };
}

/**
 * Suaviza a poligonal, transformando os nós clicados numa curva contínua
 * que passa por todos eles (Catmull-Rom em forma de Bézier).
 *
 * É a resposta ao traçado "bêbado": clicar ponto a ponto produz cantos, e
 * o desenhador quer a linha de percurso, que é curva. As posições NÃO
 * mudam — só ganham tangentes coerentes com os vizinhos.
 */
export function smoothedNodes(nodes: PathNode[], tension = 1): PathNode[] {
  const n = nodes.length;
  if (n < 2) return nodes;

  const pos = (i: number): Vec2 => {
    // Pontas refletidas: dá tangente natural ao primeiro e ao último nó.
    if (i < 0) {
      const a = nodes[0]!.pos;
      const b = nodes[1]!.pos;
      return { x: 2 * a.x - b.x, y: 2 * a.y - b.y };
    }
    if (i > n - 1) {
      const a = nodes[n - 1]!.pos;
      const b = nodes[n - 2]!.pos;
      return { x: 2 * a.x - b.x, y: 2 * a.y - b.y };
    }
    return nodes[i]!.pos;
  };

  return nodes.map((node, i) => {
    const anterior = pos(i - 1);
    const proximo = pos(i + 1);
    const t: Vec2 = {
      x: ((proximo.x - anterior.x) / 6) * tension,
      y: ((proximo.y - anterior.y) / 6) * tension,
    };
    return {
      ...node,
      type: 'smooth' as const,
      handleOut: i === n - 1 ? null : t,
      handleIn: i === 0 ? null : { x: -t.x, y: -t.y },
    };
  });
}

/** Ponto a uma distância percorrida ao longo do traçado. */
export function pointAtLength(path: CoursePath, s: number): Vec2 {
  const segs = segments(path);
  if (segs.length === 0) return path.nodes[0]?.pos ?? { x: 0, y: 0 };

  let restante = Math.max(0, s);
  for (const seg of segs) {
    const comprimento = cubicLength(seg);
    if (restante <= comprimento) {
      // Busca binária no parâmetro: comprimento não é linear em t.
      let baixo = 0;
      let alto = 1;
      for (let i = 0; i < 24; i += 1) {
        const meio = (baixo + alto) / 2;
        const [inicio] = cubicSplit(seg, meio);
        if (cubicLength(inicio) < restante) baixo = meio;
        else alto = meio;
      }
      return cubicPoint(seg, (baixo + alto) / 2);
    }
    restante -= comprimento;
  }
  return path.nodes[path.nodes.length - 1]!.pos;
}

/** Meio do traçado medido em comprimento — onde o rótulo total se ancora. */
export const pathMidpoint = (path: CoursePath): Vec2 =>
  pointAtLength(path, pathLength(path) / 2);

/** Um trecho medido por par de nós consecutivos. */
export function legsFor(nodeCount: number): CoursePath['legs'] {
  return Array.from({ length: Math.max(0, nodeCount - 1) }, (_, i) => ({
    fromNode: i,
    toNode: i + 1,
    label: {
      visible: true,
      offsetM: { x: 0, y: -1.2 },
      decimals: 2,
      color: '#d32020',
    },
  }));
}

/**
 * Cúbica de um trecho. Alça ausente vira ponto de controle sobre o próprio
 * nó, o que degenera a cúbica em reta — e o comprimento sai exato.
 */
export function segmentAt(path: CoursePath, index: number): Cubic | null {
  const a = path.nodes[index];
  const b = path.nodes[index + 1];
  if (!a || !b) return null;
  return {
    p0: a.pos,
    p1: a.handleOut ? add(a.pos, a.handleOut) : a.pos,
    p2: b.handleIn ? add(b.pos, b.handleIn) : b.pos,
    p3: b.pos,
  };
}

export function segments(path: CoursePath): Cubic[] {
  const out: Cubic[] = [];
  for (let i = 0; i < path.nodes.length - 1; i += 1) {
    const seg = segmentAt(path, i);
    if (seg) out.push(seg);
  }
  return out;
}

/** Comprimento de um trecho, em metros. */
export function legLength(path: CoursePath, index: number): number {
  const seg = segmentAt(path, index);
  return seg ? cubicLength(seg) : 0;
}

/** Comprimento total do traçado desenhado. */
export function pathLength(path: CoursePath): number {
  return segments(path).reduce((total, seg) => total + cubicLength(seg), 0);
}

/**
 * Distância em linha reta entre as pontas do trecho. Só existe para
 * comparação: não é o que o croqui mostra.
 */
export function legStraightDistance(path: CoursePath, index: number): number {
  const a = path.nodes[index];
  const b = path.nodes[index + 1];
  return a && b ? distance(a.pos, b.pos) : 0;
}

/** Ponto médio do trecho, onde o rótulo de distância se ancora. */
export function legMidpoint(path: CoursePath, index: number): Vec2 {
  const seg = segmentAt(path, index);
  return seg ? cubicPoint(seg, 0.5) : { x: 0, y: 0 };
}

/** Caminho SVG, com `project` levando de metros ao espaço de saída. */
export function pathD(path: CoursePath, project: (p: Vec2) => Vec2): string {
  if (path.nodes.length === 0) return '';
  const primeiro = project(path.nodes[0]!.pos);
  const partes = [`M ${fmt(primeiro)}`];

  for (let i = 0; i < path.nodes.length - 1; i += 1) {
    const seg = segmentAt(path, i)!;
    partes.push(
      `C ${fmt(project(seg.p1))} ${fmt(project(seg.p2))} ${fmt(project(seg.p3))}`,
    );
  }
  return partes.join(' ');
}

/** Poligonal do traçado inteiro — teste de clique e interferência. */
export function flattenPath(path: CoursePath, toleranceM = 0.01): Vec2[] {
  const pontos: Vec2[] = [];
  for (const seg of segments(path)) {
    const parcial = flattenCubic(seg, toleranceM);
    if (pontos.length === 0) pontos.push(...parcial);
    else pontos.push(...parcial.slice(1));
  }
  return pontos;
}

/** Trecho mais próximo de um ponto — usado para clicar no traçado. */
export function closestOnPath(
  path: CoursePath,
  target: Vec2,
): { legIndex: number; point: Vec2; distance: number } | null {
  let melhor: { legIndex: number; point: Vec2; distance: number } | null = null;
  segments(path).forEach((seg, i) => {
    const p = closestPointOnCubic(seg, target);
    if (!melhor || p.distance < melhor.distance) {
      melhor = { legIndex: i, point: p.point, distance: p.distance };
    }
  });
  return melhor;
}

/** Distância formatada como no croqui, com o separador decimal da língua. */
export function formatDistance(meters: number, decimals = 2): string {
  return formatDecimal(meters, decimals);
}

const fmt = (p: Vec2): string => `${round(p.x)} ${round(p.y)}`;
const round = (v: number): number => Math.round(v * 1000) / 1000;
