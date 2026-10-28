import { addImage } from '@core/commands/imageOps';
import { arenaExtent } from '@core/model/arena';
import { firstArena } from '@core/model/document';
import type { ImportedImage } from '@core/commands/imageOps';
import { ImageImportError, pickImage, readImage } from '@platform/imageImport';
import { useDocumentStore } from '@store/documentStore';
import { useEditorStore } from '@store/editorStore';
import { t } from '@core/i18n/i18n';

/**
 * Importa a imagem de referência e já a posiciona cobrindo a pista, com
 * largura igual à dela: é o enquadramento que quase sempre se quer, e
 * poupa o usuário de caçar a imagem pelo canvas antes de calibrar.
 */
export async function importBackgroundImage(): Promise<void> {
  try {
    const imported = await pickImage();
    if (imported) insertBackgroundImage(imported);
  } catch (err) {
    avisarFalha(err);
  }
}

/**
 * Imagem colada (decisão 57): abre o assistente "Montar pista pelo mapa"
 * (decisão 64), que também oferece usá-la só como imagem de fundo.
 */
export async function pasteBackgroundImage(file: File): Promise<void> {
  try {
    const nome = file.name && file.name !== 'image.png' ? file.name : 'imagem colada';
    const imported = await readImage(new File([file], nome, { type: file.type }));
    useEditorStore.getState().setMapWizard(imported);
  } catch (err) {
    avisarFalha(err);
  }
}

/** Escolhe um print no disco e abre o assistente "Montar pista pelo mapa". */
export async function startMapWizard(): Promise<void> {
  try {
    const imported = await pickImage();
    if (imported) useEditorStore.getState().setMapWizard(imported);
  } catch (err) {
    avisarFalha(err);
  }
}

/** Usa o print só como imagem de fundo, no modo Pista (o caminho antigo). */
export function placeAsBackground(imported: ImportedImage): void {
  const ed = useEditorStore.getState();
  if (ed.mode !== 'pista') ed.setMode('pista');
  insertBackgroundImage(imported);
}

/** Primeira imagem entre os itens colados, se houver. */
export function imageFromClipboard(data: DataTransfer | null): File | null {
  if (!data) return null;
  for (const item of Array.from(data.items)) {
    if (item.kind === 'file' && item.type.startsWith('image/')) return item.getAsFile();
  }
  return null;
}

/**
 * O menu Colar não recebe o evento 'paste': lê a área de transferência pela
 * API. Devolve true se havia uma imagem e ela foi colada. Sem permissão ou
 * sem a API (Firefox antigo), segue como se não houvesse imagem.
 */
export async function pasteImageFromSystemClipboard(): Promise<boolean> {
  try {
    if (!navigator.clipboard?.read) return false;
    for (const item of await navigator.clipboard.read()) {
      const tipo = item.types.find((t) => t.startsWith('image/'));
      if (!tipo) continue;
      const blob = await item.getType(tipo);
      await pasteBackgroundImage(new File([blob], 'imagem colada', { type: tipo }));
      return true;
    }
  } catch {
    // Permissão negada ou área de transferência vazia: cai no colar interno.
  }
  return false;
}

function insertBackgroundImage(imported: ImportedImage): void {
  const { doc, apply } = useDocumentStore.getState();
  const arena = firstArena(doc);
  const extent = arena ? arenaExtent(arena) : null;
  const larguraInicial = extent && extent.widthM > 0 ? extent.widthM : 100;
  const origem = extent ? extent.origin : { x: 0, y: 0 };

  let novoId = '';
  apply('Inserir imagem de fundo', (d) => {
    novoId = addImage(d, imported, origem, larguraInicial).id;
  });
  useEditorStore.getState().setSelection([novoId]);
}

function avisarFalha(err: unknown): void {
  if (err instanceof ImageImportError) {
    window.alert(err.message);
    return;
  }
  console.error(err);
  window.alert(t('aviso.naoImportou'));
}
