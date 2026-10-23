import { defaultLayers } from '@core/model/document';
import type { CourseDocument, ObjectKind, SceneObject } from '@core/model/types';
import { LAYER_ORDER } from '@core/model/types';
import { PAGE_FORMATS } from '@core/scale/units';
import { CourseFileError } from './format';

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
    throw new CourseFileError('O arquivo não contém um documento válido.');
  }

  /* ------------------------------------------------------------ página */

  const page = raw.page;
  if (!isRecord(page)) {
    throw new CourseFileError('O arquivo não tem a configuração de página.');
  }
  if (!isFiniteNumber(page.printScale) || page.printScale <= 0) {
    throw new CourseFileError(
      'A escala de impressão do arquivo é inválida.',
      `Valor lido: ${String(page.printScale)}.`,
    );
  }
  if (page.format !== 'custom' && !(page.format as string in PAGE_FORMATS)) {
    throw new CourseFileError(
      'O formato de página do arquivo não é reconhecido.',
      `Valor lido: ${String(page.format)}.`,
    );
  }
  if (page.orientation !== 'portrait' && page.orientation !== 'landscape') {
    throw new CourseFileError('A orientação da página do arquivo é inválida.');
  }
  if (!isRecord(page.marginsMm)) {
    throw new CourseFileError('As margens da página do arquivo são inválidas.');
  }

  if (!isPoint(raw.originMm)) {
    throw new CourseFileError('A posição do desenho na página é inválida.');
  }

  /* ------------------------------------------------------------ objetos */

  if (!Array.isArray(raw.objects)) {
    throw new CourseFileError('O arquivo não tem a lista de objetos.');
  }

  const objects: SceneObject[] = [];
  const seenIds = new Set<string>();

  raw.objects.forEach((obj, index) => {
    if (!isRecord(obj) || typeof obj.kind !== 'string') {
      warnings.push(`Objeto ${index + 1} ignorado: registro sem tipo.`);
      return;
    }
    if (!KNOWN_KINDS.includes(obj.kind as ObjectKind)) {
      warnings.push(
        `Objeto ${index + 1} ignorado: tipo "${obj.kind}" desconhecido nesta versão.`,
      );
      return;
    }
    if (typeof obj.id !== 'string' || obj.id === '') {
      throw new CourseFileError(`O objeto ${index + 1} (${obj.kind}) está sem identificador.`);
    }
    if (seenIds.has(obj.id)) {
      throw new CourseFileError(`Há dois objetos com o mesmo identificador: ${obj.id}.`);
    }
    seenIds.add(obj.id);

    checkGeometry(obj, index);

    if (typeof obj.layer !== 'string' || !LAYER_ORDER.includes(obj.layer as never)) {
      warnings.push(
        `Objeto ${obj.id}: camada "${String(obj.layer)}" desconhecida, movido para a camada padrão.`,
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
    throw new CourseFileError('O arquivo não tem as configurações de grid.');
  }

  let layers = raw.layers as CourseDocument['layers'] | undefined;
  if (!Array.isArray(layers) || layers.length === 0) {
    warnings.push('Camadas ausentes no arquivo: restauradas as padrão.');
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
  const fail = (what: string): never => {
    throw new CourseFileError(
      `O objeto ${index + 1} (${String(obj.kind)}) tem ${what} inválida.`,
    );
  };

  switch (obj.kind) {
    case 'arena':
      if (!isPoint(obj.origin)) fail('a origem');
      if (!isFiniteNumber(obj.widthM) || !isFiniteNumber(obj.heightM)) fail('as dimensões');
      if (!Array.isArray(obj.points) || !obj.points.every(isPoint)) fail('a lista de vértices');
      break;
    case 'obstacle':
      if (!isPoint(obj.pos)) fail('a posição');
      if (!isFiniteNumber(obj.rotation)) fail('a rotação');
      if (!isFiniteNumber(obj.faceWidthM)) fail('a largura');
      if (!Array.isArray(obj.elements)) fail('a lista de elementos');
      break;
    case 'ornament':
    case 'text':
      if (!isPoint(obj.pos)) fail('a posição');
      if (!isFiniteNumber(obj.rotation)) fail('a rotação');
      break;
    case 'timing':
      if (!isPoint(obj.pos)) fail('a posição');
      if (!isFiniteNumber(obj.rotation)) fail('a rotação');
      if (!isFiniteNumber(obj.widthM) || obj.widthM <= 0) fail('a largura');
      break;
    case 'image':
      if (!isPoint(obj.origin)) fail('a origem');
      if (!isFiniteNumber(obj.metersPerPixel) || obj.metersPerPixel <= 0) fail('a escala');
      if (!isFiniteNumber(obj.widthPx) || !isFiniteNumber(obj.heightPx)) fail('as dimensões');
      if (typeof obj.assetId !== 'string') fail('a referência ao arquivo');
      break;
    case 'path':
      if (!Array.isArray(obj.nodes) || obj.nodes.length === 0) fail('a lista de nós');
      if (!(obj.nodes as unknown[]).every((n) => isRecord(n) && isPoint(n.pos))) {
        fail('a posição de um nó');
      }
      break;
    case 'measure':
      if (!isPoint(obj.a) || !isPoint(obj.b)) fail('a posição das pontas');
      break;
    case 'infobox':
    case 'heighttable':
      if (!isPoint(obj.posMm)) fail('a posição no papel');
      break;
    case 'logo':
      if (!isPoint(obj.posMm)) fail('a posição no papel');
      if (!isFiniteNumber(obj.widthMm) || obj.widthMm <= 0) fail('a largura');
      if (typeof obj.assetId !== 'string') fail('a referência ao arquivo');
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
