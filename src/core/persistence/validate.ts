import { defaultLayers } from '@core/model/document';
import type { CourseDocument, ObjectKind, SceneObject } from '@core/model/types';
import { LAYER_ORDER } from '@core/model/types';
import { PAGE_FORMATS } from '@core/scale/units';
import { CourseFileError } from './format';
import { t } from '@core/i18n/i18n';
import type { MessageKey } from '@core/i18n/messages';

/**
 * Validação da leitura. A postura é deliberada:
 *
 * - o que compromete o desenho (página, escala, geometria de um objeto)
 *   é ERRO e interrompe a abertura, em vez de abrir um croqui em silêncio
 *   com medidas erradas;
 * - o que é acessório (uma camada faltando, um objeto de tipo
 *   desconhecido gravado por versão mais nova) vira AVISO, e o resto do
 *   arquivo abre.
 *
 * Nunca "consertar" silenciosamente uma coordenada: num croqui em escala,
 * um número errado sem aviso é pior do que não abrir.
 */

export interface ValidationResult {
  document: CourseDocument;
  warnings: string[];
}

const KNOWN_KINDS: readonly ObjectKind[] = [
  'arena',
  'obstacle',
  'path',
  'text',
  'measure',
  'infobox',
  'heighttable',
  'image',
  'ornament',
  'timing',
  'logo',
] as const;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const isFiniteNumber = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);

const isPoint = (v: unknown): boolean =>
  isRecord(v) && isFiniteNumber(v.x) && isFiniteNumber(v.y);

export function validateDocument(raw: unknown): ValidationResult {
  const warnings: string[] = [];

  if (!isRecord(raw)) {
    throw new CourseFileError(t('val.documento'));
  }

  /* ------------------------------------------------------------ página */

  const page = raw.page;
  if (!isRecord(page)) {
    throw new CourseFileError(t('val.pagina'));
  }
  if (!isFiniteNumber(page.printScale) || page.printScale <= 0) {
    throw new CourseFileError(
      t('val.escala'),
      t('val.valorLido', { valor: String(page.printScale) }),
    );
  }
  if (page.format !== 'custom' && !(page.format as string in PAGE_FORMATS)) {
    throw new CourseFileError(
      t('val.formato'),
      t('val.valorLido', { valor: String(page.format) }),
    );
  }
  if (page.orientation !== 'portrait' && page.orientation !== 'landscape') {
    throw new CourseFileError(t('val.orientacao'));
  }
  if (!isRecord(page.marginsMm)) {
    throw new CourseFileError(t('val.margens'));
  }

  if (!isPoint(raw.originMm)) {
    throw new CourseFileError(t('val.posicaoDesenho'));
  }

  /* ------------------------------------------------------------ objetos */

  if (!Array.isArray(raw.objects)) {
    throw new CourseFileError(t('val.semObjetos'));
  }

  const objects: SceneObject[] = [];
  const seenIds = new Set<string>();

  raw.objects.forEach((obj, index) => {
    if (!isRecord(obj) || typeof obj.kind !== 'string') {
      warnings.push(t('val.semTipo', { n: String(index + 1) }));
      return;
    }
    if (!KNOWN_KINDS.includes(obj.kind as ObjectKind)) {
      warnings.push(
        t('val.tipoDesconhecido', { n: String(index + 1), tipo: String(obj.kind) }),
      );
      return;
    }
    if (typeof obj.id !== 'string' || obj.id === '') {
      throw new CourseFileError(t('val.semId', { n: String(index + 1), tipo: String(obj.kind) }));
    }
    if (seenIds.has(obj.id)) {
      throw new CourseFileError(t('val.idRepetido', { id: String(obj.id) }));
    }
    seenIds.add(obj.id);

    checkGeometry(obj, index);

    if (typeof obj.layer !== 'string' || !LAYER_ORDER.includes(obj.layer as never)) {
      warnings.push(
        t('val.camada', { id: String(obj.id), camada: String(obj.layer) }),
      );
      obj.layer = defaultLayerFor(obj.kind as ObjectKind);
    }
    if (!isFiniteNumber(obj.z)) obj.z = index;
    if (typeof obj.locked !== 'boolean') obj.locked = false;
    if (typeof obj.visible !== 'boolean') obj.visible = true;

    objects.push(obj as unknown as SceneObject);
  });

  /* ------------------------------------------------------------ resto */

  if (!isRecord(raw.grid)) {
    throw new CourseFileError(t('val.grid'));
  }

  let layers = raw.layers as CourseDocument['layers'] | undefined;
  if (!Array.isArray(layers) || layers.length === 0) {
    warnings.push(t('val.camadasAusentes'));
    layers = defaultLayers();
  }

  const document = {
    ...raw,
    layers,
    objects,
    assets: isRecord(raw.assets) ? raw.assets : {},
    meta: isRecord(raw.meta) ? raw.meta : {},
  } as unknown as CourseDocument;

  return { document, warnings };
}

