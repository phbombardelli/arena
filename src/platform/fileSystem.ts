import { FILE_EXTENSION, FILE_MIME } from '@core/persistence/format';
import { t } from '@core/i18n/i18n';

/**
 * Acesso a arquivos. Usa a File System Access API quando existe (Chrome,
 * Edge): é o que permite "Salvar" gravar por cima do mesmo arquivo, sem
 * despejar uma cópia nova na pasta de downloads a cada vez.
 *
 * Onde a API não existe (Firefox, Safari), cai para download + input de
 * arquivo. O usuário perde o "salvar por cima", não o trabalho — e é por
 * isso que o estado "não salvo" precisa ficar visível na barra superior.
 */

export interface FileHandleLike {
  readonly name: string;
  createWritable(): Promise<{
    write(data: string | Blob): Promise<void>;
    close(): Promise<void>;
  }>;
  getFile(): Promise<File>;
}

interface PickerWindow {
  showSaveFilePicker?: (options: unknown) => Promise<FileHandleLike>;
  showOpenFilePicker?: (options: unknown) => Promise<FileHandleLike[]>;
}

const picker = (): PickerWindow => window as unknown as PickerWindow;

export const hasFileSystemAccess = (): boolean =>
  typeof picker().showSaveFilePicker === 'function';

const pickerOptions = (suggestedName?: string) => ({
  ...(suggestedName ? { suggestedName: `${suggestedName}${FILE_EXTENSION}` } : {}),
  types: [
    {
      description: t('aviso.assuntoArquivo'),
      accept: { [FILE_MIME]: [FILE_EXTENSION] },
    },
  ],
});

/** Cancelamento pelo usuário não é erro: vira `null`. */
const isAbort = (err: unknown): boolean =>
  err instanceof DOMException && err.name === 'AbortError';

export interface OpenedFile {
  text: string;
  name: string;
  handle: FileHandleLike | null;
}

export async function openFile(): Promise<OpenedFile | null> {
  const show = picker().showOpenFilePicker;
  if (show) {
    try {
      const [handle] = await show({ ...pickerOptions(), multiple: false });
      if (!handle) return null;
      const file = await handle.getFile();
      return { text: await file.text(), name: file.name, handle };
    } catch (err) {
      if (isAbort(err)) return null;
      throw err;
    }
  }
  return openFileFallback();
}

function openFileFallback(): Promise<OpenedFile | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = `${FILE_EXTENSION},${FILE_MIME}`;
    input.style.display = 'none';
    document.body.appendChild(input);

    // `cancel` não é suportado em todo lugar; o input é removido de todo
    // modo quando a página perde e recupera o foco.
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) {
        resolve(null);
        return;
      }
      file
        .text()
        .then((text) => resolve({ text, name: file.name, handle: null }))
        .catch(reject);
    });
    input.addEventListener('cancel', () => {
      input.remove();
      resolve(null);
    });
    input.click();
  });
}

export interface SavedFile {
  name: string;
  handle: FileHandleLike | null;
}

/** "Salvar como": sempre pergunta onde gravar. */
export async function saveFileAs(
  text: string,
  suggestedName: string,
): Promise<SavedFile | null> {
  const show = picker().showSaveFilePicker;
  if (show) {
    try {
      const handle = await show(pickerOptions(suggestedName));
      await writeTo(handle, text);
      return { name: handle.name, handle };
    } catch (err) {
      if (isAbort(err)) return null;
      throw err;
    }
  }
  const name = `${suggestedName}${FILE_EXTENSION}`;
  downloadText(text, name);
  return { name, handle: null };
}

/** "Salvar": grava por cima quando há um arquivo aberto. */
export async function saveFile(
  text: string,
  handle: FileHandleLike | null,
  suggestedName: string,
): Promise<SavedFile | null> {
  if (!handle) return saveFileAs(text, suggestedName);
  await writeTo(handle, text);
  return { name: handle.name, handle };
}

async function writeTo(handle: FileHandleLike, text: string): Promise<void> {
  const writable = await handle.createWritable();
  try {
    await writable.write(new Blob([text], { type: FILE_MIME }));
  } finally {
    await writable.close();
  }
}

export function downloadText(text: string, fileName: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: FILE_MIME }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revogar imediatamente cancela o download em alguns navegadores.
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
