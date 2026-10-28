import { add, fromAngle, rotate, scale, type Vec2 } from '@core/geometry/vec';
import { formatHeights, obstacleExtent, obstacleLabel } from '@core/library/obstacles';
import { timingExtent } from '@core/library/timing';
import { arenaPoints } from '@core/model/arena';
import { formatDistance, legLength, pathLength } from '@core/model/path';
import type { CourseDocument, Obstacle, ObjectId, TimingLine } from '@core/model/types';
import { mmPerMeter } from '@core/scale/units';
import { insidePolygon, obstacleFootprint } from './ridePath';
import { courseDistancesAlong, pathSampler } from './obstacleDistances';

/**
 * Onde cada rótulo AUTOMÁTICO vai, sem cobrir o desenho (decisão 55).
 *
 * Os rótulos nasciam numa posição fixa em relação ao objeto — o número ao
 * lado, a altura atrás, "Partida" acima, a distância no meio do trecho — e
 * caíam em cima da linha do traçado, de outro obstáculo, 
 * ou de outro rótulo. Ler o croqui ficava difícil.
 *
 * Agora cada rótulo tem uma lista de posições candidatas, da preferida à
 * menos usual, e fica com a que menos esbarra. A posição preferida ainda
 * ganha quando está livre: o croqui continua com a cara de sempre e só
 * muda onde havia choque. Rótulo posicionado à mão (auto desligado) fica
 * onde o desenhador pôs, e entra como obstáculo para os outros.
 *
 * Tudo em metros do terreno; os tamanhos de letra vêm em mm de papel e
 * são convertidos pela escala, porque é no papel que o choque se vê.
 */
export interface LabelLayout {
  /** Centro do número de cada obstáculo. */
  number: Map<ObjectId, Vec2>;
  /** Centro do rótulo de alturas. */
  heights: Map<ObjectId, Vec2>;
  /** Centro do rótulo da cruzada de tempo ("Partida", "Chegada"). */
  timing: Map<ObjectId, Vec2>;
  /**
   * Por traçado, cada distância entre obstáculos mostrada: o centro do
   * texto e o giro. O número é escrito SOBRE a linha, apoiado nela e
   * paralelo a ela, como uma cota (decisão 56).
   */
  distances: Map<ObjectId, Map<string, OnLineLabel>>;
}

export interface OnLineLabel {
  /** Centro do texto, em metros. */
  pos: Vec2;
  /** Giro do texto em graus, sempre entre −90 e 90: nunca de cabeça para baixo. */
  angle: number;
}

/** Folga entre a linha e a base do texto, em mm de papel. */
export const ON_LINE_GAP_MM = 0.5;

/** Chaves de `LabelLayout.distances` para o total e para cada trecho. */
export const TOTAL_KEY = 'total';
export const legKey = (i: number): string => `trecho:${i}`;

/**
 * Onde um texto apoiado na linha fica: o giro acompanha a tangente,
 * corrigido para não ler de cabeça para baixo, e o centro sobe meia
 * altura (mais a folga) para o lado de cima do texto.
 */
export function onLinePlacement(ponto: Vec2, tangente: Vec2, alturaM: number, folgaM: number): OnLineLabel {
  let angle = (Math.atan2(tangente.y, tangente.x) * 180) / Math.PI;
  if (angle > 90) angle -= 180;
  if (angle <= -90) angle += 180;
  const a = (angle * Math.PI) / 180;
  // "Para cima" do texto girado: (0, −1) girado pelo mesmo ângulo.
  const cima = { x: Math.sin(a), y: -Math.cos(a) };
  const d = alturaM / 2 + folgaM;
  return { pos: { x: ponto.x + cima.x * d, y: ponto.y + cima.y * d }, angle };
}

/**
 * Texto deitado (horizontal) ao lado de uma linha: o centro sai do ponto na
 * direção `lado` (unitário) o bastante para a caixa do texto não tocar a
 * linha, mais a folga. Serve a qualquer giro da linha. Unidades livres,
 * desde que todas iguais (mm de papel ou metros).
 */
export function besideLinePlacement(ponto: Vec2, lado: Vec2, larguraTexto: number, alturaTexto: number, folga: number): Vec2 {
  const d = (Math.abs(lado.x) * larguraTexto + Math.abs(lado.y) * alturaTexto) / 2 + folga;
  return { x: ponto.x + lado.x * d, y: ponto.y + lado.y * d };
}

