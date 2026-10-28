import type { ImportedImage } from '@core/commands/imageOps';
import { formatDecimal, t } from '@core/i18n/i18n';

/**
 * Importação de imagem de referência. O arquivo é embutido no projeto como
 * data URL: o requisito é funcionar offline e o `.pcs` precisa ser
 * autossuficiente — um croqui que depende de um arquivo solto na pasta do
 * usuário deixa de abrir no primeiro backup mal feito.
 */

export const ACCEPTED_IMAGE_TYPES = 'image/png,image/jpeg,image/webp';

/** Acima disso o projeto fica pesado demais para abrir com conforto. */
export const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

export class ImageImportError extends Error {}

export async function pickImage(): Promise<ImportedImage | null> {
  const file = await chooseFile();
  if (!file) return null;
  return readImage(file);
}

function chooseFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = ACCEPTED_IMAGE_TYPES;
    input.style.display = 'none';
    document.body.appendChild(input);
    input.addEventListener('change', () => {
      const file = input.files?.[0] ?? null;
      input.remove();
      resolve(file);
    });
    input.addEventListener('cancel', () => {
      input.remove();
      resolve(null);
    });
    input.click();
  });
}

export async function readImage(file: File): Promise<ImportedImage> {
  if (!ACCEPTED_IMAGE_TYPES.split(',').includes(file.type)) {
    throw new ImageImportError(
      t('aviso.formatoImagem', { tipo: file.type || '?' }),
    );
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new ImageImportError(
      t('aviso.imagemGrande', { mb: formatDecimal(file.size / 1024 / 1024, 1), limite: MAX_IMAGE_BYTES / 1024 / 1024 }),
    );
  }

  const dataUrl = await fileToDataUrl(file);
  const { width, height } = await measureImage(dataUrl);

  return {
    widthPx: width,
    heightPx: height,
    asset: { mime: file.type, dataUrl, width, height, name: file.name },
  };
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new ImageImportError(t('aviso.lerArquivo')));
    reader.readAsDataURL(file);
  });
}

function measureImage(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new ImageImportError(t('aviso.imagemInvalida')));
    img.src = dataUrl;
  });
}
