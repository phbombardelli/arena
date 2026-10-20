import { newId } from '@core/model/ids';
import type { CourseDocument, ObjectId } from '@core/model/types';

/**
 * Vínculo entre objetos (decisão 61). Os vinculados se selecionam juntos —
 * clicar em um pega todos —, e por isso se movem, giram e se apagam
 * juntos. Alt + clique pega só um, para editar um elemento sem desfazer o
 * vínculo.
 */

/** A seleção com todos os vinculados de cada objeto dela. */
export function withLinked(doc: CourseDocument, ids: ObjectId[]): ObjectId[] {
  const grupos = new Set(
    doc.objects.filter((o) => ids.includes(o.id) && o.group).map((o) => o.group!),
  );
  if (grupos.size === 0) return ids;
  const extra = doc.objects
    .filter((o) => o.group && grupos.has(o.group) && !ids.includes(o.id))
    .map((o) => o.id);
  return [...ids, ...extra];
}

/** Vincula os objetos — juntando também os grupos de que eles já fazem parte. */
export function linkObjects(doc: CourseDocument, ids: ObjectId[]): void {
  const todos = withLinked(doc, ids);
  if (todos.length < 2) return;
  const grupo = newId('grp');
  for (const o of doc.objects) if (todos.includes(o.id)) o.group = grupo;
}

/** Desfaz o vínculo dos objetos e de todos os vinculados a eles. */
export function unlinkObjects(doc: CourseDocument, ids: ObjectId[]): void {
  const todos = withLinked(doc, ids);
  for (const o of doc.objects) if (todos.includes(o.id)) delete o.group;
}

/** Há vínculo em jogo nesta seleção? */
export const hasLinked = (doc: CourseDocument, ids: ObjectId[]): boolean =>
  doc.objects.some((o) => ids.includes(o.id) && o.group !== undefined);
