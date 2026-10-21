import type { Vec2 } from '@core/geometry/vec';
import { rotate } from '@core/geometry/vec';
import { obstacleExtent } from '@core/library/obstacles';
import { timingExtent } from '@core/library/timing';
import { heightTableLayout, infoBoxLayout } from './annotationLayout';
import { arenaPoints } from './arena';
import { flattenPath } from './path';
import { paperToMeters } from '@core/scale/units';
import type { Meters, PrintScale } from '@core/scale/units';
import type { CourseDocument, Logo, ObjectScope, Obstacle, SceneObject } from './types';

/** Altura do logo na folha: sai da largura e da proporção do arquivo. */
export const logoHeightMm = (logo: Logo): number =>
  (logo.widthMm * logo.heightPx) / Math.max(1, logo.widthPx);

/**
 * Acesso genérico a posição, rotação e envoltória de qualquer objeto da
 * cena. É a camada que permite que seleção, mover, girar e o painel de
 * propriedades funcionem para todos os tipos sem um `switch` espalhado
 * pela interface — cada fase nova só precisa ensinar o objeto novo aqui.
 *
 * Convenção: tudo em METROS. Objetos ancorados no papel (quadro técnico,
 * tabela) são convertidos pela escala de impressão na entrada e na saída.
 */

export interface Bounds {
  min: Vec2;
  max: Vec2;
}

/**
 * Escopo padrão de cada tipo: o que é do local fica na pista, o que muda a
 * cada prova fica no percurso. Vale para arquivos antigos e para qualquer
 * objeto que apareça sem escopo definido.
 */
export function defaultScope(kind: SceneObject['kind']): ObjectScope {
  switch (kind) {
    case 'arena':
    case 'image':
    case 'ornament':
      return 'pista';
    default:
      return 'percurso';
  }
}

export const objectScope = (obj: SceneObject): ObjectScope =>
  obj.scope ?? defaultScope(obj.kind);

/** Objetos posicionados em milímetros de papel, não em metros do terreno. */
export function isPaperAnchored(obj: SceneObject): boolean {
  return obj.kind === 'infobox' || obj.kind === 'heighttable' || obj.kind === 'logo';
}

export function getPosition(obj: SceneObject, printScale: PrintScale): Vec2 {
  switch (obj.kind) {
    case 'arena':
      return obj.shape === 'rectangle' ? obj.origin : polygonCentroid(obj.points);
    case 'image':
      return obj.origin;
    case 'path':
      return obj.nodes[0]?.pos ?? { x: 0, y: 0 };
    case 'infobox':
    case 'heighttable':
    case 'logo':
      return {
        x: paperToMeters(obj.posMm.x, printScale),
        y: paperToMeters(obj.posMm.y, printScale),
      };
    default:
      return obj.pos;
  }
}

export function translate(obj: SceneObject, deltaM: Vec2, printScale: PrintScale): void {
  switch (obj.kind) {
    case 'arena':
      obj.origin = add(obj.origin, deltaM);
      obj.points = obj.points.map((p) => add(p, deltaM));
      return;
    case 'image':
      obj.origin = add(obj.origin, deltaM);
      return;
    case 'path':
      for (const node of obj.nodes) node.pos = add(node.pos, deltaM);
      return;
    case 'infobox':
    case 'heighttable':
    case 'logo': {
      const k = 1000 / printScale;
      obj.posMm = { x: obj.posMm.x + deltaM.x * k, y: obj.posMm.y + deltaM.y * k };
      return;
    }
    default:
      obj.pos = add(obj.pos, deltaM);
  }
}

export function setPosition(obj: SceneObject, posM: Vec2, printScale: PrintScale): void {
  const current = getPosition(obj, printScale);
  translate(obj, { x: posM.x - current.x, y: posM.y - current.y }, printScale);
}

/** `null` quando o tipo não tem rotação própria (pista, quadros, traçado). */
export function getRotation(obj: SceneObject): number | null {
  switch (obj.kind) {
    case 'obstacle':
    case 'ornament':
    case 'text':
    case 'image':
    case 'timing':
      return obj.rotation;
    default:
      return null;
  }
}

