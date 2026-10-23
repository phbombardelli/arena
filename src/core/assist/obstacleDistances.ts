import { distance, type Vec2 } from '@core/geometry/vec';
import { flattenPath } from '@core/model/path';
import { obstacleLabel } from '@core/library/obstacles';
import type { CoursePath, Obstacle, TimingLine } from '@core/model/types';
import { courseOrder } from './courseRide';

/**
 * Distâncias entre obstáculos consecutivos, medidas AO LONGO do traçado
 * (decisão 54).
 *
 * É o número que o desenhador escreve entre dois saltos de uma linha:
 * quanto o cavalo percorre da vara de saída de um à vara de entrada do
 * seguinte. Por isso mede sobre a curva desenhada — não em linha reta — e
 * desconta meia largura de salto de cada lado, como a ferramenta de
 * composto (decisão 46).
 *
 * A ordem é a da numeração, elemento a elemento: 4, 5A, 5B, 6. Assim
 * entram também os vãos de dentro dos compostos.
 */
export interface ObstacleDistance {
  /** "idDe>idPara" — a chave guardada em `path.obstacleDistances`. */
  key: string;
  fromId: string;
  toId: string;
  fromLabel: string;
  toLabel: string;
  meters: number;
  /** Onde o rótulo vai: no meio do trecho, deslocado para o lado. */
  at: Vec2;
  /** Normal unitária do traçado ali, para afastar o rótulo da linha. */
  normal: Vec2;
  /** Onde o traçado cruza cada obstáculo, em metros desde o começo. */
  sFrom: number;
  sTo: number;
}

/** Poligonal do traçado com o comprimento acumulado: ponto e normal em qualquer s. */
export interface PathSampler {
  pts: Vec2[];
  acumulado: number[];
  pointAt: (s: number) => { p: Vec2; normal: Vec2 };
}

export function pathSampler(path: CoursePath): PathSampler | null {
  const pts = flattenPath(path, 0.05);
  if (pts.length < 2) return null;
  const acumulado: number[] = [0];
  for (let i = 1; i < pts.length; i += 1) acumulado.push(acumulado[i - 1]! + distance(pts[i - 1]!, pts[i]!));
  const pointAt = (s: number): { p: Vec2; normal: Vec2 } => {
    let i = 1;
    while (i < pts.length - 1 && acumulado[i]! < s) i += 1;
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const seg = acumulado[i]! - acumulado[i - 1]!;
    const t = seg === 0 ? 0 : Math.max(0, Math.min(1, (s - acumulado[i - 1]!) / seg));
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return {
      p: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t },
      normal: { x: -(b.y - a.y) / len, y: (b.x - a.x) / len },
    };
  };
  return { pts, acumulado, pointAt };
}

/** Até quantos metros do centro o traçado ainda "passa" pelo obstáculo. */
const PASSA_PELO_OBSTACULO_M = 3;

export const distanceKey = (from: Obstacle, to: Obstacle): string => `${from.id}>${to.id}`;

export function obstacleDistancesAlong(path: CoursePath, obstacles: Obstacle[]): ObstacleDistance[] {
  return courseDistancesAlong(path, obstacles, []);
}

/** Onde o traçado passa pela cruzada: até a meia largura dela, ou 3 m. */
const PASSA_PELA_CRUZADA_M = 3;

/**
 * Todas as distâncias do percurso, de vara a vara, na ordem (decisão 76):
 * partida → 1 → 2 → … → chegada. A cruzada de tempo não tem largura: a
 * distância vai da linha até a vara de entrada do primeiro (e da vara de
 * saída do último até a linha). É o mesmo número no croqui, no painel do
 * traçado, no composto e durante o arraste.
 */
export function courseDistancesAlong(
  path: CoursePath,
  obstacles: Obstacle[],
  timings: TimingLine[],
): ObstacleDistance[] {
  const amostra = pathSampler(path);
  if (!amostra) return [];
  const { pts, acumulado } = amostra;

  // Onde, ao longo do traçado, cada obstáculo é cruzado.
  const posicao = (o: Obstacle): number | null => {
    let melhor = Infinity;
    let s = 0;
    for (let i = 1; i < pts.length; i += 1) {
      const a = pts[i - 1]!;
      const b = pts[i]!;
      const ab = { x: b.x - a.x, y: b.y - a.y };
      const len2 = ab.x * ab.x + ab.y * ab.y;
      const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((o.pos.x - a.x) * ab.x + (o.pos.y - a.y) * ab.y) / len2));
      const p = { x: a.x + ab.x * t, y: a.y + ab.y * t };
      const d = distance(p, o.pos);
      if (d < melhor) {
        melhor = d;
        s = acumulado[i - 1]! + Math.sqrt(len2) * t;
      }
    }
    return melhor <= Math.max(PASSA_PELO_OBSTACULO_M, o.faceWidthM / 2) ? s : null;
  };

  // A cruzada é cruzada no ponto do traçado mais perto do centro dela.
  const posicaoDaCruzada = (t: TimingLine): number | null => {
    let melhor = Infinity;
    let s = 0;
    for (let i = 1; i < pts.length; i += 1) {
      const a = pts[i - 1]!;
      const b = pts[i]!;
      const ab = { x: b.x - a.x, y: b.y - a.y };
      const len2 = ab.x * ab.x + ab.y * ab.y;
      const t0 = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((t.pos.x - a.x) * ab.x + (t.pos.y - a.y) * ab.y) / len2));
      const d = distance({ x: a.x + ab.x * t0, y: a.y + ab.y * t0 }, t.pos);
      if (d < melhor) {
        melhor = d;
        s = acumulado[i - 1]! + Math.sqrt(len2) * t0;
      }
    }
    return melhor <= Math.max(PASSA_PELA_CRUZADA_M, t.widthM / 2) ? s : null;
  };

  type Marco = { id: string; label: string; meiaVara: number; s: number | null };
  const marco = (o: Obstacle): Marco => ({
    id: o.id,
    label: obstacleLabel(o) || '?',
    meiaVara: (o.spreadM ?? 0) / 2,
    s: posicao(o),
  });
  const cruzada = (t: TimingLine): Marco => ({
    id: t.id,
    label: t.role === 'start' ? 'Partida' : 'Chegada',
    meiaVara: 0,
    s: posicaoDaCruzada(t),
  });
  const partida = timings.find((t) => t.role === 'start');
  const chegada = timings.find((t) => t.role === 'finish');
  const marcos: Marco[] = [
    ...(partida ? [cruzada(partida)] : []),
    ...courseOrder(obstacles).flatMap((st) => st.elements).map(marco),
    ...(chegada ? [cruzada(chegada)] : []),
  ];

  const out: ObstacleDistance[] = [];
  for (let i = 0; i + 1 < marcos.length; i += 1) {
    const de = marcos[i]!;
    const para = marcos[i + 1]!;
    // O traçado precisa passar pelos dois, e nessa ordem.
    if (de.s === null || para.s === null || para.s <= de.s) continue;
    const metros = para.s - de.s - de.meiaVara - para.meiaVara;
    const meio = amostra.pointAt((de.s + para.s) / 2);
    out.push({
      key: `${de.id}>${para.id}`,
      fromId: de.id,
      toId: para.id,
      fromLabel: de.label,
      toLabel: para.label,
      meters: metros,
      at: meio.p,
      normal: meio.normal,
      sFrom: de.s,
      sTo: para.s,
    });
  }
  return out;
}
