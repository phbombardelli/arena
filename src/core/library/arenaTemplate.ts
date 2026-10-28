import { deepClone } from '@core/model/clone';
import { newId } from '@core/model/ids';
import { objectScope } from '@core/model/transform';
import type { Asset, CourseDocument, SceneObject } from '@core/model/types';
import { t } from '@core/i18n/i18n';

/**
 * Modelo de pista: o cenário de um local, guardado para reuso.
 *
 * Leva só o que é do escopo `pista` — contorno, imagem de referência,
 * árvores e demais fixos — com os arquivos embutidos de que precisa. O
 * percurso não entra: cada prova desenha o seu.
 */

export const TEMPLATE_FORMAT = 'percurso-pista';
export const TEMPLATE_EXTENSION = '.pista';

export interface ArenaTemplate {
  format: typeof TEMPLATE_FORMAT;
  schemaVersion: number;
  id: string;
  name: string;
  savedAt: string;
  objects: SceneObject[];
  assets: Record<string, Asset>;
  /** Só informativo, para listar o repositório sem abrir o modelo. */
  summary: { widthM: number; heightM: number; objectCount: number };
}

/** Objetos que compõem o cenário do documento atual. */
export const arenaScopeObjects = (doc: CourseDocument): SceneObject[] =>
  doc.objects.filter((o) => objectScope(o) === 'pista');

export function buildTemplate(
  doc: CourseDocument,
  name: string,
  schemaVersion: number,
): ArenaTemplate {
  const objects = arenaScopeObjects(doc).map((o) => deepClone(o));

  // Só os arquivos que este cenário usa: guardar o resto engordaria o
  // modelo com imagens de outros locais.
  const usados = new Set(
    objects.filter((o) => o.kind === 'image').map((o) => o.assetId),
  );
  const assets: Record<string, Asset> = {};
  for (const [key, asset] of Object.entries(doc.assets)) {
    if (usados.has(key)) assets[key] = deepClone(asset);
  }

  const arena = objects.find((o) => o.kind === 'arena' && !o.structure);
  return {
    format: TEMPLATE_FORMAT,
    schemaVersion,
    id: newId('tpl'),
    name: name.trim() || t('arq.pistaSemNome'),
    savedAt: new Date().toISOString(),
    objects,
    assets,
    summary: {
      widthM: arena?.kind === 'arena' ? arena.widthM : 0,
      heightM: arena?.kind === 'arena' ? arena.heightM : 0,
      objectCount: objects.length,
    },
  };
}

/**
 * Aplica o modelo ao documento, substituindo o cenário e preservando o
 * percurso. Ids são renovados: o mesmo modelo pode ser aplicado duas vezes
 * sem colidir com o que já existe.
 */
export function applyTemplate(doc: CourseDocument, template: ArenaTemplate): void {
  // A pista entra copiada e congelada; guarda-se só de onde veio (B-77).
  doc.arenaSource = { name: template.name, savedAt: template.savedAt };
  const antigos = arenaScopeObjects(doc).map((o) => o.id);
  const assetsAntigos = new Set(
    doc.objects
      .filter((o) => o.kind === 'image' && antigos.includes(o.id))
      .map((o) => (o.kind === 'image' ? o.assetId : '')),
  );

  doc.objects = doc.objects.filter((o) => !antigos.includes(o.id));
  for (const key of assetsAntigos) delete doc.assets[key];

  const mapaAssets = new Map<string, string>();
  for (const [key, asset] of Object.entries(template.assets)) {
    const novo = newId('ass');
    mapaAssets.set(key, novo);
    doc.assets[novo] = deepClone(asset);
  }

  // O cenário de um modelo entra VINCULADO: pista, construções, árvores e
  // imagem se movem juntos até alguém desvincular (decisão 61).
  const grupo = template.objects.length > 1 ? newId('grp') : undefined;
  for (const original of template.objects) {
    const copia = deepClone(original);
    copia.id = newId(copia.kind.slice(0, 3));
    copia.scope = 'pista';
    if (grupo) copia.group = grupo;
    else delete copia.group;
    if (copia.kind === 'image') {
      copia.assetId = mapaAssets.get(copia.assetId) ?? copia.assetId;
    }
    doc.objects.push(copia);
  }
}

/** Confere o envelope antes de aceitar um arquivo como modelo de pista. */
export function isArenaTemplate(value: unknown): value is ArenaTemplate {
  if (typeof value !== 'object' || value === null) return false;
  const t = value as Partial<ArenaTemplate>;
  return (
    t.format === TEMPLATE_FORMAT &&
    typeof t.name === 'string' &&
    Array.isArray(t.objects) &&
    typeof t.assets === 'object' &&
    t.assets !== null
  );
}
