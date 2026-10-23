import type { Vec2 } from '@core/geometry/vec';
import { newId } from '@core/model/ids';
import type { Obstacle, ObstacleElement, ObstacleType } from '@core/model/types';

/**
 * Biblioteca de obstáculos.
 *
 * Sistema local do obstáculo: o eixo X corre ao longo da frente (a
 * largura da barra) e o eixo Y corre na profundidade. A direção do salto é
 * o −Y local, ou seja, com rotação 0 o cavalo salta "para cima" na tela.
 * A seta e todos os elementos seguem essa convenção — mudá-la depois
 * exigiria revisar cada símbolo.
 */

export interface ObstacleDef {
  type: ObstacleType;
  label: string;
  /** Largura da frente, em metros. */
  faceWidthM: number;
  /** Profundidade real; `null` quando o obstáculo não tem largura de salto. */
  spreadM: number | null;
  /** Quantas varas/elementos o obstáculo tem por padrão. */
  elements: number;
  hint: string;
}

export const OBSTACLES: readonly ObstacleDef[] = [
  {
    type: 'vertical',
    label: 'Vertical',
    faceWidthM: 4,
    spreadM: null,
    elements: 1,
    hint: 'Uma única linha de varas, sem largura.',
  },
  {
    type: 'oxer',
    label: 'Oxer',
    faceWidthM: 4,
    spreadM: 1.5,
    elements: 2,
    hint: 'Duas linhas de varas, com largura entre elas.',
  },
  {
    type: 'triplice',
    label: 'Tríplice',
    faceWidthM: 4,
    spreadM: 2.2,
    elements: 3,
    hint: 'Três linhas em altura crescente.',
  },
  {
    type: 'muro',
    label: 'Muro',
    faceWidthM: 4,
    spreadM: 0.6,
    elements: 1,
    hint: 'Bloco maciço.',
  },
  {
    type: 'plano',
    label: 'Plano',
    faceWidthM: 4,
    spreadM: null,
    elements: 1,
    hint: 'Obstáculo raso, de uma linha só.',
  },
] as const;

/** Tipos desenhados com vara — os únicos em que o estilo da vara importa. */
export const BAR_TYPES: readonly ObstacleType[] = ['vertical', 'oxer', 'triplice', 'plano'];

export const hasBars = (type: ObstacleType): boolean => BAR_TYPES.includes(type);

/** O liverpool só faz sentido acoplado a um vertical ou a um oxer. */
export const LIVERPOOL_TYPES: readonly ObstacleType[] = ['vertical', 'oxer'];

export const acceptsLiverpool = (type: ObstacleType): boolean =>
  LIVERPOOL_TYPES.includes(type);

export const obstacleDef = (type: ObstacleType): ObstacleDef =>
  OBSTACLES.find((o) => o.type === type) ?? OBSTACLES[0]!;

const emptyElements = (n: number): ObstacleElement[] =>
  Array.from({ length: n }, () => ({ height: null }));

export function createObstacle(type: ObstacleType, pos: Vec2, numero = ''): Obstacle {
  const def = obstacleDef(type);
  return {
    id: newId('obs'),
    kind: 'obstacle',
    layer: 'obstacles',
    locked: false,
    visible: true,
    scope: 'percurso',
    z: 0,
    type,
    pos,
    rotation: 0,
    faceWidthM: def.faceWidthM,
    spreadM: def.spreadM,
    number: numero,
    letter: '',
    elements: emptyElements(def.elements),
    bar: { style: 'pontas', color: '#ffffff', accent: '#c62828', stripes: 6 },
    wings: { style: 'paraflanco', widthM: 0.4, depthM: 0.9, color: '#2e7d32' },
    liverpool: {
      enabled: false,
      // 3 x 0,50 m: mais estreito que a vara de 3,50 m, de modo que as
      // pontas dela ficam para fora da água, como na pista.
      widthM: 3,
      spreadM: 0.5,
      offsetM: 0,
      color: '#2b7fd4',
    },
    arrow: { visible: true, reversed: false, lengthMm: 6 },
    heightLabel: { visible: true, auto: true, offsetM: { x: 0, y: 0 } },
    numberLabel: { visible: true, auto: true, offsetM: { x: 0, y: 0 } },
    note: '',
  };
}

/**
 * Ajusta a quantidade de elementos ao trocar de tipo, preservando as
 * alturas já informadas — trocar vertical por oxer não pode apagar a
 * altura que o desenhador acabou de digitar.
 */
export function fitElementsToType(
  elements: ObstacleElement[],
  type: ObstacleType,
): ObstacleElement[] {
  const alvo = obstacleDef(type).elements;
  if (elements.length === alvo) return elements;
  if (elements.length > alvo) return elements.slice(0, alvo);
  return [...elements, ...emptyElements(alvo - elements.length)];
}

