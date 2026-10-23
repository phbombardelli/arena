import { dubinsPaths, samplePath, type DubinsPath, type Pose } from '@core/geometry/dubins';
import { DEG, add, distance, fromAngle, rotate, scale, sub, type Vec2 } from '@core/geometry/vec';
import { arenaPoints } from '@core/model/arena';
import { obstacleExtent } from '@core/library/obstacles';
import type { Arena, Obstacle, TimingLine } from '@core/model/types';

/**
 * O traçado do cavaleiro, obstáculo a obstáculo.
 *
 * Aqui mora o que a geometria pura não sabe: onde começa e termina cada
 * volta, e quais das voltas possíveis o cavaleiro descartaria por sair da
 * pista ou passar por cima de outro obstáculo.
 *
 * Os números do `RideParams` são a parte calibrável — a intenção é ajustá-
 * los contra croquis reais de distância total conhecida, não defendê-los
 * na base do achismo. Os padrões atuais são declaradamente provisórios.
 */
export interface RideParams {
  /** Reta perpendicular ANTES do obstáculo, para o cavalo se organizar. */
  approachM: number;
  /** Reta perpendicular DEPOIS, que é o salto e a recepção. */
  getawayM: number;
  /** Raio de curva preferido. Curva boa é a de maior raio. */
  radiusM: number;
  /**
   * Raio mais fechado que o traçado aceita, e é piso: abaixo dele a volta
   * não se galopa e o assistente não a entrega como solução. Era 5 m
   * (decisão 49); o armador recusou voltas de 5,0 e 5,4 m como apertadas
   * demais e aceitou de 6,4 m para cima, e o piso subiu para 6 (decisão 82).
   */
  tightRadiusM: number;
  /**
   * Folga até o alambrado. Pequena de propósito: encostar a linha na
   * cerca, quando preciso, é do ofício — 1 m basta (decisão 49).
   */
  railMarginM: number;
  /**
   * Teto de giro entre dois saltos, em graus.
   *
   * A curva para trás de 200 a 270 graus é legítima, e muitas vezes o
   * percurso é desenhado pensando nela. Acima de 300 graus nenhum dos
   * croquis estudados passa: é laçada, e a volta passa a ser marcada como
   * problema em vez de entregue como solução (decisão 49).
   */
  maxTurnDeg: number;
}

export const DEFAULT_RIDE: RideParams = {
  approachM: 8,
  getawayM: 8,
  radiusM: 11,
  tightRadiusM: 6,
  railMarginM: 1,
  maxTurnDeg: 300,
};

/**
 * Direção do salto, em graus horários.
 *
 * A face do obstáculo é o X local e o salto atravessa no Y local; a seta
 * padrão aponta para o Y negativo, e `reversed` inverte. Vem daí o mesmo
 * sentido que o desenho já mostra: assistente e seta nunca discordam.
 */
export function jumpHeading(obstacle: Obstacle): number {
  return obstacle.rotation + (obstacle.arrow.reversed ? 90 : -90);
}

export function timingHeading(line: TimingLine): number {
  return line.rotation + (line.arrow.reversed ? 90 : -90);
}

/**
 * Reta mínima. Encostado no alambrado não cabem os 8 m de sempre, e o
 * cavaleiro pousa e já vira — mas alguma reta sempre existe, nem que seja
 * o próprio salto.
 */
const MIN_STRAIGHT_M = 2;

/**
 * Encurta a reta até ela caber dentro da pista.
 *
 * Sem isso, um obstáculo saltado contra o alambrado colocaria o ponto de
 * saída do lado de fora da cerca, e toda volta a partir dele nasceria
 * marcada como inválida. Encurtar é o que o cavaleiro faz de verdade.
 */
function fitStraight(
  origin: Vec2,
  heading: number,
  base: number,
  pedido: number,
  field: Field | null,
  params: RideParams,
): Vec2 {
  const ponto = (extra: number) => add(origin, scale(fromAngle(heading), base + extra));
  if (!field?.outline) return ponto(pedido);

  for (let extra = pedido; extra > MIN_STRAIGHT_M; extra -= 0.25) {
    const p = ponto(extra);
    if (insidePolygon(p, field.outline) && distanceToOutline(p, field.outline) >= params.railMarginM) {
      return p;
    }
  }
  return ponto(MIN_STRAIGHT_M);
}

/** Onde a reta de aproximação começa: antes da face, já apontando para ela. */
export function entryPose(obstacle: Obstacle, params: RideParams, field: Field | null = null): Pose {
  const heading = jumpHeading(obstacle);
  const corpo = obstacleExtent(obstacle).backM;
  return {
    pos: fitStraight(obstacle.pos, heading + 180, corpo, params.approachM, field, params),
    heading,
  };
}

/** Onde a reta de saída termina, depois do salto. */
export function exitPose(obstacle: Obstacle, params: RideParams, field: Field | null = null): Pose {
  const heading = jumpHeading(obstacle);
  const corpo = -obstacleExtent(obstacle).frontM;
  return {
    pos: fitStraight(obstacle.pos, heading, corpo, params.getawayM, field, params),
    heading,
  };
}

