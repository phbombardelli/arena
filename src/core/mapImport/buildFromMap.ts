import type { Vec2 } from '@core/geometry/vec';
import { addObject } from '@core/commands/ops';
import { addImage, type ImportedImage } from '@core/commands/imageOps';
import { arenaScopeObjects } from '@core/library/arenaTemplate';
import { createOrnament } from '@core/library/ornaments';
import { createPolygonStructure } from '@core/library/structures';
import { createPolygonArena } from '@core/model/arena';
import { centerOnPage, fitScaleToPage } from '@core/model/document';
import { newId } from '@core/model/ids';
import type { CourseDocument, ObjectId, StructureType } from '@core/model/types';

/** O que o assistente "Montar pista pelo mapa" entrega, em pixels do print. */
export interface MapResult {
  image: ImportedImage;
  /** Marcadores da medida e a distância confirmada entre eles. */
  measure: { a: Vec2; b: Vec2; meters: number };
  arena: Vec2[];
  structures: { type: StructureType; outline: Vec2[] }[];
  trees: Vec2[];
}

/**
 * Monta o cenário a partir do print (decisão 64).
 *
 * A escala vem da medida: metros por pixel = distância ÷ pixels entre os
 * marcadores. O canto superior esquerdo da pista vira a origem do
 * modelo — de onde a grade e as réguas contam (decisão 60). O cenário
 * anterior sai, como ao aplicar um modelo; o percurso fica.
 *
 * Tudo entra VINCULADO (decisão 61): imagem, pista, construções e
 * árvores se arrastam juntos até alguém desvincular. A pista nasce sem
 * preenchimento, para o print aparecer por baixo, semitransparente. Ao
 * fim a escala da folha se ajusta e o desenho é centralizado.
 */
export function buildFromMap(doc: CourseDocument, r: MapResult): ObjectId[] {
  const px = Math.hypot(r.measure.b.x - r.measure.a.x, r.measure.b.y - r.measure.a.y);
  if (px <= 0 || !(r.measure.meters > 0) || r.arena.length < 3) return [];
  const mpp = r.measure.meters / px;
  const minX = Math.min(...r.arena.map((p) => p.x));
  const minY = Math.min(...r.arena.map((p) => p.y));
  const emMetros = (p: Vec2): Vec2 => ({
    x: Math.round((p.x - minX) * mpp * 1000) / 1000,
    y: Math.round((p.y - minY) * mpp * 1000) / 1000,
  });

  // Sai o cenário antigo, com as imagens que só ele usava.
  const antigos = arenaScopeObjects(doc);
  for (const o of antigos) if (o.kind === 'image') delete doc.assets[o.assetId];
  const idsAntigos = new Set(antigos.map((o) => o.id));
  doc.objects = doc.objects.filter((o) => !idsAntigos.has(o.id));
  // Cenário novo, tirado do mapa: não vem de nenhuma pista guardada (B-77).
  delete doc.arenaSource;

  const grupo = newId('grp');
  const ids: ObjectId[] = [];

  const imagem = addImage(doc, r.image, emMetros({ x: 0, y: 0 }), r.image.widthPx * mpp);
  imagem.metersPerPixel = mpp;
  imagem.opacity = 0.5;
  imagem.calibration = {
    pointA: emMetros(r.measure.a),
    pointB: emMetros(r.measure.b),
    knownDistanceM: r.measure.meters,
  };
  imagem.group = grupo;
  ids.push(imagem.id);

  const pista = createPolygonArena(r.arena.map(emMetros));
  pista.style = { ...pista.style, fill: 'none' };
  pista.group = grupo;
  addObject(doc, pista);
  ids.push(pista.id);

  for (const s of r.structures) {
    if (s.outline.length < 3) continue;
    const obra = createPolygonStructure(s.outline.map(emMetros), s.type);
    obra.group = grupo;
    addObject(doc, obra);
    ids.push(obra.id);
  }
  for (const t of r.trees) {
    const arvore = createOrnament('arvore', emMetros(t));
    arvore.group = grupo;
    addObject(doc, arvore);
    ids.push(arvore.id);
  }

  doc.page.printScale = fitScaleToPage(doc);
  centerOnPage(doc);
  return ids;
}