/** Geometria é a parte que não pode passar errada em silêncio. */
function checkGeometry(obj: Record<string, unknown>, index: number): void {
  const fail = (what: MessageKey): never => {
    throw new CourseFileError(t('val.geometria', { n: String(index + 1), tipo: String(obj.kind), campo: t(what) }));
  };

  switch (obj.kind) {
    case 'arena':
      if (!isPoint(obj.origin)) fail('val.c.origem');
      if (!isFiniteNumber(obj.widthM) || !isFiniteNumber(obj.heightM)) fail('val.c.dimensoes');
      if (!Array.isArray(obj.points) || !obj.points.every(isPoint)) fail('val.c.vertices');
      break;
    case 'obstacle':
      if (!isPoint(obj.pos)) fail('val.c.posicao');
      if (!isFiniteNumber(obj.rotation)) fail('val.c.rotacao');
      if (!isFiniteNumber(obj.faceWidthM)) fail('val.c.largura');
      if (!Array.isArray(obj.elements)) fail('val.c.elementos');
      break;
    case 'ornament':
    case 'text':
      if (!isPoint(obj.pos)) fail('val.c.posicao');
      if (!isFiniteNumber(obj.rotation)) fail('val.c.rotacao');
      break;
    case 'timing':
      if (!isPoint(obj.pos)) fail('val.c.posicao');
      if (!isFiniteNumber(obj.rotation)) fail('val.c.rotacao');
      if (!isFiniteNumber(obj.widthM) || obj.widthM <= 0) fail('val.c.largura');
      break;
    case 'image':
      if (!isPoint(obj.origin)) fail('val.c.origem');
      if (!isFiniteNumber(obj.metersPerPixel) || obj.metersPerPixel <= 0) fail('val.c.escala');
      if (!isFiniteNumber(obj.widthPx) || !isFiniteNumber(obj.heightPx)) fail('val.c.dimensoes');
      if (typeof obj.assetId !== 'string') fail('val.c.referencia');
      break;
    case 'path':
      if (!Array.isArray(obj.nodes) || obj.nodes.length === 0) fail('val.c.nos');
      if (!(obj.nodes as unknown[]).every((n) => isRecord(n) && isPoint(n.pos))) {
        fail('val.c.posicaoNo');
      }
      break;
    case 'measure':
      if (!isPoint(obj.a) || !isPoint(obj.b)) fail('val.c.pontas');
      break;
    case 'infobox':
    case 'heighttable':
      if (!isPoint(obj.posMm)) fail('val.c.papel');
      break;
    case 'logo':
      if (!isPoint(obj.posMm)) fail('val.c.papel');
      if (!isFiniteNumber(obj.widthMm) || obj.widthMm <= 0) fail('val.c.largura');
      if (typeof obj.assetId !== 'string') fail('val.c.referencia');
      break;
  }
}

function defaultLayerFor(kind: ObjectKind): string {
  switch (kind) {
    case 'arena':
      return 'arena';
    case 'obstacle':
      return 'obstacles';
    case 'path':
      return 'paths';
    case 'ornament':
      return 'ornaments';
    case 'timing':
      return 'obstacles';
    case 'image':
      return 'background';
    default:
      return 'annotations';
  }
}