/** A partida e a chegada são cruzadas retas, como qualquer obstáculo. */
export function timingPose(
  line: TimingLine,
  params: RideParams,
  lado: 'antes' | 'depois',
  field: Field | null = null,
): Pose {
  const heading = timingHeading(line);
  const pedido = lado === 'antes' ? params.approachM : params.getawayM;
  return {
    pos: fitStraight(line.pos, lado === 'antes' ? heading + 180 : heading, 0, pedido, field, params),
    heading,
  };
}

/** Retângulo do obstáculo no chão, incluindo paraflanco e lâmina d'água. */
export function obstacleFootprint(obstacle: Obstacle): Vec2[] {
  const ext = obstacleExtent(obstacle);
  const meia = obstacle.wings.style === 'paraflanco'
    ? ext.halfWidthM + obstacle.wings.widthM
    : ext.halfWidthM;
  const cantos: Vec2[] = [
    { x: -meia, y: ext.frontM },
    { x: meia, y: ext.frontM },
    { x: meia, y: ext.backM },
    { x: -meia, y: ext.backM },
  ];
  return cantos.map((c) => add(obstacle.pos, rotate(c, obstacle.rotation)));
}

/** Ponto dentro do polígono, pela regra do número de cruzamentos. */
export function insidePolygon(point: Vec2, polygon: Vec2[]): boolean {
  let dentro = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i]!;
    const b = polygon[j]!;
    const cruza = a.y > point.y !== b.y > point.y;
    if (cruza && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) {
      dentro = !dentro;
    }
  }
  return dentro;
}

/** Distância de um ponto ao contorno do polígono. */
export function distanceToOutline(point: Vec2, polygon: Vec2[]): number {
  let menor = Infinity;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    menor = Math.min(menor, distanceToSegment(point, polygon[j]!, polygon[i]!));
  }
  return menor;
}

function distanceToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const ab = sub(b, a);
  const comprimento = ab.x * ab.x + ab.y * ab.y;
  if (comprimento === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * ab.x + (p.y - a.y) * ab.y) / comprimento));
  return Math.hypot(p.x - (a.x + ab.x * t), p.y - (a.y + ab.y * t));
}

/** O que o assistente precisa saber da pista para julgar uma volta. */
export interface Field {
  /** Contorno da pista, ou `null` quando não há pista definida. */
  outline: Vec2[] | null;
  /** Obstáculos que a volta não pode atravessar. */
  blockers: Obstacle[];
  /** Ilhas e vasos: corpos que a volta contorna (decisão 74). */
  decor?: Vec2[][];
}

export function fieldFrom(arena: Arena | null, obstacles: Obstacle[], decor: Vec2[][] = []): Field {
  return { outline: arena ? arenaPoints(arena) : null, blockers: obstacles, decor };
}

export type RideWarning = 'fora-da-pista' | 'passa-por-obstaculo';

export interface LegSolution {
  path: DubinsPath;
  /** Vazio quando a volta é limpa. Nunca impede a entrega. */
  warnings: RideWarning[];
  /** Raio realmente usado: menor que o preferido quando foi preciso fechar. */
  radiusM: number;
  /** Reta extra usada depois do salto anterior e antes do seguinte. */
  lead: { after: number; before: number };
}

/** Passo de amostragem: fino o bastante para não pular um paraflanco. */
const STEP_M = 0.5;

function checkPath(path: DubinsPath, field: Field, params: RideParams): RideWarning[] {
  const pontos = samplePath(path, STEP_M);
  const avisos: RideWarning[] = [];

  if (field.outline) {
    const escapou = pontos.some(
      (p) =>
        !insidePolygon(p, field.outline!) ||
        distanceToOutline(p, field.outline!) < params.railMarginM,
    );
    if (escapou) avisos.push('fora-da-pista');
  }

  const atropela =
    field.blockers.some((o) => {
      const corpo = obstacleFootprint(o);
      return pontos.some((p) => insidePolygon(p, corpo));
    }) || (field.decor ?? []).some((corpo) => pontos.some((p) => insidePolygon(p, corpo)));
  if (atropela) avisos.push('passa-por-obstaculo');

  return avisos;
}

/**
 * Raios a tentar, do mais aberto ao mais fechado.
 *
 * A ordem é a regra de ouro do traçado: usa-se a curva mais aberta que
 * couber, e só se fecha quando não cabe.
 *
 * O teto depende do VÃO. Quando dois saltos estão mais próximos que o raio
 * preferido, não existe caminho sem laçada: a curva de 11 m simplesmente
 * não cabe em 10 m de vão, e a geometria responde com uma volta completa,
 * que é o que suja o croqui. Entre saltos próximos o cavaleiro faz uma
 * curva curta, não uma laçada larga — daí o teto de metade do vão.
 */
function radiiToTry(params: RideParams, gapM: number): number[] {
  const teto = Math.max(params.tightRadiusM, Math.min(params.radiusM, gapM / 2));
  const raios: number[] = [];
  for (let r = teto; r > params.tightRadiusM; r *= 0.85) raios.push(r);
  raios.push(params.tightRadiusM);
  return raios;
}