/** Largura aproximada de um texto, na mesma unidade do corpo da letra. */
export const textWidth = (texto: string, corpo: number): number => Math.max(1, texto.length) * corpo * 0.6;

/** Caixa alinhada aos eixos que contém o texto girado. */
function rotatedTextBox(lbl: OnLineLabel, texto: string, fontMm: number, k: number): Box {
  const w = textWidth(texto, fontMm) / k;
  const h = (fontMm * 1.05) / k;
  const a = (lbl.angle * Math.PI) / 180;
  const hw = (Math.abs(Math.cos(a)) * w + Math.abs(Math.sin(a)) * h) / 2;
  const hh = (Math.abs(Math.sin(a)) * w + Math.abs(Math.cos(a)) * h) / 2;
  return { min: { x: lbl.pos.x - hw, y: lbl.pos.y - hh }, max: { x: lbl.pos.x + hw, y: lbl.pos.y + hh } };
}

/** Corpos de letra usados no desenho, em mm de papel (tokens de texto). */
export const LABEL_FONT_MM = { number: 3.5, heights: 2.2, timing: 2.8, distance: 2.2 } as const;

/** Corpo das distâncias de um traçado: o escolhido no painel, ou o padrão. */
export const distanceFontMm = (p: { distanceSizeMm?: number }): number =>
  p.distanceSizeMm ?? LABEL_FONT_MM.distance;

interface Box {
  min: Vec2;
  max: Vec2;
}

type Segment = [Vec2, Vec2];

/** Pesos: o que mais atrapalha a leitura custa mais. */
const PESO = { obstaculo: 100, rotulo: 90, seta: 60, tracado: 55, pista: 12 };

/** Caixa estimada de um texto: 0,6 do corpo por caractere, bold um pouco mais. */
function textBox(centro: Vec2, texto: string, fontMm: number, k: number, bold: boolean): Box {
  const w = (Math.max(1, texto.length) * fontMm * (bold ? 0.66 : 0.6)) / k;
  const h = (fontMm * 1.05) / k;
  return {
    min: { x: centro.x - w / 2, y: centro.y - h / 2 },
    max: { x: centro.x + w / 2, y: centro.y + h / 2 },
  };
}

const inflate = (b: Box, m: number): Box => ({
  min: { x: b.min.x - m, y: b.min.y - m },
  max: { x: b.max.x + m, y: b.max.y + m },
});

const boxesTouch = (a: Box, b: Box): boolean =>
  a.min.x <= b.max.x && a.max.x >= b.min.x && a.min.y <= b.max.y && a.max.y >= b.min.y;

const pointInBox = (p: Vec2, b: Box): boolean =>
  p.x >= b.min.x && p.x <= b.max.x && p.y >= b.min.y && p.y <= b.max.y;

/** Segmento atravessa a caixa (Liang–Barsky). */
function segmentHitsBox([a, b]: Segment, box: Box): boolean {
  let t0 = 0;
  let t1 = 1;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const testes: [number, number][] = [
    [-dx, a.x - box.min.x],
    [dx, box.max.x - a.x],
    [-dy, a.y - box.min.y],
    [dy, box.max.y - a.y],
  ];
  for (const [p, q] of testes) {
    if (p === 0) {
      if (q < 0) return false;
    } else {
      const r = q / p;
      if (p < 0) {
        if (r > t1) return false;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return false;
        if (r < t1) t1 = r;
      }
    }
  }
  return true;
}

function polygonHitsBox(poly: Vec2[], box: Box): boolean {
  if (poly.some((p) => pointInBox(p, box))) return true;
  const cantos = [box.min, { x: box.max.x, y: box.min.y }, box.max, { x: box.min.x, y: box.max.y }];
  if (cantos.some((c) => insidePolygon(c, poly))) return true;
  for (let i = 0; i < poly.length; i += 1) {
    if (segmentHitsBox([poly[i]!, poly[(i + 1) % poly.length]!], box)) return true;
  }
  return false;
}

/** Segmentos agrupados com a caixa de cada grupo, para descartar rápido. */
interface SegmentGroup {
  box: Box;
  segs: Segment[];
}

function groupSegments(segs: Segment[], tamanho = 24): SegmentGroup[] {
  const grupos: SegmentGroup[] = [];
  for (let i = 0; i < segs.length; i += tamanho) {
    const parte = segs.slice(i, i + tamanho);
    const xs = parte.flatMap(([a, b]) => [a.x, b.x]);
    const ys = parte.flatMap(([a, b]) => [a.y, b.y]);
    grupos.push({
      box: { min: { x: Math.min(...xs), y: Math.min(...ys) }, max: { x: Math.max(...xs), y: Math.max(...ys) } },
      segs: parte,
    });
  }
  return grupos;
}

