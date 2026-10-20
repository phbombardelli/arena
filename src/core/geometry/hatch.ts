import { DEG, type Vec2 } from './vec';

/**
 * Linhas paralelas recortadas por um polígono qualquer.
 *
 * Serve para desenhar os degraus de uma arquibancada e a hachura do
 * concreto sem depender de <pattern> nem de recorte no SVG — o conversor
 * para PDF não garante nenhum dos dois. As linhas saem já cortadas no
 * contorno, como segmentos comuns.
 *
 * Gira o polígono para que as linhas fiquem horizontais, varre de cima a
 * baixo cruzando cada aresta e devolve os trechos de dentro, já girados de
 * volta. Funciona com contorno côncavo: a paridade dos cruzamentos decide
 * o que é dentro.
 */
export function hatchSegments(
  polygon: Vec2[],
  angleDeg: number,
  spacingM: number,
): [Vec2, Vec2][] {
  if (polygon.length < 3 || !(spacingM > 0)) return [];
  const a = angleDeg * DEG;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  // Para o sistema em que as linhas são horizontais, e de volta.
  const para = (p: Vec2): Vec2 => ({ x: p.x * cos + p.y * sin, y: -p.x * sin + p.y * cos });
  const volta = (p: Vec2): Vec2 => ({ x: p.x * cos - p.y * sin, y: p.x * sin + p.y * cos });

  const pts = polygon.map(para);
  const ys = pts.map((p) => p.y);
  const yMin = Math.min(...ys);
  const yMax = Math.max(...ys);

  const out: [Vec2, Vec2][] = [];
  // Começa meio passo para dentro: linha encostada na borda não se vê.
  for (let y = yMin + spacingM / 2; y < yMax; y += spacingM) {
    const xs: number[] = [];
    for (let i = 0; i < pts.length; i += 1) {
      const p = pts[i]!;
      const q = pts[(i + 1) % pts.length]!;
      if (p.y > y !== q.y > y) xs.push(p.x + ((y - p.y) * (q.x - p.x)) / (q.y - p.y));
    }
    xs.sort((m, n) => m - n);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      out.push([volta({ x: xs[i]!, y }), volta({ x: xs[i + 1]!, y })]);
    }
  }
  return out;
}

/** Direção da aresta mais longa, em graus — para alinhar degraus e rótulo. */
export function longestEdgeAngle(polygon: Vec2[]): number {
  let melhor = 0;
  let angulo = 0;
  for (let i = 0; i < polygon.length; i += 1) {
    const p = polygon[i]!;
    const q = polygon[(i + 1) % polygon.length]!;
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    if (d > melhor) {
      melhor = d;
      angulo = Math.atan2(q.y - p.y, q.x - p.x) / DEG;
    }
  }
  return angulo;
}

/** Centro de massa do polígono (cai dentro em formas convexas e na maioria das usuais). */
export function polygonCentroid(polygon: Vec2[]): Vec2 {
  let area = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < polygon.length; i += 1) {
    const p = polygon[i]!;
    const q = polygon[(i + 1) % polygon.length]!;
    const cruz = p.x * q.y - q.x * p.y;
    area += cruz;
    cx += (p.x + q.x) * cruz;
    cy += (p.y + q.y) * cruz;
  }
  if (Math.abs(area) < 1e-12) {
    const n = polygon.length || 1;
    return {
      x: polygon.reduce((s, p) => s + p.x, 0) / n,
      y: polygon.reduce((s, p) => s + p.y, 0) / n,
    };
  }
  return { x: cx / (3 * area), y: cy / (3 * area) };
}

/**
 * Trechos de uma linha vertical (`eixo` 'x', em x = `valor`) ou horizontal
 * (`eixo` 'y', em y = `valor`) que ficam DENTRO do polígono. É a grade da
 * pista: cada linha do quadriculado recortada no contorno, sem <clipPath>.
 */
export function insideIntervals(polygon: Vec2[], eixo: 'x' | 'y', valor: number): [number, number][] {
  const outro = eixo === 'x' ? 'y' : 'x';
  const cortes: number[] = [];
  for (let i = 0; i < polygon.length; i += 1) {
    const p = polygon[i]!;
    const q = polygon[(i + 1) % polygon.length]!;
    // Meio-aberto: um vértice exatamente na linha conta uma vez só.
    if ((p[eixo] <= valor && q[eixo] > valor) || (q[eixo] <= valor && p[eixo] > valor)) {
      const t = (valor - p[eixo]) / (q[eixo] - p[eixo]);
      cortes.push(p[outro] + t * (q[outro] - p[outro]));
    }
  }
  cortes.sort((a, b) => a - b);
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < cortes.length; i += 2) out.push([cortes[i]!, cortes[i + 1]!]);
  return out;
}
