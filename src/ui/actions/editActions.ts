import {
  addObject,
  bringToFront,
  deleteObjects,
  duplicateObjects,
  sendToBack,
} from '@core/commands/ops';
import { linkObjects, unlinkObjects } from '@core/commands/groupOps';
import { deepClone } from '@core/model/clone';
import { newId } from '@core/model/ids';
import { objectScope, translate } from '@core/model/transform';
import type { SceneObject } from '@core/model/types';
import { useDocumentStore } from '@store/documentStore';
import { useEditorStore } from '@store/editorStore';

/**
 * Comandos de edição da seleção. Moram aqui porque têm dois caminhos de
 * entrada — o menu Editar e o teclado — e os dois precisam fazer
 * exatamente a mesma coisa.
 */

const PASTE_OFFSET_M = 1;

export function copySelection(): void {
  const ed = useEditorStore.getState();
  const { doc } = useDocumentStore.getState();
  ed.setClipboard(doc.objects.filter((o) => ed.selection.includes(o.id)).map((o) => deepClone(o)));
}

export function pasteClipboard(): void {
  const ed = useEditorStore.getState();
  if (ed.clipboard.length === 0) return;
  // As cópias ficam vinculadas entre si, não aos originais.
  const grupos = new Map<string, string>();
  const copies = ed.clipboard.map((o) => {
    const c = { ...deepClone(o), id: newId(o.kind.slice(0, 3)) } as SceneObject;
    if (c.kind === 'path') delete c.assistant;
    if (c.group) {
      if (!grupos.has(c.group)) grupos.set(c.group, newId('grp'));
      c.group = grupos.get(c.group)!;
    }
    return c;
  });
  useDocumentStore.getState().apply('Colar', (d) => {
    for (const c of copies) {
      addObject(d, c);
      const added = d.objects[d.objects.length - 1]!;
      added.id = c.id;
      translate(added, { x: PASTE_OFFSET_M, y: PASTE_OFFSET_M }, d.page.printScale);
    }
  });
  ed.setSelection(copies.map((c) => c.id));
}

export function duplicateSelection(): void {
  const ed = useEditorStore.getState();
  if (ed.selection.length === 0) return;
  let created: string[] = [];
  useDocumentStore.getState().apply('Duplicar', (d) => {
    created = duplicateObjects(d, ed.selection, { x: PASTE_OFFSET_M, y: PASTE_OFFSET_M });
  });
  ed.setSelection(created);
}

export function deleteSelection(): void {
  const ed = useEditorStore.getState();
  if (ed.selection.length === 0) return;
  useDocumentStore.getState().apply('Excluir', (d) => deleteObjects(d, ed.selection));
  ed.clearSelection();
}

/** Só o que é do modo ativo: selecionar tudo não traz o cenário junto. */
export function selectAll(): void {
  const ed = useEditorStore.getState();
  const { doc } = useDocumentStore.getState();
  ed.setSelection(
    doc.objects
      .filter((o) => !o.locked && o.visible && objectScope(o) === ed.mode)
      .map((o) => o.id),
  );
}

export function bringSelectionToFront(): void {
  const sel = useEditorStore.getState().selection;
  if (sel.length > 0) useDocumentStore.getState().apply('Trazer para frente', (d) => bringToFront(d, sel));
}

export function sendSelectionToBack(): void {
  const sel = useEditorStore.getState().selection;
  if (sel.length > 0) useDocumentStore.getState().apply('Enviar para trás', (d) => sendToBack(d, sel));
}

/** Vincula a seleção (decisão 61): passam a se mover juntos. */
export function linkSelection(): void {
  const ed = useEditorStore.getState();
  if (ed.selection.length < 2) return;
  useDocumentStore.getState().apply('Vincular', (d) => linkObjects(d, ed.selection));
}

/** Desfaz o vínculo da seleção. */
export function unlinkSelection(): void {
  const ed = useEditorStore.getState();
  if (ed.selection.length === 0) return;
  useDocumentStore.getState().apply('Desvincular', (d) => unlinkObjects(d, ed.selection));
}
