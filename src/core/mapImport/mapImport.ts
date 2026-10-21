import type { Vec2 } from '@core/geometry/vec';

/**
 * Leitura de um print do Google Maps para montar a pista (B-40, decisão 64).
 *
 * Tudo aqui é cálculo puro sobre os pixels — sem DOM, sem canvas —, para
 * poder ser testado com imagens sintéticas. As coordenadas são em PIXELS
 * da imagem; quem chama converte para metros com a escala da medida.
 *
 * O que se procura:
 * - os dois marcadores do "Medir distância" do Maps: discos brancos
 *   pequenos, de contorno escuro;
 * - a pista: a mancha de areia em volta de um ponto de partida;
 * - sugestões: ilhas (buracos de outra cor dentro da areia) e telhados
 *   (manchas laranja/vermelhas encostadas na pista).
 */

export interface Pixels {
  data: Uint8ClampedArray | Uint8Array;
  width: number;
  height: number;
}

export type PolygonPx = Vec2[];

const branco = (d: Pixels['data'], i: number, limiar = 235): boolean =>
  d[i * 4]! > limiar && d[i * 4 + 1]! > limiar && d[i * 4 + 2]! > limiar;

interface Componente {
  area: number;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  cx: number;
  cy: number;
  pixels: number[];
}

/** Componentes conexos (4-vizinhança) dos pixels marcados. */
function componentes(mask: Uint8Array, w: number, h: number, guardaPixels = false): Componente[] {
  const visto = new Uint8Array(w * h);
  const out: Componente[] = [];
  for (let i = 0; i < w * h; i += 1) {
    if (!mask[i] || visto[i]) continue;
    const pilha = [i];
    visto[i] = 1;
    const c: Componente = { area: 0, x0: w, x1: 0, y0: h, y1: 0, cx: 0, cy: 0, pixels: [] };
    while (pilha.length) {
      const p = pilha.pop()!;
      const x = p % w;
      const y = (p - x) / w;
      c.area += 1;
      c.cx += x;
      c.cy += y;
      if (guardaPixels) c.pixels.push(p);
      if (x < c.x0) c.x0 = x;
      if (x > c.x1) c.x1 = x;
      if (y < c.y0) c.y0 = y;
      if (y > c.y1) c.y1 = y;
      if (x > 0 && mask[p - 1] && !visto[p - 1]) { visto[p - 1] = 1; pilha.push(p - 1); }
      if (x < w - 1 && mask[p + 1] && !visto[p + 1]) { visto[p + 1] = 1; pilha.push(p + 1); }
      if (y > 0 && mask[p - w] && !visto[p - w]) { visto[p - w] = 1; pilha.push(p - w); }
      if (y < h - 1 && mask[p + w] && !visto[p + w]) { visto[p + w] = 1; pilha.push(p + w); }
    }
    c.cx /= c.area;
    c.cy /= c.area;
    out.push(c);
  }
  return out;
}

/* ------------------------------------------------------------ medida */

export interface MeasureMarkers {
  a: Vec2;
  b: Vec2;
  /** Raio aproximado dos marcadores, em px: dá a escala do texto ao lado. */
  radiusPx: number;
}

/**
 * Os dois marcadores do "Medir distância": discos brancos quase redondos,
 * de 6 a 30 px. Com mais de dois candidatos, fica o par de mesmo tamanho
 * mais ligado por branco — a linha da medida corre entre eles.
 */