const hitsAny = (grupos: SegmentGroup[], box: Box): number => {
  let n = 0;
  for (const g of grupos) {
    if (!boxesTouch(g.box, box)) continue;
    for (const s of g.segs) if (segmentHitsBox(s, box)) n += 1;
  }
  return n;
};

export function layoutLabels(doc: CourseDocument): LabelLayout {
  const k = mmPerMeter(doc.page.printScale);
  const obstaculos = doc.objects.filter((o): o is Obstacle => o.kind === 'obstacle' && o.visible);
  const cruzadas = doc.objects.filter((o): o is TimingLine => o.kind === 'timing' && o.visible);
  const tracados = doc.objects.filter((o) => o.kind === 'path' && o.visible);

  /* ------------------------------------------------ o que não se cobre */

  const corpos = [
    ...obstaculos.map((o) => obstacleFootprint(o)),
    ...cruzadas.map((t) => {
      const e = timingExtent(t);
      return [
        { x: -e.halfWidthM, y: e.frontM },
        { x: e.halfWidthM, y: e.frontM },
        { x: e.halfWidthM, y: e.backM },
        { x: -e.halfWidthM, y: e.backM },
      ].map((c) => add(rotate(c, t.rotation), t.pos));
    }),
  ];

  // A seta de cada obstáculo e cruzada: do corpo até a ponta.
  const setas: Segment[] = [];
  for (const o of obstaculos) {
    if (!o.arrow.visible) continue;
    const ext = obstacleExtent(o);
    const dir = o.arrow.reversed ? 1 : -1;
    const borda = dir < 0 ? -ext.frontM : ext.backM;
    const de = { x: 0, y: dir * (borda + 1 / k) };
    const ate = { x: 0, y: dir * (borda + (1 + o.arrow.lengthMm) / k) };
    setas.push([add(rotate(de, o.rotation), o.pos), add(rotate(ate, o.rotation), o.pos)]);
  }
  for (const t of cruzadas) {
    if (!t.arrow.visible) continue;
    const dir = t.arrow.reversed ? 1 : -1;
    const meia = t.wings.depthM / 2;
    const ate = { x: 0, y: dir * (meia + (1 + t.arrow.lengthMm) / k) };
    setas.push([t.pos, add(rotate(ate, t.rotation), t.pos)]);
  }


  const linhasTracado: Segment[] = [];
  for (const p of tracados) {
    if (p.kind !== 'path') continue;
    const a = pathSampler(p);
    if (!a) continue;
    for (let i = 1; i < a.pts.length; i += 1) linhasTracado.push([a.pts[i - 1]!, a.pts[i]!]);
  }
  const gruposTracado = groupSegments(linhasTracado);

  const linhasPista: Segment[] = [];
  for (const o of doc.objects) {
    if (o.kind !== 'arena' || o.structure || !o.visible) continue;
    const pts = arenaPoints(o);
    for (let i = 0; i < pts.length; i += 1) linhasPista.push([pts[i]!, pts[(i + 1) % pts.length]!]);
  }
  const gruposSetas = groupSegments(setas, 8);
  const gruposPista = groupSegments(linhasPista, 8);

  const colocados: Box[] = [];
  const folga = 0.6 / k;

  /** Custo de pôr um rótulo nesta caixa. `dono` é o objeto do próprio rótulo. */
  const custo = (box: Box, donoCorpo: number | null): number => {
    const b = inflate(box, folga);
    let c = 0;
    corpos.forEach((poly, i) => {
      if (i !== donoCorpo && polygonHitsBox(poly, b)) c += PESO.obstaculo;
    });
    // O próprio corpo também não pode ser coberto, só com peso menor.
    if (donoCorpo !== null && polygonHitsBox(corpos[donoCorpo]!, box)) c += PESO.obstaculo;
    c += PESO.seta * Math.min(3, hitsAny(gruposSetas, b));
    c += PESO.tracado * Math.min(4, hitsAny(gruposTracado, b));
    c += PESO.pista * Math.min(2, hitsAny(gruposPista, b));
    for (const r of colocados) if (boxesTouch(r, b)) c += PESO.rotulo;
    return c;
  };

  /** Fica com o candidato de menor custo; empate decide pela ordem (preferência). */
  const escolhe = (candidatos: Box[], donoCorpo: number | null): Box => {
    let melhor = candidatos[0]!;
    let melhorCusto = Infinity;
    candidatos.forEach((cand, i) => {
      const c = custo(cand, donoCorpo) + i * 0.8;
      if (c < melhorCusto) {
        melhorCusto = c;
        melhor = cand;
      }
    });
    colocados.push(melhor);
    return melhor;
  };

  const centro = (b: Box): Vec2 => ({ x: (b.min.x + b.max.x) / 2, y: (b.min.y + b.max.y) / 2 });

  /**
   * Candidatos em volta de um objeto: direções no sistema LOCAL dele (a
   * preferida primeiro), cada uma em três distâncias. A distância conta a
   * meia caixa do texto na direção, para a borda — e não o centro — ficar
   * na folga pedida.
   */
  const emVolta = (
    pos: Vec2,
    rotacao: number,
    angulosLocais: number[],
    raio: (dirLocal: Vec2) => number,
    texto: string,
    fontMm: number,
    bold: boolean,
  ): Box[] => {
    const base = textBox({ x: 0, y: 0 }, texto, fontMm, k, bold);
    const meiaW = base.max.x;
    const meiaH = base.max.y;
    const out: Box[] = [];
    for (const extra of [0, 1.4 / k * 1.5, 3.2 / k * 1.5]) {
      for (const a of angulosLocais) {
        const local = fromAngle(a);
        const mundo = rotate(local, rotacao);
        const r = raio(local) + extra + Math.abs(mundo.x) * meiaW + Math.abs(mundo.y) * meiaH;
        out.push(textBox(add(pos, scale(mundo, r)), texto, fontMm, k, bold));
      }
    }
    return out;
  };

  const resultado: LabelLayout = {
    number: new Map(),
    heights: new Map(),
    timing: new Map(),
    distances: new Map(),
  };

  // Rótulos à mão entram primeiro: são fixos, e os outros fogem deles.
  obstaculos.forEach((o) => {
    for (const qual of ['numberLabel', 'heightLabel'] as const) {
      const r = o[qual];
      if (!r.visible || r.auto) continue;
      const texto = qual === 'numberLabel' ? obstacleLabel(o) : formatHeights(o);
      if (texto === '') continue;
      const c = add(o.pos, rotate(r.offsetM, o.rotation));
      const font = qual === 'numberLabel' ? LABEL_FONT_MM.number : LABEL_FONT_MM.heights;
      colocados.push(textBox(c, texto, font, k, qual === 'numberLabel'));
      (qual === 'numberLabel' ? resultado.number : resultado.heights).set(o.id, c);
    }
  });

  /* ---------------------------------------------- partida e chegada */

  cruzadas.forEach((t, i) => {
    if (!t.labelVisible || t.label === '') return;
    const idx = obstaculos.length + i;
    const e = timingExtent(t);
    // Preferência: atrás da linha (de onde o cavalo vem), depois os lados
    // e as diagonais. O traçado cruza a linha bem no meio, então atrás e na
    // frente quase sempre têm linha; os lados ficam livres.
    const tras = t.arrow.reversed ? -90 : 90;
    const angulos = [tras, 0, 180, tras - 40, tras + 40, -tras - 40, -tras + 40, -tras];
    const raio = (d: Vec2) =>
      Math.abs(d.x) * (e.halfWidthM + 0.6) + Math.abs(d.y) * (e.backM + 1.2);
    const b = escolhe(emVolta(t.pos, t.rotation, angulos, raio, t.label, LABEL_FONT_MM.timing, true), idx);
    resultado.timing.set(t.id, centro(b));
  });

  /* ------------------------------------------ número e alturas */

  obstaculos.forEach((o, idx) => {
    const ext = obstacleExtent(o);
    const lateral = ext.halfWidthM + (o.wings.style === 'paraflanco' ? o.wings.widthM : 0);
    const raio = (d: Vec2) =>
      Math.abs(d.x) * (lateral + 0.5) +
      Math.abs(d.y) * (Math.max(ext.backM, -ext.frontM) + 0.6);

    const numero = obstacleLabel(o);
    if (o.numberLabel.visible && o.numberLabel.auto && numero !== '') {
      // Ao lado primeiro (como sempre foi), depois as diagonais de trás, o
      // outro lado e, por último, a frente — por onde sai a seta.
      const tras = o.arrow.reversed ? -90 : 90;
      const angulos = [0, 180, tras - 45, tras + 45, tras, 360 - (tras - 45), 360 - (tras + 45), -tras];
      const b = escolhe(emVolta(o.pos, o.rotation, angulos, raio, numero, LABEL_FONT_MM.number, true), idx);
      resultado.number.set(o.id, centro(b));
    }

    const alturas = formatHeights(o);
    if (o.heightLabel.visible && o.heightLabel.auto && alturas !== '') {
      const tras = o.arrow.reversed ? -90 : 90;
      const angulos = [tras, tras - 35, tras + 35, 0, 180];
      const b = escolhe(emVolta(o.pos, o.rotation, angulos, raio, alturas, LABEL_FONT_MM.heights, false), idx);
      resultado.heights.set(o.id, centro(b));
    }
  });

  /* ------------------------------------------ distâncias no traçado */

  // Escritas sobre a linha: o candidato muda só de lugar AO LONGO do trecho.
  // A própria linha não conta como choque — o texto mora nela —, mas as
  // outras linhas, obstáculos, setas e rótulos contam.
  for (const p of tracados) {
    if (p.kind !== 'path') continue;
    const marcadas = p.obstacleDistances ?? {};
    // O croqui mostra só as distâncias entre esforços marcadas no painel;
    // o total fica no painel (o modo de antes não conta mais).
    const temTotal = false;
    const pares = courseDistancesAlong(p, obstaculos, cruzadas);
    // De nó a nó só quando o traçado não liga dois obstáculos (decisão 76).
    const temTrechos = false;
    if (!temTotal && !temTrechos && !Object.values(marcadas).some(Boolean)) continue;
    const amostra = pathSampler(p);
    if (!amostra) continue;
    const outrasLinhas = groupSegments(
      tracados
        .filter((q) => q !== p && q.kind === 'path')
        .flatMap((q) => {
          const a = q.kind === 'path' ? pathSampler(q) : null;
          return a ? a.pts.slice(1).map((pt, i) => [a.pts[i]!, pt] as Segment) : [];
        }),
    );
    const corpo = distanceFontMm(p);
    const altura = (corpo * 1.05) / k;
    const mapa = new Map<string, OnLineLabel>();
    // Procura, entre sFrom e sTo, o ponto do traçado onde o número não cobre nada.
    const colocar = (chave: string, sDe: number, sAte: number, texto: string): void => {
      let melhor: { lbl: OnLineLabel; box: Box } | null = null;
      let melhorCusto = Infinity;
      [0.5, 0.42, 0.58, 0.34, 0.66, 0.26, 0.74, 0.18, 0.82].forEach((f, i) => {
        const s = sDe + (sAte - sDe) * f;
        const { p: ponto, normal } = amostra.pointAt(s);
        const tangente = { x: normal.y, y: -normal.x };
        const lbl = onLinePlacement(ponto, tangente, altura, ON_LINE_GAP_MM / k);
        const box = rotatedTextBox(lbl, texto, corpo, k);
        const b = inflate(box, folga * 0.5);
        let c = i * 0.8;
        corpos.forEach((poly) => {
          if (polygonHitsBox(poly, b)) c += PESO.obstaculo;
        });
        // A seta corre sobre a própria linha: a ponta dela, larga, encosta
        // no número mesmo quando o eixo não toca a caixa.
        c += PESO.seta * Math.min(3, hitsAny(gruposSetas, inflate(box, 1.5 / k)));
        c += PESO.tracado * Math.min(4, hitsAny(outrasLinhas, b));
        for (const r of colocados) if (boxesTouch(r, b)) c += PESO.rotulo;
        if (c < melhorCusto) {
          melhorCusto = c;
          melhor = { lbl, box };
        }
      });
      if (melhor) {
        const m = melhor as { lbl: OnLineLabel; box: Box };
        colocados.push(m.box);
        mapa.set(chave, m.lbl);
      }
    };
    if (temTotal) {
      const total = pathLength(p);
      colocar(TOTAL_KEY, 0, total, formatDistance(total, p.totalLabel.decimals));
    }
    if (temTrechos) {
      let s0 = 0;
      p.legs.forEach((leg, i) => {
        const len = legLength(p, i);
        if (leg.label.visible) colocar(legKey(i), s0, s0 + len, formatDistance(len, leg.label.decimals));
        s0 += len;
      });
    }
    for (const d of pares) {
      if (!marcadas[d.key]) continue;
      colocar(d.key, d.sFrom, d.sTo, `${formatDistance(d.meters, 2)} m`);
    }
    resultado.distances.set(p.id, mapa);
  }

  return resultado;
}