/** Rótulo de alturas do croqui: "1,20" ou "1,53-1,60". */
export function formatHeights(obstacle: Obstacle): string {
  const alturas = obstacle.elements
    .map((e) => e.height)
    .filter((h): h is number => h !== null && Number.isFinite(h));
  if (alturas.length === 0) return '';
  // Hífen ASCII: travessão e meia-risca somem no PDF (DECISOES, decisão 6).
  return alturas.map((h) => h.toFixed(2).replace('.', ',')).join('-');
}

/** Identificação completa: "7", "10A", "" quando sem número (letra em maiúscula, B-67). */
export function obstacleLabel(obstacle: Obstacle): string {
  return `${obstacle.number}${obstacle.letter.toUpperCase()}`;
}

/**
 * Extensão do corpo no sistema local, em METROS, já contando a lâmina de
 * água quando existe. É a base de tudo o que precisa ficar fora do
 * obstáculo: a seta, os rótulos e a envoltória.
 */
export interface ObstacleExtent {
  halfWidthM: number;
  /** Limites na profundidade. `front` é o lado para onde o cavalo salta. */
  frontM: number;
  backM: number;
}

export function obstacleExtent(obstacle: Obstacle): ObstacleExtent {
  const half = obstacle.faceWidthM / 2;
  const spread = (obstacle.spreadM ?? 0) / 2;
  let frontM = -spread;
  let backM = spread;
  let halfWidthM = half;

  if (obstacle.liverpool.enabled) {
    const meia = obstacle.liverpool.spreadM / 2;
    frontM = Math.min(frontM, obstacle.liverpool.offsetM - meia);
    backM = Math.max(backM, obstacle.liverpool.offsetM + meia);
    // A lâmina costuma ser mais estreita que a vara, mas nada impede o
    // contrário: quem for maior manda na extensão.
    halfWidthM = Math.max(halfWidthM, obstacle.liverpool.widthM / 2);
  }

  if (obstacle.wings.style === 'paraflanco') {
    const meia = wingDepth(obstacle) / 2;
    frontM = Math.min(frontM, -meia);
    backM = Math.max(backM, meia);
  }
  return { halfWidthM, frontM, backM };
}

/**
 * Profundidade do paraflanco: acompanha a largura de salto, para o oxer
 * ter os dois lados apoiados, com um mínimo para o vertical não ficar com
 * um pilar raso demais para se ver.
 */
export function wingDepth(obstacle: Obstacle): number {
  return Math.max(obstacle.wings.depthM, (obstacle.spreadM ?? 0) + obstacle.wings.depthM * 0.5);
}

/**
 * Posição do rótulo no sistema LOCAL, em metros.
 *
 * No automático o número vai para o lado e as alturas para trás — nunca
 * para a frente, que é por onde a seta sai. É o que impede o número de
 * ficar encoberto pelo desenho ou pela seta em obstáculo largo ou
 * inclinado.
 */
export function labelOffset(
  obstacle: Obstacle,
  which: 'numberLabel' | 'heightLabel',
): Vec2 {
  const label = obstacle[which];
  if (!label.auto) return label.offsetM;

  const ext = obstacleExtent(obstacle);
  const folga = 1.3;
  return which === 'numberLabel'
    ? { x: ext.halfWidthM + folga, y: 0 }
    : { x: 0, y: ext.backM + folga };
}

/**
 * Geometria da seta de direção, em milímetros de papel, no sistema local
 * do obstáculo. Fica aqui, e não no componente, para poder ser testada: a
 * exigência do §16 é que a seta seja perpendicular à frente e centrada, e
 * isso é uma afirmação sobre números, não sobre pixels.
 */
export interface ArrowGeometry {
  shaft: { x1: number; y1: number; x2: number; y2: number };
  /** Três pontos da ponta, em ordem de traçado. */
  head: [Vec2, Vec2, Vec2];
}

export function arrowGeometry(obstacle: Obstacle, k: number): ArrowGeometry {
  const { lengthMm, reversed } = obstacle.arrow;
  const ext = obstacleExtent(obstacle);
  const dir = reversed ? 1 : -1;

  // Começa logo além do corpo — inclusive da lâmina de água, quando há.
  const borda = (dir < 0 ? -ext.frontM : ext.backM) * k;
  const from = dir * (borda + 1);
  const to = from + dir * lengthMm;
  const head = lengthMm * 0.42;
  const base = to - dir * head;

  return {
    shaft: { x1: 0, y1: from, x2: 0, y2: to - dir * head * 0.8 },
    head: [
      { x: -head * 0.45, y: base },
      { x: 0, y: to },
      { x: head * 0.45, y: base },
    ],
  };
}

/** Próximo número livre, para a inserção não nascer sempre em branco. */
export function nextObstacleNumber(existentes: Obstacle[]): string {
  const numeros = existentes
    .map((o) => parseInt(o.number, 10))
    .filter((n) => Number.isFinite(n));
  return String(numeros.length === 0 ? 1 : Math.max(...numeros) + 1);
}