export function findMeasureMarkers(img: Pixels): MeasureMarkers | null {
  const { width: w, height: h, data } = img;
  const mask = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i += 1) mask[i] = branco(data, i) ? 1 : 0;
  const discos = componentes(mask, w, h).filter((c) => {
    const lw = c.x1 - c.x0 + 1;
    const lh = c.y1 - c.y0 + 1;
    return lw >= 6 && lw <= 30 && lh >= 6 && lh <= 30 && Math.abs(lw - lh) <= 3 && c.area / (lw * lh) > 0.6;
  });
  if (discos.length < 2) return null;

  let melhor: { a: Componente; b: Componente; nota: number } | null = null;
  for (let i = 0; i < discos.length; i += 1) {
    for (let j = i + 1; j < discos.length; j += 1) {
      const a = discos[i]!;
      const b = discos[j]!;
      if (Math.abs(a.area - b.area) > Math.max(a.area, b.area) * 0.35) continue;
      // Quanto da reta entre eles é clara (a linha da medida é branca).
      const passos = Math.max(8, Math.round(Math.hypot(b.cx - a.cx, b.cy - a.cy) / 3));
      let claros = 0;
      for (let k = 1; k < passos; k += 1) {
        const x = Math.round(a.cx + ((b.cx - a.cx) * k) / passos);
        const y = Math.round(a.cy + ((b.cy - a.cy) * k) / passos);
        if (branco(data, y * w + x, 200)) claros += 1;
      }
      const nota = claros / (passos - 1);
      if (!melhor || nota > melhor.nota) melhor = { a, b, nota };
    }
  }
  if (!melhor) return null;
  const { a, b } = melhor;
  // Ordem estável: o "0" costuma ficar à esquerda.
  const [p, q] = a.cx <= b.cx ? [a, b] : [b, a];
  return {
    a: { x: p.cx, y: p.cy },
    b: { x: q.cx, y: q.cy },
    radiusPx: Math.sqrt((p.area + q.area) / 2 / Math.PI),
  };
}

/** Retângulo, em px, onde o Maps escreve a distância: logo abaixo do marcador. */
export function labelRect(m: Vec2, radiusPx: number, img: Pixels) {
  const r = Math.max(5, radiusPx);
  const x = Math.max(0, Math.round(m.x - r * 9));
  const y = Math.max(0, Math.round(m.y + r * 0.8));
  const x1 = Math.min(img.width, Math.round(m.x + r * 9));
  const y1 = Math.min(img.height, Math.round(m.y + r * 6));
  return { x, y, width: Math.max(1, x1 - x), height: Math.max(1, y1 - y) };
}

/**
 * Prepara um recorte para o OCR: o texto do Maps é branco com contorno
 * escuro sobre a foto; vira preto sobre branco, ampliado, que é o que o
 * leitor lê melhor. Devolve RGBA.
 */
export function textForOcr(img: Pixels, rect: { x: number; y: number; width: number; height: number }, zoom = 3): Pixels {
  const w = rect.width * zoom;
  const h = rect.height * zoom;
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const sx = rect.x + Math.floor(x / zoom);
      const sy = rect.y + Math.floor(y / zoom);
      const i = sy * img.width + sx;
      const v = branco(img.data, i, 215) ? 0 : 255;
      const o = (y * w + x) * 4;
      out[o] = v;
      out[o + 1] = v;
      out[o + 2] = v;
      out[o + 3] = 255;
    }
  }
  return { data: out, width: w, height: h };
}

/**
 * "27,03 m", "1,2 km", "120 m" → metros.
 *
 * O Maps escreve sempre duas casas ("27,03 m"), e a vírgula é pequena: o
 * OCR costuma perdê-la e devolver "27 03 m". Um espaço antes de dois
 * dígitos colados na unidade é, portanto, a vírgula que sumiu.
 */
export function parseDistance(texto: string): number | null {
  const t = texto.replace(/\s+/g, ' ');
  const comUnidade =
    /(\d+)\s*[.,]\s*(\d+)\s*(km|m)\b/i.exec(t) ?? /(\d+) (\d{1,2})\s*(km|m)\b/i.exec(t);
  let n: number;
  let unidade: string | undefined;
  if (comUnidade) {
    n = Number(`${comUnidade[1]}.${comUnidade[2]}`);
    unidade = comUnidade[3];
  } else {
    const m = /(\d+)\s*(km|m)\b/i.exec(t) ?? /(\d+[.,]\d+)/.exec(t);
    if (!m) return null;
    n = Number(m[1]!.replace(',', '.'));
    unidade = m[2];
  }
  if (!Number.isFinite(n) || n <= 0) return null;
  return unidade?.toLowerCase() === 'km' ? n * 1000 : n;
}

/* ------------------------------------------------------------ pista */

export interface ArenaGuess {
  /** Máscara da areia ligada ao ponto de partida (1 = pista). */
  mask: Uint8Array;
  /** Contorno sugerido, simplificado. */
  outline: PolygonPx;
}

