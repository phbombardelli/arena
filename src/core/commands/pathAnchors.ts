import { add, cross, dot, fromAngle, normalizeAngle, rotate, sub } from '@core/geometry/vec';
import { jumpHeading } from '@core/assist/ridePath';
import type { CoursePath, CourseDocument, ObjectId, Obstacle } from '@core/model/types';

/**
 * Traçado preso aos obstáculos (B-59, decisão 76).
 *
 * O assistente cruza cada salto pelo centro, numa reta: os nós dessa reta
 * (o começo da aproximação e o fim da saída) ficam presos ao obstáculo.
 * Mover ou girar o obstáculo leva esses nós junto, como peça rígida; as
 * voltas entre um salto e outro, de nós livres, só esticam. Traçado à mão
 * nunca é preso.
 */

/** Até onde, sobre a reta do salto, um nó ainda é "do" obstáculo. */
const ALCANCE_M = 20;
/** Fora do eixo do salto por mais que isso, o nó é da volta, não da reta. */
const EIXO_M = 0.05;

const pose = (o: Obstacle) => ({ pos: { ...o.pos }, rotation: o.rotation });

/** Prende ao obstáculo cada nó que está sobre a reta que o cruza. */
export function anchorNodesToObstacles(path: CoursePath, obstacles: Obstacle[]): void {
  for (const node of path.nodes) {
    let melhor: { o: Obstacle; ao: number } | null = null;
    for (const o of obstacles) {
      const eixo = fromAngle(jumpHeading(o));
      const rel = sub(node.pos, o.pos);
      const ao = Math.abs(dot(rel, eixo));
      if (Math.abs(cross(eixo, rel)) > EIXO_M || ao > ALCANCE_M) continue;
      if (!melhor || ao < melhor.ao) melhor = { o, ao };
    }
    node.anchor = melhor ? { objectId: melhor.o.id, ref: 'center', at: pose(melhor.o) } : null;
  }
}

/**
 * Depois de cada edição: o nó preso anda o que o obstáculo andou desde a
 * última vez. Obstáculo que sumiu solta o nó.
 */
export function syncPathAnchors(doc: CourseDocument): void {
  const porId = new Map<ObjectId, Obstacle>();
  for (const o of doc.objects) if (o.kind === 'obstacle') porId.set(o.id, o);
  for (const obj of doc.objects) {
    if (obj.kind !== 'path') continue;
    for (const node of obj.nodes) {
      const a = node.anchor;
      if (!a) continue;
      const o = porId.get(a.objectId);
      if (!o) {
        node.anchor = null;
        continue;
      }
      if (!a.at) {
        a.at = pose(o);
        continue;
      }
      const giro = normalizeAngle(o.rotation - a.at.rotation);
      const andou = o.pos.x !== a.at.pos.x || o.pos.y !== a.at.pos.y;
      if (!andou && Math.abs(giro) < 1e-9) continue;
      node.pos = add(o.pos, rotate(sub(node.pos, a.at.pos), giro));
      if (node.handleIn) node.handleIn = rotate(node.handleIn, giro);
      if (node.handleOut) node.handleOut = rotate(node.handleOut, giro);
      a.at = pose(o);
    }
  }
}

/**
 * Traçado movido ou girado como objeto: o nó cujo obstáculo foi junto
 * continua preso (e já está no lugar); o outro se solta.
 */
export function settleMovedAnchors(doc: CourseDocument, movedIds: ObjectId[]): void {
  const movidos = new Set(movedIds);
  for (const obj of doc.objects) {
    if (obj.kind !== 'path' || !movidos.has(obj.id)) continue;
    for (const node of obj.nodes) {
      const a = node.anchor;
      if (!a) continue;
      const o = doc.objects.find((x): x is Obstacle => x.id === a.objectId && x.kind === 'obstacle');
      node.anchor = o && movidos.has(o.id) && !o.locked ? { ...a, at: pose(o) } : null;
    }
  }
}