export function setRotation(obj: SceneObject, degrees: number): void {
  switch (obj.kind) {
    case 'obstacle':
    case 'ornament':
    case 'text':
    case 'image':
    case 'timing':
      obj.rotation = degrees;
      return;
    default:
  }
}

/**
 * Gira o objeto em torno de um ponto arbitrário: a rotação de uma seleção
 * múltipla acontece em torno do centro da seleção, não de cada objeto.
 */
export function rotateAround(
  obj: SceneObject,
  pivotM: Vec2,
  deltaDeg: number,
  printScale: PrintScale,
): void {
  const pos = getPosition(obj, printScale);
  setPosition(obj, rotate(pos, deltaDeg, pivotM), printScale);
  const r = getRotation(obj);
  if (r !== null) setRotation(obj, r + deltaDeg);
}

/* ------------------------------------------------------------ envoltória */

export function getBounds(
  obj: SceneObject,
  printScale: PrintScale,
  /** Só a tabela de alturas precisa: ela mede pelas linhas que vai imprimir. */
  obstacles: Obstacle[] = [],
): Bounds {
  switch (obj.kind) {
    case 'arena':
      return boundsOf(arenaPoints(obj));
    case 'obstacle': {
      const ext = obstacleExtent(obj);
      const halfW = ext.halfWidthM;
      // Um vertical não tem profundidade: garante um alvo clicável mínimo.
      const front = Math.min(ext.frontM, -0.3);
      const back = Math.max(ext.backM, 0.3);
      const corners = [
        { x: -halfW, y: front },
        { x: halfW, y: front },
        { x: halfW, y: back },
        { x: -halfW, y: back },
      ].map((c) => add(rotate(c, obj.rotation), obj.pos));
      return boundsOf(corners);
    }
    case 'timing': {
      const ext = timingExtent(obj);
      const corners = [
        { x: -ext.halfWidthM, y: ext.frontM },
        { x: ext.halfWidthM, y: ext.frontM },
        { x: ext.halfWidthM, y: ext.backM },
        { x: -ext.halfWidthM, y: ext.backM },
      ].map((c) => add(rotate(c, obj.rotation), obj.pos));
      return boundsOf(corners);
    }
    case 'ornament': {
      const h = obj.sizeM / 2;
      return {
        min: { x: obj.pos.x - h, y: obj.pos.y - h },
        max: { x: obj.pos.x + h, y: obj.pos.y + h },
      };
    }
    case 'path':
      // Pela poligonal, não pelos nós: uma curva pode sair bem além deles.
      return boundsOf(flattenPath(obj, 0.05));
    case 'text': {
      // Aproximação: 0,55 de largura média por caractere no corpo do texto.
      const h = paperToMeters(obj.sizeMm, printScale);
      const w = h * 0.55 * Math.max(1, obj.text.length);
      const dx = obj.align === 'middle' ? -w / 2 : obj.align === 'end' ? -w : 0;
      return {
        min: { x: obj.pos.x + dx, y: obj.pos.y - h },
        max: { x: obj.pos.x + dx + w, y: obj.pos.y + h * 0.25 },
      };
    }
    case 'image': {
      const w = obj.widthPx * obj.metersPerPixel;
      const h = obj.heightPx * obj.metersPerPixel;
      const corners = [
        { x: 0, y: 0 },
        { x: w, y: 0 },
        { x: w, y: h },
        { x: 0, y: h },
      ].map((c) => add(rotate(c, obj.rotation), obj.origin));
      return boundsOf(corners);
    }
    // Quadro e tabela usam o MESMO leiaute do desenho, e não uma
    // estimativa: seleção que não bate com o que se vê é seleção que erra
    // o clique. A tabela não sabe dos obstáculos aqui, então usa a largura
    // real e uma altura por linha — quem precisa do exato passa a lista.
    case 'infobox': {
      const pos = getPosition(obj, printScale);
      const l = infoBoxLayout(obj);
      return {
        min: pos,
        max: {
          x: pos.x + paperToMeters(l.widthMm, printScale),
          y: pos.y + paperToMeters(l.heightMm, printScale),
        },
      };
    }
    case 'logo': {
      const pos = getPosition(obj, printScale);
      return {
        min: pos,
        max: {
          x: pos.x + paperToMeters(obj.widthMm, printScale),
          y: pos.y + paperToMeters(logoHeightMm(obj), printScale),
        },
      };
    }
    case 'heighttable': {
      const pos = getPosition(obj, printScale);
      const l = heightTableLayout(obj, obstacles ?? []);
      return {
        min: pos,
        max: {
          x: pos.x + paperToMeters(l.widthMm, printScale),
          y: pos.y + paperToMeters(l.heightMm, printScale),
        },
      };
    }
  }
}