/** Erosão ou dilatação por um quadrado de raio `r` (separável). */
function morfologia(src: Uint8Array, w: number, h: number, r: number, erodir: boolean): Uint8Array {
  const tmp = new Uint8Array(w * h);
  const out = new Uint8Array(w * h);
  const linha = new Int32Array(Math.max(w, h) + 1);
  for (let y = 0; y < h; y += 1) {
    const base = y * w;
    for (let x = 0; x < w; x += 1) linha[x + 1] = linha[x]! + src[base + x]!;
    for (let x = 0; x < w; x += 1) {
      const a = Math.max(0, x - r);
      const b = Math.min(w - 1, x + r);
      const s = linha[b + 1]! - linha[a]!;
      tmp[base + x] = erodir ? (s === b - a + 1 ? 1 : 0) : s > 0 ? 1 : 0;
    }
  }
  for (let x = 0; x < w; x += 1) {
    for (let y = 0; y < h; y += 1) linha[y + 1] = linha[y]! + tmp[y * w + x]!;
    for (let y = 0; y < h; y += 1) {
      const a = Math.max(0, y - r);
      const b = Math.min(h - 1, y + r);
      const s = linha[b + 1]! - linha[a]!;
      out[y * w + x] = erodir ? (s === b - a + 1 ? 1 : 0) : s > 0 ? 1 : 0;
    }
  }
  return out;
}

function preencheDe(mask: Uint8Array, w: number, h: number, semente: number): Uint8Array {
  const out = new Uint8Array(w * h);
  if (!mask[semente]) return out;
  out[semente] = 1;
  const pilha = [semente];
  while (pilha.length) {
    const p = pilha.pop()!;
    const x = p % w;
    if (x > 0 && mask[p - 1] && !out[p - 1]) { out[p - 1] = 1; pilha.push(p - 1); }
    if (x < w - 1 && mask[p + 1] && !out[p + 1]) { out[p + 1] = 1; pilha.push(p + 1); }
    if (p >= w && mask[p - w] && !out[p - w]) { out[p - w] = 1; pilha.push(p - w); }
    if (p + w < w * h && mask[p + w] && !out[p + w]) { out[p + w] = 1; pilha.push(p + w); }
  }
  return out;
}

/**
 * A mancha de areia em volta de `semente`.
 *
 * Cor parecida com a da semente (média 17×17), mais o branco do traço da
 * medida. Areia de fora da cerca costuma ter a MESMA cor e vaza pelas
 * frestas das réguas: por isso a máscara é encolhida antes de preencher
 * (as passagens finas se fecham) e devolvida ao tamanho depois.
 */
export function segmentArena(img: Pixels, semente: Vec2, tolerancia = 38): ArenaGuess | null {
  const { width: w, height: h, data } = img;
  const sx = Math.round(Math.min(w - 1, Math.max(0, semente.x)));
  const sy = Math.round(Math.min(h - 1, Math.max(0, semente.y)));
  let mr = 0;
  let mg = 0;
  let mb = 0;
  let n = 0;
  for (let y = Math.max(0, sy - 8); y <= Math.min(h - 1, sy + 8); y += 1) {
    for (let x = Math.max(0, sx - 8); x <= Math.min(w - 1, sx + 8); x += 1) {
      const i = (y * w + x) * 4;
      mr += data[i]!;
      mg += data[i + 1]!;
      mb += data[i + 2]!;
      n += 1;
    }
  }
  mr /= n;
  mg /= n;
  mb /= n;

  const areia = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i += 1) {
    const r = data[i * 4]!;
    const g = data[i * 4 + 1]!;
    const b = data[i * 4 + 2]!;
    areia[i] = Math.hypot(r - mr, g - mg, b - mb) < tolerancia || (r > 225 && g > 225 && b > 225) ? 1 : 0;
  }
  const raio = Math.max(3, Math.round(Math.min(w, h) / 140));
  const encolhida = morfologia(areia, w, h, raio, true);
  const pedaco = preencheDe(encolhida, w, h, sy * w + sx);
  const mask = morfologia(pedaco, w, h, raio, false);

  let area = 0;
  for (let i = 0; i < w * h; i += 1) area += mask[i]!;
  if (area < (w * h) / 200) return null;

  const outline = simplifyClosed(convexHull(boundaryPoints(mask, w, h)), Math.hypot(w, h) * 0.008);
  return outline.length >= 3 ? { mask, outline } : null;
}

function boundaryPoints(mask: Uint8Array, w: number, h: number, passo = 2): Vec2[] {
  const pts: Vec2[] = [];
  for (let y = 0; y < h; y += passo) {
    for (let x = 0; x < w; x += passo) {
      const i = y * w + x;
      if (!mask[i]) continue;
      const borda =
        x < passo || y < passo || x >= w - passo || y >= h - passo ||
        !mask[i - passo] || !mask[i + passo] || !mask[i - passo * w] || !mask[i + passo * w];
      if (borda) pts.push({ x, y });
    }
  }
  return pts;
}

