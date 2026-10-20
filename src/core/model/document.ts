import type { Vec2 } from '@core/geometry/vec';
import { fitScale, pageSize, usableArea } from '@core/scale/units';
import { heightTableLayout, infoBoxLayout } from './annotationLayout';
import { createRectangleArena } from './arena';
import type {
  Arena,
  CourseDocument,
  Layer,
  LayerId,
  ObjectId,
  Obstacle,
  SceneObject,
} from './types';
import { LAYER_ORDER, SCHEMA_VERSION } from './types';

const LAYER_LABELS: Record<LayerId, string> = {
  background: 'Imagem de fundo',
  arena: 'Pista',
  paths: 'Traçados',
  obstacles: 'Obstáculos',
  ornaments: 'Ornamentação',
  annotations: 'Textos e quadros',
};

export function defaultLayers(): Layer[] {
  return LAYER_ORDER.map((id) => ({
    id,
    label: LAYER_LABELS[id],
    visible: true,
    locked: false,
  }));
}

/** Escala de todo documento novo. */
export const DEFAULT_PRINT_SCALE = 600;

export const createArena = (widthM = 80, heightM = 40): Arena =>
  createRectangleArena({ x: 0, y: 0 }, widthM, heightM);

/**
 * Documento novo: folha A4 paisagem na escala 1:600, SEM pista — o
 * desenhador começa do zero, colando o print do local ou escolhendo um
 * modelo. A origem fica onde cairia uma pista 80×40 centralizada, para que
 * um contorno desenhado a partir de (0,0) já nasça no meio da folha.
 *
 * `arena: true` traz a pista retangular 80×40 — é o ponto de partida dos
 * testes e de quem quer um retângulo pronto.
 */
export function createDocument(opts: { arena?: boolean } = {}): CourseDocument {
  const page = {
    format: 'A4' as const,
    widthMm: 210,
    heightMm: 297,
    orientation: 'landscape' as const,
    marginsMm: { top: 10, right: 10, bottom: 10, left: 10 },
    printScale: DEFAULT_PRINT_SCALE,
    // A legenda de escala só entra quando pedida (menu Inserir › Escala).
    scaleLabel: { visible: false, corner: 'inferior-direito' as const, bar: true },
  };
  const arena = createArena();

  return {
    schemaVersion: SCHEMA_VERSION,
    meta: {
      title: '',
      competition: '',
      venue: '',
      date: '',
      designer: '',
      technicalDelegate: '',
    },
    page,
    originMm: centerOriginMm(arena, page, areaCheia(page)),
    grid: {
      visible: true,
      stepM: 0,
      subdivisions: 5,
      angleSnapDeg: 15,
    },
    layers: defaultLayers(),
    objects: opts.arena ? [arena] : [],
    assets: {},
    flags: false,
  };
}

/** Área útil inteira, para quando ainda não há anotação nenhuma. */
const areaCheia = (page: CourseDocument['page']): RectMm => usableArea(page);

export interface RectMm {
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
}

/**
 * Área da folha que sobra para o desenho, depois de descontadas as
 * anotações de papel — quadro técnico e tabela de alturas.
 *
 * Antes daqui a conta era um chute: reservava 25% da altura "para o
 * cabeçalho", sempre, houvesse quadro ou não. Reservava demais quando não
 * havia nada e de menos quando havia uma tabela comprida.
 *
 * A regra é a invasão por borda: para cada anotação, mede-se o quanto ela
 * entraria descontando por cada um dos quatro lados, e ela é atribuída ao
 * lado de MENOR invasão — que é o lado a que ela está encostada. É o que
 * distingue uma faixa larga e baixa, que é cabeçalho e custa só a sua
 * altura, de uma caixa alta e estreita, que é lateral e custa só a sua
 * largura. Descontar pelo lado errado jogaria fora meia folha.
 *
 * Anotação no meio da folha não conta — quem a pôs ali quis que ficasse
 * sobre o desenho.
 */
