import { useDocumentStore } from '@store/documentStore';
import { useEditorStore } from '@store/editorStore';
import { documentPdfDataUrl, exportDiagnosticPdf } from './exportPdf';

/**
 * Expõe as rotinas de exportação para inspeção automatizada durante o
 * desenvolvimento. Não é carregado no build de produção (main.tsx).
 */
export function installDevBridge(): void {
  Object.assign(window, {
    __percurso: {
      documentPdf: () => documentPdfDataUrl(useDocumentStore.getState().doc),
      diagnosticPdf: () => exportDiagnosticPdf(),
      store: useDocumentStore,
      editor: useEditorStore,
    },
  });
}