/** Casco convexo (cadeia monótona), em sentido horário na tela. */
export function convexHull(pontos: Vec2[]): Vec2[] {
  const pts = [...pontos].sort((a, b) => a.x - b.x || a.y - b.y);
  if (pts.length < 3) return pts;
  const cruz = (o: Vec2, a: Vec2, b: Vec2) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const baixo: Vec2[] = [];
  for (const p of pts) {
    while (baixo.length >= 2 && cruz(baixo[baixo.length - 2]!, baixo[baixo.length - 1]!, p) <= 0) baixo.pop();
    baixo.push(p);
  }
  const cima: Vec2[] = [];
  for (let i = pts.length - 1; i >= 0; i -= 1) {
    const p = pts[i]!;
    while (cima.length >= 2 && cruz(cima[cima.length - 2]!, cima[cima.length - 1]!, p) <= 0) cima.pop();
    cima.push(p);
  }
  return baixo.slice(0, -1).concat(cima.slice(0, -1));
}

/** Douglas–Peucker para um anel fechado. */
export function simplifyClosed(anel: Vec2[], eps: number): Vec2[] {
  if (anel.length < 4) return anel;
  const dist = (p: Vec2, a: Vec2, b: Vec2) => {
    const l = Math.hypot(b.x - a.x, b.y - a.y);
    return l === 0 ? Math.hypot(p.x - a.x, p.y - a.y) : Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / l;
  };
  const dp = (ps: Vec2[]): Vec2[] => {
    if (ps.length < 3) return ps;
    const a = ps[0]!;
    const b = ps[ps.length - 1]!;
    let md = 0;
    let mi = 0;
    for (let i = 1; i < ps.length - 1; i += 1) {
      const d = dist(ps[i]!, a, b);
      if (d > md) {
        md = d;
        mi = i;
      }
    }
    return md > eps ? dp(ps.slice(0, mi + 1)).slice(0, -1).concat(dp(ps.slice(mi))) : [a, b];
  };
  // Corta o anel no ponto mais distante do primeiro e simplifica as duas metades.
  let longe = 0;
  for (let i = 1; i < anel.length; i += 1) {
    if (Math.hypot(anel[i]!.x - anel[0]!.x, anel[i]!.y - anel[0]!.y) > Math.hypot(anel[longe]!.x - anel[0]!.x, anel[longe]!.y - anel[0]!.y)) longe = i;
  }
  const ida = dp(anel.slice(0, longe + 1));
  const volta = dp(anel.slice(longe).concat([anel[0]!]));
  return ida.slice(0, -1).concat(volta.slice(0, -1));
}

/**
 * Menor retângulo que contém o polígono (calibres giratórios sobre o
 * casco). É o "ajustar a retângulo": a maioria das pistas é retangular, e
 * o retângulo devolve o canto que uma copa de árvore escondeu.
 */
export function fitRectangle(poligono: Vec2[]): Vec2[] {
  const casco = convexHull(poligono);
  if (casco.length < 3) return casco;
  let melhor: { area: number; pts: Vec2[] } | null = null;
  for (let i = 0; i < casco.length; i += 1) {
    const a = casco[i]!;
    const b = casco[(i + 1) % casco.length]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len === 0) continue;
    const u = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
    const v = { x: -u.y, y: u.x };
    let minU = Infinity;
    let maxU = -Infinity;
    let minV = Infinity;
    let maxV = -Infinity;
    for (const p of casco) {
      const pu = p.x * u.x + p.y * u.y;
      const pv = p.x * v.x + p.y * v.y;
      minU = Math.min(minU, pu);
      maxU = Math.max(maxU, pu);
      minV = Math.min(minV, pv);
      maxV = Math.max(maxV, pv);
    }
    const area = (maxU - minU) * (maxV - minV);
    if (!melhor || area < melhor.area) {
      const pt = (su: number, sv: number) => ({ x: u.x * su + v.x * sv, y: u.y * su + v.y * sv });
      melhor = { area, pts: [pt(minU, minV), pt(maxU, minV), pt(maxU, maxV), pt(minU, maxV)] };
    }
  }
  return melhor ? melhor.pts : casco;
}