export function freeAreaMm(doc: CourseDocument): RectMm {
  const usable = usableArea(doc.page);
  const direita = usable.xMm + usable.widthMm;
  const base = usable.yMm + usable.heightMm;
  let esq = 0;
  let dir = 0;
  let topo = 0;
  let fundo = 0;

  for (const obj of doc.objects) {
    if (!obj.visible) continue;
    const caixa = anotacaoMm(doc, obj);
    if (!caixa) continue;

    const candidatos = [
      { lado: 'esq' as const, custo: caixa.xMm + caixa.widthMm - usable.xMm, teto: usable.widthMm },
      { lado: 'dir' as const, custo: direita - caixa.xMm, teto: usable.widthMm },
      { lado: 'topo' as const, custo: caixa.yMm + caixa.heightMm - usable.yMm, teto: usable.heightMm },
      { lado: 'fundo' as const, custo: base - caixa.yMm, teto: usable.heightMm },
    ]
      // Custo acima de meia folha é anotação central: não se desconta.
      .filter((c) => c.custo > 0 && c.custo < c.teto / 2)
      .sort((a, b) => a.custo - b.custo);

    const melhor = candidatos[0];
    if (!melhor) continue;
    if (melhor.lado === 'esq') esq = Math.max(esq, melhor.custo);
    else if (melhor.lado === 'dir') dir = Math.max(dir, melhor.custo);
    else if (melhor.lado === 'topo') topo = Math.max(topo, melhor.custo);
    else fundo = Math.max(fundo, melhor.custo);
  }

  const folga = 4;
  const largura = Math.max(20, usable.widthMm - esq - dir - (esq || dir ? folga : 0));
  const altura = Math.max(20, usable.heightMm - topo - fundo - (topo || fundo ? folga : 0));
  return {
    xMm: usable.xMm + esq + (esq ? folga : 0),
    yMm: usable.yMm + topo + (topo ? folga : 0),
    widthMm: largura,
    heightMm: altura,
  };
}

/** Retângulo em mm de uma anotação de papel; `null` para o resto. */
function anotacaoMm(doc: CourseDocument, obj: SceneObject): RectMm | null {
  if (obj.kind === 'infobox') {
    const l = infoBoxLayout(obj);
    return { xMm: obj.posMm.x, yMm: obj.posMm.y, widthMm: l.widthMm, heightMm: l.heightMm };
  }
  if (obj.kind === 'heighttable') {
    const l = heightTableLayout(
      obj,
      doc.objects.filter((o): o is Obstacle => o.kind === 'obstacle'),
    );
    return { xMm: obj.posMm.x, yMm: obj.posMm.y, widthMm: l.widthMm, heightMm: l.heightMm };
  }
  return null;
}

function fitScaleForArena(arena: Arena, area: RectMm): number {
  return fitScale(arena.widthM, arena.heightM, area.widthMm, area.heightMm);
}

/** Posição em mm onde o modelo (0,0) deve cair para centralizar a pista. */
function centerOriginMm(arena: Arena, page: CourseDocument['page'], area: RectMm): Vec2 {
  const k = 1000 / page.printScale;
  const drawW = arena.widthM * k;
  const drawH = arena.heightM * k;
  return {
    x: area.xMm + (area.widthMm - drawW) / 2 - arena.origin.x * k,
    y: area.yMm + (area.heightMm - drawH) / 2 - arena.origin.y * k,
  };
}

/**
 * Recentraliza o desenho na área útil da página. Chamado explicitamente
 * pelo usuário — trocar de escala ou de formato não move o desenho sozinho.
 */
export function centerOnPage(doc: CourseDocument): void {
  const arena = firstArena(doc);
  if (!arena) return;
  doc.originMm = centerOriginMm(arena, doc.page, freeAreaMm(doc));
}

/** Escala que faz a pista caber na página, já arredondada. */
export function fitScaleToPage(doc: CourseDocument): number {
  const arena = firstArena(doc);
  return arena ? fitScaleForArena(arena, freeAreaMm(doc)) : doc.page.printScale;
}

export const pageRectMm = (doc: CourseDocument) => {
  const { widthMm, heightMm } = pageSize(doc.page);
  return { x: 0, y: 0, width: widthMm, height: heightMm };
};

export function findObject(doc: CourseDocument, id: ObjectId): SceneObject | undefined {
  return doc.objects.find((o) => o.id === id);
}

export function objectsOfLayer(doc: CourseDocument, layer: LayerId): SceneObject[] {
  return doc.objects.filter((o) => o.layer === layer).sort((a, b) => a.z - b.z);
}

/** A pista — o primeiro contorno que NÃO é construção. */
export function firstArena(doc: CourseDocument): Arena | undefined {
  return doc.objects.find((o): o is Arena => o.kind === 'arena' && !o.structure);
}

export function isLayerLocked(doc: CourseDocument, layer: LayerId): boolean {
  return doc.layers.find((l) => l.id === layer)?.locked ?? false;
}

export function isLayerVisible(doc: CourseDocument, layer: LayerId): boolean {
  return doc.layers.find((l) => l.id === layer)?.visible ?? true;
}
