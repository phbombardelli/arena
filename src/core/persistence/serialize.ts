import type { CourseDocument } from '@core/model/types';
import { SCHEMA_VERSION } from '@core/model/types';
import { CourseFileError, FILE_FORMAT, type CourseFile } from './format';
import { applyMigrations, type RawDocument } from './migrations';
import { validateDocument, type ValidationResult } from './validate';
import { t } from '@core/i18n/i18n';

export const APP_VERSION = '0.1.0';

/**
 * Serialização do projeto. Indentado com 2 espaços de propósito: o arquivo
 * é diffável e legível, o que já salvou muito trabalho de recuperação em
 * formatos comprimidos.
 */
export function serialize(doc: CourseDocument): string {
  const file: CourseFile = {
    format: FILE_FORMAT,
    schemaVersion: SCHEMA_VERSION,
    savedAt: new Date().toISOString(),
    appVersion: APP_VERSION,
    document: { ...doc, schemaVersion: SCHEMA_VERSION },
  };
  return JSON.stringify(file, null, 2);
}

/**
 * Leitura: analisa, confere o envelope, migra e valida — nessa ordem.
 * Migrar antes de validar é o que permite abrir um arquivo antigo cujo
 * formato já não passaria na validação atual.
 */
export function deserialize(text: string): ValidationResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new CourseFileError(
      t('aviso.naoEProjeto'),
      err instanceof Error ? err.message : undefined,
    );
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new CourseFileError(t('aviso.naoEProjeto'));
  }

  const envelope = parsed as Partial<CourseFile>;
  if (envelope.format !== FILE_FORMAT) {
    throw new CourseFileError(
      t('aviso.naoEProjeto'),
      t('aviso.formatoLido', { formato: String(envelope.format ?? '?') }),
    );
  }
  if (typeof envelope.schemaVersion !== 'number' || !Number.isInteger(envelope.schemaVersion)) {
    throw new CourseFileError(t('aviso.semVersao'));
  }
  if (typeof envelope.document !== 'object' || envelope.document === null) {
    throw new CourseFileError(t('aviso.semDocumento'));
  }

  const migrated = applyMigrations(
    envelope.document as unknown as RawDocument,
    envelope.schemaVersion,
    SCHEMA_VERSION,
  );

  const result = validateDocument(migrated);
  result.document.schemaVersion = SCHEMA_VERSION;
  return result;
}

/** Nome de arquivo sugerido a partir do título do croqui. */
export function suggestedFileName(doc: CourseDocument): string {
  const base = (doc.meta.title || doc.meta.competition || 'croqui')
    // Ordinais viram letra: "1ª Etapa" precisa sair "1a-etapa", não "1-etapa".
    .replace(/ª/g, 'a')
    .replace(/º/g, 'o')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // remove acentos combinantes
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase();
  return base === '' ? 'croqui' : base;
}
