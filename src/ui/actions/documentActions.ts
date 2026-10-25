import { applyTemplate, buildTemplate, type ArenaTemplate } from '@core/library/arenaTemplate';
import { deepClone } from '@core/model/clone';
import { objectScope } from '@core/model/transform';
import { SCHEMA_VERSION } from '@core/model/types';
import { centerOnPage, createDocument, fitScaleToPage } from '@core/model/document';
import { CourseFileError } from '@core/persistence/format';
import { deserialize, serialize, suggestedFileName } from '@core/persistence/serialize';
import { openFile, saveFile, saveFileAs } from '@platform/fileSystem';
import { getCourse, saveCourse as gravaNaBiblioteca } from '@platform/courseLibrary';
import { useDocumentStore } from '@store/documentStore';
import { useEditorStore } from '@store/editorStore';

/**
 * Ações de arquivo. Ficam fora dos componentes porque a barra superior, os
 * atalhos de teclado e o guarda de saída precisam exatamente das mesmas
 * regras — em especial a de nunca descartar trabalho sem perguntar.
 */

export type ActionResult = 'ok' | 'cancelado' | 'erro';

/** Confirmação antes de descartar alterações não salvas. */
function confirmDiscard(): boolean {
  const { dirty, fileName } = useDocumentStore.getState();
  if (!dirty) return true;
  const nome = fileName ?? 'Sem título';
  return window.confirm(
    `"${nome}" tem alterações não salvas.\n\nDescartar as alterações e continuar?`,
  );
}

function reportError(err: unknown, fallback: string): void {
  if (err instanceof CourseFileError) {
    window.alert(err.detail ? `${err.message}\n\n${err.detail}` : err.message);
    return;
  }
  console.error(err);
  window.alert(fallback);
}

export function newDocument(): ActionResult {
  if (!confirmDiscard()) return 'cancelado';
  useDocumentStore.getState().replace(createDocument());
  useEditorStore.getState().clearSelection();
  return 'ok';
}

/**
 * Novo percurso sobre uma pista (B-77): a pista entra copiada e congelada;
 * sem pista, é o croqui em branco de sempre. Abre já no modo Percurso.
 */
export function newCourse(pista: ArenaTemplate | null, kind: 'percurso' | 'ginastica' = 'percurso'): ActionResult {
  if (!confirmDiscard()) return 'cancelado';
  const doc = createDocument();
  if (kind === 'ginastica') doc.kind = 'ginastica';
  if (pista) {
    applyTemplate(doc, pista);
    doc.meta.venue = pista.name;
    doc.page.printScale = fitScaleToPage(doc);
    centerOnPage(doc);
  }
  useDocumentStore.getState().replace(doc);
  const ed = useEditorStore.getState();
  ed.clearSelection();
  ed.setMode('percurso');
  return 'ok';
}

export type DocKind = 'percurso' | 'ginastica';

const kindOf = (): DocKind => (useDocumentStore.getState().doc.kind === 'ginastica' ? 'ginastica' : 'percurso');

/**
 * Abas Pista | Percurso | Ginástica (B-86, opção b): percurso e ginástica
 * continuam arquivos separados. Clicar na aba do outro tipo, com o croqui
 * ainda sem nada da prova, só troca o tipo; com algo desenhado, abre a
 * escolha: nova na mesma pista, abrir uma guardada ou outra pista.
 */
export function switchKind(kind: DocKind): void {
  const ed = useEditorStore.getState();
  if (kindOf() === kind) {
    ed.setMode('percurso');
    return;
  }
  const { doc, apply } = useDocumentStore.getState();
  const temProva = doc.objects.some((o) => objectScope(o) === 'percurso');
  if (!temProva) {
    apply(kind === 'ginastica' ? 'Virar ginástica' : 'Virar percurso', (d) => {
      if (kind === 'ginastica') d.kind = 'ginastica';
      else delete d.kind;
    });
    ed.setMode('percurso');
    return;
  }
  ed.setDialog(kind === 'ginastica' ? 'outro-ginastica' : 'outro-percurso');
}

/**
 * Novo croqui do outro tipo sobre a MESMA pista do aberto: o cenário vai
 * copiado, com a mesma folha, escala e enquadramento.
 */
export function newKindOnSameArena(kind: DocKind): ActionResult {
  if (!confirmDiscard()) return 'cancelado';
  const atual = useDocumentStore.getState().doc;
  const pista = buildTemplate(atual, atual.arenaSource?.name || atual.meta.venue || 'Pista', SCHEMA_VERSION);
  const doc = createDocument();
  if (kind === 'ginastica') doc.kind = 'ginastica';
  applyTemplate(doc, pista);
  doc.page = deepClone(atual.page);
  doc.originMm = { ...atual.originMm };
  doc.meta.venue = atual.meta.venue;
  if (atual.arenaSource) doc.arenaSource = { ...atual.arenaSource };
  else delete doc.arenaSource;
  useDocumentStore.getState().replace(doc);
  const ed = useEditorStore.getState();
  ed.clearSelection();
  ed.setMode('percurso');
  return 'ok';
}

