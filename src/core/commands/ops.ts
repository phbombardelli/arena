import type { Vec2 } from '@core/geometry/vec';
import { normalizeAngle } from '@core/geometry/vec';
import { deepClone } from '@core/model/clone';
import { newId } from '@core/model/ids';
import type { CourseDocument, LayerId, ObjectId, SceneObject } from '@core/model/types';
import {
  boundsCenter,
  boundsIn,
  getRotation,
  rotateAround,
  setPosition,
  setRotation,
  translate,
  unionBounds,
} from '@core/model/transform';

/**
 * Operações sobre o documento. São funções que mutam um rascunho do Immer,
 * sempre chamadas através de `documentStore.apply`, que cuida do histórico.
 * Ficam aqui, fora da interface, para poderem ser testadas sem navegador.
 */

const selected = (doc: CourseDocument, ids: ObjectId[]): SceneObject[] =>
  doc.objects.filter((o) => ids.includes(o.id) && !o.locked);

/** Move a seleção. `deltaM` em metros. */
export function moveObjects(doc: CourseDocument, ids: ObjectId[], deltaM: Vec2): void {
  for (const obj of selected(doc, ids)) translate(obj, deltaM, doc.page.printScale);
}

export function setObjectPosition(
  doc: CourseDocument,
  id: ObjectId,
  posM: Vec2,
): void {
  const obj = doc.objects.find((o) => o.id === id);
  if (obj && !obj.locked) setPosition(obj, posM, doc.page.printScale);
}

/** Gira a seleção em torno do centro comum. Um objeto gira em torno de si. */
export function rotateObjects(doc: CourseDocument, ids: ObjectId[], deltaDeg: number): void {
  const objs = selected(doc, ids);
  if (objs.length === 0) return;
  if (objs.length === 1) {
    const r = getRotation(objs[0]!);
    if (r !== null) setRotation(objs[0]!, normalizeAngle(r + deltaDeg));
    return;
  }
  const bounds = unionBounds(objs.map((o) => boundsIn(doc, o)));
  if (!bounds) return;
  const pivot = boundsCenter(bounds);
  for (const obj of objs) rotateAround(obj, pivot, deltaDeg, doc.page.printScale);
}

export function setObjectRotation(doc: CourseDocument, id: ObjectId, degrees: number): void {
  const obj = doc.objects.find((o) => o.id === id);
  if (obj && !obj.locked) setRotation(obj, normalizeAngle(degrees));
}

export function deleteObjects(doc: CourseDocument, ids: ObjectId[]): void {
  doc.objects = doc.objects.filter((o) => !(ids.includes(o.id) && !o.locked));
}

export function addObject(doc: CourseDocument, obj: SceneObject): void {
  doc.objects.push({ ...obj, z: nextZ(doc, obj.layer) });
}

/**
 * Duplica preservando as ligações internas da seleção: se um traçado
 * ancorado e o obstáculo dele forem duplicados juntos, a cópia do traçado
 * aponta para a cópia do obstáculo, não para o original.
 */
export function duplicateObjects(
  doc: CourseDocument,
  ids: ObjectId[],
  offsetM: Vec2,
): ObjectId[] {
  const originals = doc.objects.filter((o) => ids.includes(o.id));
  const idMap = new Map<ObjectId, ObjectId>();
  const copies: SceneObject[] = originals.map((o) => {
    const copy = deepClone(o) as SceneObject;
    copy.id = newId(o.kind.slice(0, 3));
    copy.z = 0;
    // A cópia é do desenhador: o assistente não a substitui depois.
    if (copy.kind === 'path') delete copy.assistant;
    idMap.set(o.id, copy.id);
    return copy;
  });

  for (const copy of copies) {
    remapAnchors(copy, idMap);
    translate(copy, offsetM, doc.page.printScale);
    copy.z = nextZ(doc, copy.layer);
    doc.objects.push(copy);
  }
  return copies.map((c) => c.id);
}

function remapAnchors(obj: SceneObject, idMap: Map<ObjectId, ObjectId>): void {
  if (obj.kind !== 'path') return;
  for (const node of obj.nodes) {
    if (node.anchor) {
      const mapped = idMap.get(node.anchor.objectId);
      if (mapped) node.anchor.objectId = mapped;
      else node.anchor = null; // âncora fora da seleção vira nó livre
    }
  }
}

/* ------------------------------------------------------- empilhamento */

function nextZ(doc: CourseDocument, layer: LayerId): number {
  const zs = doc.objects.filter((o) => o.layer === layer).map((o) => o.z);
  return zs.length === 0 ? 0 : Math.max(...zs) + 1;
}

export function bringToFront(doc: CourseDocument, ids: ObjectId[]): void {
  for (const obj of selected(doc, ids)) obj.z = nextZ(doc, obj.layer);
}

export function sendToBack(doc: CourseDocument, ids: ObjectId[]): void {
  for (const obj of selected(doc, ids)) {
    const zs = doc.objects.filter((o) => o.layer === obj.layer).map((o) => o.z);
    obj.z = (zs.length === 0 ? 0 : Math.min(...zs)) - 1;
  }
}

export function setLocked(doc: CourseDocument, ids: ObjectId[], locked: boolean): void {
  for (const obj of doc.objects) if (ids.includes(obj.id)) obj.locked = locked;
}

export function setVisible(doc: CourseDocument, ids: ObjectId[], visible: boolean): void {
  for (const obj of doc.objects) if (ids.includes(obj.id)) obj.visible = visible;
}