/* ------------------------------------------------------------ sugestões */

export interface Suggestion {
  kind: 'ilha' | 'edificacao';
  outline: PolygonPx;
}

/**
 * Ilhas: o que NÃO é areia e está cercado por ela — gramados com
 * palmeiras, canteiros. Buracos pequenos (texto da medida, sujeira) e os
 * anéis dos marcadores (`ignorar`) ficam de fora.
 */
export function findIslands(guess: ArenaGuess, img: Pixels, ignorar: Vec2[] = []): Suggestion[] {
  const { width: w, height: h } = img;
  const fora = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i += 1) fora[i] = guess.mask[i] ? 0 : 1;
  // O que não é areia e toca a borda da imagem é exterior, não ilha.
  const exterior = new Uint8Array(w * h);
  const pilha: number[] = [];
  const marca = (p: number) => {
    if (fora[p] && !exterior[p]) {
      exterior[p] = 1;
      pilha.push(p);
    }
  };
  for (let x = 0; x < w; x += 1) {
    marca(x);
    marca((h - 1) * w + x);
  }
  for (let y = 0; y < h; y += 1) {
    marca(y * w);
    marca(y * w + w - 1);
  }
  while (pilha.length) {
    const p = pilha.pop()!;
    const x = p % w;
    if (x > 0) marca(p - 1);
    if (x < w - 1) marca(p + 1);
    if (p >= w) marca(p - w);
    if (p + w < w * h) marca(p + w);
  }
  const buraco = new Uint8Array(w * h);
  let areaPista = 0;
  for (let i = 0; i < w * h; i += 1) {
    buraco[i] = fora[i] && !exterior[i] ? 1 : 0;
    areaPista += guess.mask[i]!;
  }
  const minimo = Math.max(60, areaPista * 0.002);
  return componentes(buraco, w, h, true)
    .filter((c) => c.area >= minimo)
    // O contorno escuro dos marcadores da medida também é um buraco.
    .filter((c) => !ignorar.some((p) => p.x >= c.x0 - 2 && p.x <= c.x1 + 2 && p.y >= c.y0 - 2 && p.y <= c.y1 + 2))
    .map((c) => {
      const mask = new Uint8Array(w * h);
      for (const p of c.pixels) mask[p] = 1;
      const casco = simplifyClosed(convexHull(boundaryPoints(mask, w, h, 1)), 2);
      return { kind: 'ilha' as const, outline: casco };
    })
    .filter((s) => s.outline.length >= 3);
}

/**
 * Telhados encostados na pista: manchas laranja ou vermelhas a até 15% do
 * tamanho da pista da borda dela. Viram sugestão de edificação, como
 * referência do local.
 */
export function findRoofs(img: Pixels, pista: PolygonPx): Suggestion[] {
  const { width: w, height: h, data } = img;
  const xs = pista.map((p) => p.x);
  const ys = pista.map((p) => p.y);
  const folga = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) * 0.15;
  const x0 = Math.min(...xs) - folga;
  const x1 = Math.max(...xs) + folga;
  const y0 = Math.min(...ys) - folga;
  const y1 = Math.max(...ys) + folga;
  const telha = new Uint8Array(w * h);
  for (let y = Math.max(0, Math.floor(y0)); y < Math.min(h, y1); y += 1) {
    for (let x = Math.max(0, Math.floor(x0)); x < Math.min(w, x1); x += 1) {
      const i = y * w + x;
      const r = data[i * 4]!;
      const g = data[i * 4 + 1]!;
      const b = data[i * 4 + 2]!;
      // Telha de barro vista de cima: vermelho bem acima do verde e do azul
      // (areia fica em r − g ≈ 13; grama e copa, abaixo de zero).
      telha[i] = r > 110 && r - g >= 30 && r - b >= 45 && g < 165 ? 1 : 0;
    }
  }
  const limpa = morfologia(morfologia(telha, w, h, 2, true), w, h, 2, false);
  const minimo = Math.max(200, (w * h) / 2500);
  return componentes(limpa, w, h, true)
    .filter((c) => c.area >= minimo)
    .map((c) => {
      const mask = new Uint8Array(w * h);
      for (const p of c.pixels) mask[p] = 1;
      return { kind: 'edificacao' as const, outline: fitRectangle(boundaryPoints(mask, w, h, 1)) };
    });
}