/**
 * Alongamentos a tentar nas retas, em metros, do mais econômico ao mais
 * largo: (depois do salto anterior, antes do salto seguinte).
 *
 * Sem isto, o assistente obrigava o cavalo a entrar no salto a exatos 8 m
 * dele. Quando o salto seguinte está desalinhado, não existe curva
 * decente nesse espaço, e a geometria responde com uma laçada. O
 * cavaleiro faz o contrário: sai mais largo e volta numa aproximação mais
 * LONGA, que é onde a curva cabe. A ordem é a da economia — só se abre
 * mão de espaço quando o aperto obriga.
 */
const EXTENSIONS: [number, number][] = [
  [0, 0],
  [0, 8],
  [8, 0],
  [8, 8],
  [0, 18],
  [18, 0],
  [8, 18],
  [18, 8],
  [18, 18],
  [0, 30],
  [30, 0],
  [30, 30],
];

const slide = (pose: Pose, metros: number, paraFrente: boolean): Pose => ({
  pos: add(pose.pos, scale(fromAngle(pose.heading), paraFrente ? metros : -metros)),
  heading: pose.heading,
});

/**
 * Resolve uma volta entre dois saltos.
 *
 * Tenta a curva mais aberta primeiro e vai fechando; a mais curta que
 * passa limpa ganha. Quando nenhuma passa limpa — pista apertada,
 * obstáculo bem no meio —, devolve a menos problemática assim mesmo, COM
 * os avisos: o desenhador precisa ver o problema e decidir, e um traçado
 * ausente esconderia o que um traçado marcado mostra.
 */
export function solveLeg(
  from: Pose,
  to: Pose,
  field: Field,
  params: RideParams = DEFAULT_RIDE,
): LegSolution | null {
  let melhorRuim: LegSolution | null = null;

  for (const [depois, antes] of EXTENSIONS) {
    const saida = slide(from, depois, true);
    const chegada = slide(to, antes, false);
    const achou = solveBetween(saida, chegada, field, params);
    if (!achou) continue;
    if (achou.warnings.length === 0) {
      return { ...achou, lead: { after: depois, before: antes } };
    }
    if (melhorRuim === null || achou.warnings.length < melhorRuim.warnings.length) {
      melhorRuim = { ...achou, lead: { after: depois, before: antes } };
    }
  }
  if (melhorRuim) return melhorRuim;

  // Nem alongando as retas existe volta sem laçada: o percurso pede o que
  // o cavalo não faz. Entrega então a volta de MENOR giro possível, que é
  // a menos absurda, e o aviso denuncia o aperto. O raio fica no piso:
  // fechar abaixo dele desenhava um bico, que não é volta nenhuma.
  const ultimo = dubinsPaths(from, to, params.tightRadiusM)
    .sort((a, b) => totalTurn(a) - totalTurn(b))[0];
  if (!ultimo) return null;
  return {
    path: ultimo,
    warnings: checkPath(ultimo, field, params),
    radiusM: ultimo.radius,
    lead: { after: 0, before: 0 },
  };
}

/** A busca por raio, com as pontas já fixadas. */
function solveBetween(
  from: Pose,
  to: Pose,
  field: Field,
  params: RideParams,
): Omit<LegSolution, 'lead'> | null {
  let melhorRuim: Omit<LegSolution, 'lead'> | null = null;
  const vao = distance(from.pos, to.pos);

  for (const raio of radiiToTry(params, vao)) {
    const candidatos = dubinsPaths(from, to, raio).filter(
      (p) => totalTurn(p) <= params.maxTurnDeg,
    );
    for (const path of candidatos) {
      const warnings = checkPath(path, field, params);
      if (warnings.length === 0) return { path, warnings, radiusM: raio };
      if (melhorRuim === null || warnings.length < melhorRuim.warnings.length) {
        melhorRuim = { path, warnings, radiusM: raio };
      }
    }
  }

  // Sem candidato dentro do limite de giro devolve NULO, e não uma laçada.
  // O recurso de último caso é do chamador, depois de esgotar as retas
  // mais longas — aqui dentro ele aceitaria a laçada logo na primeira
  // tentativa e as extensões nunca seriam experimentadas.
  return melhorRuim;
}

/** Quanto o caminho gira ao todo, somando os arcos, em graus. */
export function totalTurn(path: DubinsPath): number {
  return path.segments.reduce((s, seg) => s + (seg.kind === 'arco' ? seg.sweep : 0), 0);
}

/** Ângulo entre duas direções, em graus, sempre no intervalo [0, 180]. */
export const headingGap = (a: number, b: number): number => {
  const d = Math.abs(((a - b) % 360 + 540) % 360 - 180);
  return 180 - d;
};

/** Direção de A para B, em graus horários. */
export const headingTo = (a: Vec2, b: Vec2): number =>
  Math.atan2(b.y - a.y, b.x - a.x) / DEG;