export function unionBounds(list: Bounds[]): Bounds | null {
  if (list.length === 0) return null;
  const first = list[0]!;
  let { min, max } = { min: { ...first.min }, max: { ...first.max } };
  for (const b of list.slice(1)) {
    min = { x: Math.min(min.x, b.min.x), y: Math.min(min.y, b.min.y) };
    max = { x: Math.max(max.x, b.max.x), y: Math.max(max.y, b.max.y) };
  }
  return { min, max };
}

export const boundsCenter = (b: Bounds): Vec2 => ({
  x: (b.min.x + b.max.x) / 2,
  y: (b.min.y + b.max.y) / 2,
});

export function boundsIntersect(a: Bounds, b: Bounds): boolean {
  return !(a.max.x < b.min.x || a.min.x > b.max.x || a.max.y < b.min.y || a.min.y > b.max.y);
}

/**
 * `inner` está inteiramente dentro de `outer`.
 * O laço de seleção usa contenção, não interseção: por interseção, a pista
 * — que cobre toda a área de trabalho — entraria em qualquer laço desenhado
 * sobre ela.
 */
export function boundsContains(outer: Bounds, inner: Bounds): boolean {
  return (
    inner.min.x >= outer.min.x &&
    inner.min.y >= outer.min.y &&
    inner.max.x <= outer.max.x &&
    inner.max.y <= outer.max.y
  );
}

export function boundsContainsPoint(b: Bounds, p: Vec2, tolerance: Meters = 0): boolean {
  return (
    p.x >= b.min.x - tolerance &&
    p.x <= b.max.x + tolerance &&
    p.y >= b.min.y - tolerance &&
    p.y <= b.max.y + tolerance
  );
}

/* ---------------------------------------------------------------- apoio */

const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });

function boundsOf(points: Vec2[]): Bounds {
  if (points.length === 0) return { min: { x: 0, y: 0 }, max: { x: 0, y: 0 } };
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return {
    min: { x: Math.min(...xs), y: Math.min(...ys) },
    max: { x: Math.max(...xs), y: Math.max(...ys) },
  };
}

function polygonCentroid(points: Vec2[]): Vec2 {
  if (points.length === 0) return { x: 0, y: 0 };
  const sum = points.reduce((acc, p) => add(acc, p), { x: 0, y: 0 });
  return { x: sum.x / points.length, y: sum.y / points.length };
}

/**
 * Limites de um objeto dentro do documento.
 *
 * Atalho para quem tem o documento na mão: a tabela de alturas mede pelos
 * obstáculos, e esquecer de passá-los daria um retângulo de seleção menor
 * que a tabela desenhada.
 */
export function boundsIn(doc: CourseDocument, obj: SceneObject): Bounds {
  const b = getBounds(
    obj,
    doc.page.printScale,
    doc.objects.filter((o): o is Obstacle => o.kind === 'obstacle'),
  );
  if (!isPaperAnchored(obj)) return b;
  // Quadro, tabela e logo moram em mm da FOLHA: para cair no mesmo sistema
  // do resto (metros do modelo), desconta-se a origem do desenho na folha.
  // Sem isso, a moldura de seleção saía deslocada dessa distância (B-48).
  const k = 1000 / doc.page.printScale;
  const dx = doc.originMm.x / k;
  const dy = doc.originMm.y / k;
  return { min: { x: b.min.x - dx, y: b.min.y - dy }, max: { x: b.max.x - dx, y: b.max.y - dy } };
}