/** Nome para "Meus percursos": o que já tem, ou o título, ou o local. */
function nomeSugerido(): string {
  const { doc, fileName } = useDocumentStore.getState();
  return (
    fileName?.replace(/\.pcs$/i, '') ||
    doc.meta.title ||
    [doc.meta.venue, doc.meta.date].filter(Boolean).join(' ') ||
    'Percurso sem nome'
  );
}

/**
 * Salvar percurso (B-77): grava pista e percurso juntos em "Meus
 * percursos" e, se há um arquivo aberto que o navegador deixa regravar,
 * nele também. Na primeira vez pede o nome.
 */
export async function saveCourse(): Promise<ActionResult> {
  const { doc, fileHandle, libraryId, fileName } = useDocumentStore.getState();
  let nome = fileName?.replace(/\.pcs$/i, '') ?? null;
  if (!libraryId || !nome) {
    const pedido = window.prompt('Nome do percurso em "Meus percursos":', nomeSugerido());
    if (pedido === null) return 'cancelado';
    nome = pedido.trim() || nomeSugerido();
  }
  try {
    const entry = await gravaNaBiblioteca(doc, nome, libraryId);
    if (fileHandle) await saveFile(serialize(doc), fileHandle, suggestedFileName(doc));
    useDocumentStore.getState().markSaved({ name: fileHandle ? fileHandle.name : entry.name, handle: fileHandle, libraryId: entry.id });
    return 'ok';
  } catch (err) {
    reportError(err, 'Não foi possível salvar o percurso.');
    return 'erro';
  }
}

/** Abre um percurso de "Meus percursos": pista e percurso, casados. */
export async function openCourseFromLibrary(id: string): Promise<ActionResult> {
  if (!confirmDiscard()) return 'cancelado';
  try {
    const entry = await getCourse(id);
    if (!entry) return 'erro';
    const { document, warnings } = deserialize(entry.text);
    useDocumentStore.getState().replace(document, { name: entry.name, handle: null, libraryId: entry.id });
    const ed = useEditorStore.getState();
    ed.clearSelection();
    ed.setMode('percurso');
    if (warnings.length > 0) window.alert(`O percurso foi aberto, com ressalvas:\n\n- ${warnings.join('\n- ')}`);
    return 'ok';
  } catch (err) {
    reportError(err, 'Não foi possível abrir o percurso.');
    return 'erro';
  }
}

export async function openDocument(): Promise<ActionResult> {
  if (!confirmDiscard()) return 'cancelado';
  try {
    const opened = await openFile();
    if (!opened) return 'cancelado';

    const { document, warnings } = deserialize(opened.text);
    useDocumentStore.getState().replace(document, {
      name: opened.name,
      handle: opened.handle,
    });
    useEditorStore.getState().clearSelection();

    if (warnings.length > 0) {
      window.alert(
        `O arquivo foi aberto, com ressalvas:\n\n- ${warnings.join('\n- ')}`,
      );
    }
    return 'ok';
  } catch (err) {
    reportError(err, 'Não foi possível abrir o arquivo.');
    return 'erro';
  }
}

export async function saveDocument(): Promise<ActionResult> {
  const { doc, fileHandle } = useDocumentStore.getState();
  try {
    const saved = await saveFile(serialize(doc), fileHandle, suggestedFileName(doc));
    if (!saved) return 'cancelado';
    useDocumentStore.getState().markSaved(saved);
    return 'ok';
  } catch (err) {
    reportError(err, 'Não foi possível salvar o arquivo.');
    return 'erro';
  }
}

export async function saveDocumentAs(): Promise<ActionResult> {
  const { doc } = useDocumentStore.getState();
  try {
    const saved = await saveFileAs(serialize(doc), suggestedFileName(doc));
    if (!saved) return 'cancelado';
    // O arquivo novo também vai para "Meus percursos" (ou atualiza o registro).
    const entry = await gravaNaBiblioteca(doc, saved.name.replace(/\.pcs$/i, ''), useDocumentStore.getState().libraryId);
    useDocumentStore.getState().markSaved({ ...saved, libraryId: entry.id });
    return 'ok';
  } catch (err) {
    reportError(err, 'Não foi possível salvar o arquivo.');
    return 'erro';
  }
}

/**
 * Aviso do navegador ao fechar com alterações pendentes. É a única rede de
 * proteção que existe: o salvamento é manual por decisão do usuário, não
 * há salvamento automático nem rascunho local.
 */
export function installUnloadGuard(): () => void {
  const handler = (e: BeforeUnloadEvent) => {
    if (!useDocumentStore.getState().dirty) return;
    e.preventDefault();
    e.returnValue = '';
  };
  window.addEventListener('beforeunload', handler);
  return () => window.removeEventListener('beforeunload', handler);
}
