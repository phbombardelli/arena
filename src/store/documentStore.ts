import { create } from 'zustand';
import { applyPatches, enablePatches, produceWithPatches, type Patch } from 'immer';
import type { CourseDocument } from '@core/model/types';
import { createDocument } from '@core/model/document';
import { syncTimingLines } from '@core/library/timing';
import { syncPathAnchors } from '@core/commands/pathAnchors';
import { enforceLockedDistances } from '@core/commands/distanceOps';
import type { FileHandleLike } from '@platform/fileSystem';

enablePatches();

interface HistoryEntry {
  label: string;
  /** Chave de coalescência: entradas seguidas com a mesma chave viram uma só. */
  mergeKey: string | null;
  redo: Patch[];
  undo: Patch[];
}

const HISTORY_LIMIT = 200;

interface DocumentState {
  doc: CourseDocument;
  past: HistoryEntry[];
  future: HistoryEntry[];
  dirty: boolean;
  fileName: string | null;
  /** Arquivo aberto, quando o navegador permite gravar por cima. */
  fileHandle: FileHandleLike | null;

  /** Única porta de entrada para mutar o documento. */
  apply: (label: string, recipe: (draft: CourseDocument) => void, mergeKey?: string) => void;
  /** Mutação sem histórico — só para carregar/trocar o documento inteiro. */
  replace: (doc: CourseDocument, file?: { name: string | null; handle: FileHandleLike | null }) => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  markSaved: (file: { name: string; handle: FileHandleLike | null }) => void;
}

export const useDocumentStore = create<DocumentState>((set, get) => ({
  doc: createDocument(),
  past: [],
  future: [],
  dirty: false,
  fileName: null,
  fileHandle: null,

  apply: (label, recipe, mergeKey) => {
    const state = get();
    const [nextDoc, redo, undo] = produceWithPatches(state.doc, (draft) => {
      recipe(draft);
      // Invariante da cronometragem, garantida num lugar só: a cruzada
      // vinculada acompanha o obstáculo, tenha ele sido movido, girado,
      // colado ou trazido de volta pelo desfazer. Espalhar isso pelos
      // comandos seria esquecer em um deles.
      syncTimingLines(draft);
      syncPathAnchors(draft);
      enforceLockedDistances(draft);
    });
    if (redo.length === 0) return;

    const last = state.past[state.past.length - 1];
    const canMerge = mergeKey != null && last != null && last.mergeKey === mergeKey;

    const entry: HistoryEntry = canMerge
      ? {
          label,
          mergeKey,
          // Refazer acumula na ordem; desfazer acumula na ordem inversa.
          redo: [...last!.redo, ...redo],
          undo: [...undo, ...last!.undo],
        }
      : { label, mergeKey: mergeKey ?? null, redo, undo };

    const past = canMerge ? state.past.slice(0, -1) : state.past;
    past.push(entry);
    if (past.length > HISTORY_LIMIT) past.shift();

    set({ doc: nextDoc, past, future: [], dirty: true });
  },

  replace: (doc, file) =>
    set({
      doc,
      past: [],
      future: [],
      dirty: false,
      fileName: file?.name ?? null,
      fileHandle: file?.handle ?? null,
    }),

  undo: () => {
    const { past, future, doc } = get();
    const entry = past[past.length - 1];
    if (!entry) return;
    set({
      doc: applyPatches(doc, entry.undo),
      past: past.slice(0, -1),
      future: [...future, entry],
      dirty: true,
    });
  },

  redo: () => {
    const { past, future, doc } = get();
    const entry = future[future.length - 1];
    if (!entry) return;
    set({
      doc: applyPatches(doc, entry.redo),
      past: [...past, entry],
      future: future.slice(0, -1),
      dirty: true,
    });
  },

  canUndo: () => get().past.length > 0,
  canRedo: () => get().future.length > 0,
  markSaved: ({ name, handle }) => set({ dirty: false, fileName: name, fileHandle: handle }),
}));
