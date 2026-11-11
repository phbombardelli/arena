import { exportDocumentPdf } from '@platform/exportPdf';
import { printDocument } from '@platform/print';
import { useDocumentStore } from '@store/documentStore';
import { useEditorStore } from '@store/editorStore';

/** Exporta o croqui aberto em PDF, com o nome do arquivo. */
export async function exportCurrentPdf(): Promise<void> {
  const { doc, fileName } = useDocumentStore.getState();
  try {
    await exportDocumentPdf(doc, (fileName ?? 'croqui').replace(/\.[^.]+$/, ''));
  } catch (err) {
    console.error(err);
    window.alert('Não foi possível gerar o PDF. Detalhes no console.');
  }
}

export function printCurrent(): void {
  printDocument(useDocumentStore.getState().doc);
}

/**
 * PDF ou impressão. Com desempate, o desenhador escolhe o que vai para a
 * folha (B-92): pelo menu a janela sempre abre, para dar para trocar; pelo
 * atalho ela só abre na primeira vez, e depois vale a escolha guardada.
 */
export function pedeSaida(saida: 'pdf' | 'imprimir', origem: 'menu' | 'atalho'): void {
  const { doc } = useDocumentStore.getState();
  const temDesempate = (doc.desempate?.ordem.length ?? 0) > 0;
  const pergunta = temDesempate && (origem === 'menu' || doc.desempate?.folha == null);
  if (pergunta) {
    useEditorStore.getState().pedeSaida(saida);
    return;
  }
  if (saida === 'pdf') void exportCurrentPdf();
  else printCurrent();
}
