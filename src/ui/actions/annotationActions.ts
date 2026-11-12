import { addObject } from '@core/commands/ops';
import { createHeightTable, createInfoBox } from '@core/library/annotations';
import { infoBoxLayout } from '@core/model/annotationLayout';
import { usableArea } from '@core/scale/units';
import { ligaArranjo } from '@core/model/sheetLayout';
import { useDocumentStore } from '@store/documentStore';
import { useEditorStore } from '@store/editorStore';

/**
 * Inserção do quadro técnico e da tabela de alturas.
 *
 * Os dois nascem no canto da folha, não onde o cursor está: são objetos
 * de PAPEL, e o lugar natural deles é a margem, como em todo croqui
 * impresso. Arrastar depois é trivial; caçar um quadro que nasceu no meio
 * do desenho não é.
 *
 * Só um de cada: dois quadros técnicos na mesma folha é erro, não
 * recurso. Pedir de novo seleciona o que já existe.
 */
export function insertInfoBox(): void {
  const { doc, apply } = useDocumentStore.getState();
  const existente = doc.objects.find((o) => o.kind === 'infobox');
  // O que é da folha se edita na aba Impressão (B-105).
  if (useEditorStore.getState().mode !== 'impressao') useEditorStore.getState().setMode('impressao');
  if (existente) {
    useEditorStore.getState().setSelection([existente.id]);
    return;
  }

  const area = usableArea(doc.page);
  const quadro = createInfoBox({ x: area.xMm, y: area.yMm });
  apply('Inserir quadro técnico', (d) => {
    addObject(d, quadro);
    ligaArranjo(d);
  });
  useEditorStore.getState().setSelection([quadro.id]);
}

export function insertHeightTable(): void {
  const { doc, apply } = useDocumentStore.getState();
  const existente = doc.objects.find((o) => o.kind === 'heighttable');
  // O que é da folha se edita na aba Impressão (B-105).
  if (useEditorStore.getState().mode !== 'impressao') useEditorStore.getState().setMode('impressao');
  if (existente) {
    useEditorStore.getState().setSelection([existente.id]);
    return;
  }

  const area = usableArea(doc.page);
  // Abaixo do quadro técnico, quando ele já estiver na folha.
  const quadro = doc.objects.find((o) => o.kind === 'infobox');
  const y = quadro?.kind === 'infobox'
    ? quadro.posMm.y + infoBoxLayout(quadro).heightMm + 4
    : area.yMm;

  const tabela = createHeightTable({ x: area.xMm, y });
  apply('Inserir tabela de alturas', (d) => {
    addObject(d, tabela);
    ligaArranjo(d);
  });
  useEditorStore.getState().setSelection([tabela.id]);
}
