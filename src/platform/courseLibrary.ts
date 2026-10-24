import { newId } from '@core/model/ids';
import type { CourseDocument } from '@core/model/types';
import { serialize } from '@core/persistence/serialize';
import { idbAll, idbDelete, idbGet, idbPut } from './idb';

/**
 * "Meus percursos" (B-77, decisão 88): os percursos guardados no próprio
 * app, no banco local do navegador. Cada registro é o pacote casado —
 * pista e percurso, exatamente o conteúdo de um `.pcs` —, então abrir um
 * deles traz a pista junto, sempre.
 */

export interface CourseEntry {
  id: string;
  name: string;
  savedAt: string;
  /** A pista de onde o percurso partiu, para mostrar na lista. */
  arenaName: string | null;
  obstacleCount: number;
  /** Percurso de salto ou ginástica (B-37). */
  kind?: 'percurso' | 'ginastica';
  /** O `.pcs` inteiro. */
  text: string;
}

export type CourseSummary = Omit<CourseEntry, 'text'>;

export async function listCourses(): Promise<CourseSummary[]> {
  const todos = await idbAll<CourseEntry>('percursos');
  return todos
    .map(({ text: _text, ...resto }) => resto)
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

export const getCourse = (id: string): Promise<CourseEntry | undefined> => idbGet<CourseEntry>('percursos', id);

export const deleteCourse = (id: string): Promise<void> => idbDelete('percursos', id);

/** Grava (ou atualiza, com `id`) o percurso aberto. Devolve o registro. */
export async function saveCourse(doc: CourseDocument, name: string, id: string | null): Promise<CourseEntry> {
  const entry: CourseEntry = {
    id: id ?? newId('pcs'),
    name,
    savedAt: new Date().toISOString(),
    arenaName: doc.arenaSource?.name ?? null,
    obstacleCount: doc.objects.filter((o) => o.kind === 'obstacle').length,
    kind: doc.kind ?? 'percurso',
    text: serialize(doc),
  };
  await idbPut('percursos', entry);
  return entry;
}
