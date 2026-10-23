import type { Vec2 } from '@core/geometry/vec';
import type { Meters, Millimeters, PageSetup } from '@core/scale/units';

/**
 * Modelo de dados do documento. Toda geometria em METROS; todo tamanho de
 * anotação (traço, corpo de texto, seta) em MILÍMETROS DE PAPEL.
 * Ver docs/DECISOES.md, decisões 1 e 3.
 */

export type ObjectId = string;

export type LayerId =
  | 'background'
  | 'arena'
  | 'paths'
  | 'obstacles'
  | 'ornaments'
  | 'annotations';

export const LAYER_ORDER: readonly LayerId[] = [
  'background',
  'arena',
  'paths',
  'obstacles',
  'ornaments',
  'annotations',
] as const;

export interface Layer {
  id: LayerId;
  label: string;
  visible: boolean;
  locked: boolean;
}

/**
 * A que parte do trabalho o objeto pertence.
 *
 * `pista` é o cenário: o contorno, a imagem de referência, as árvores, o
 * lago — coisas do local, que se configuram uma vez e depois não se quer
 * mais esbarrar nelas. `percurso` é o que muda a cada prova: obstáculos,
 * traçados, linhas de cronometragem, textos.
 *
 * A separação existe porque a pista cobre toda a área de trabalho: sem
 * ela, qualquer clique no vazio pegava o fundo em vez do que se queria.
 */
export type ObjectScope = 'pista' | 'percurso';

interface BaseObject {
  id: ObjectId;
  layer: LayerId;
  locked: boolean;
  visible: boolean;
  scope: ObjectScope;
  /** Ordem dentro da camada. */
  z: number;
  /**
   * Vínculo (decisão 61): objetos com o mesmo `group` se selecionam e se
   * movem juntos. Ausente = solto. Usado no cenário da pista.
   */
  group?: string;
}

/* ---------------------------------------------------------------- pista */

export type ArenaShape = 'rectangle' | 'polygon';

/**
 * Construção do local: arquibancada, área de concreto, prédio. Usa a mesma
 * geometria da pista (retângulo ou contorno livre) e pode ficar dentro ou
 * fora dela — é referência de cenário, não limite do traçado (decisão 54).
 */
export type StructureType = 'arquibancada' | 'concreto' | 'edificacao' | 'ilha' | 'rio' | 'lago' | 'outra';

export interface StructureInfo {
  type: StructureType;
  /** Texto escrito no desenho: "Arquibancada", "Tribuna". Vazio = sem rótulo. */
  label: string;
  /** Tamanho da letra do rótulo, em mm de papel. Ausente = padrão (2,8). */
  labelSizeMm?: number;
  /** Giro do rótulo, em graus. Ausente = acompanha a aresta mais longa. */
  labelRotation?: number;
  /** Deslocamento do rótulo a partir do centro, em metros (decisão 70). */
  labelOffsetM?: Vec2;
}
export type CornerStyle = 'square' | 'rounded' | 'chamfer';

export interface Arena extends BaseObject {
  kind: 'arena';
  shape: ArenaShape;
  /** Canto superior esquerdo, para shape 'rectangle'. */
  origin: Vec2;
  widthM: Meters;
  heightM: Meters;
  /** Vértices em metros, para shape 'polygon'. */
  points: Vec2[];
  corner: { style: CornerStyle; radiusM: Meters };
  /** Régua de metros impressa no perímetro, como nos croquis FEI. */
  perimeterRuler: {
    visible: boolean;
    stepM: Meters;
    labelEveryM: Meters;
    sides: { top: boolean; right: boolean; bottom: boolean; left: boolean };
  };
  style: { strokeMm: Millimeters; fill: string; stroke: string };
  /**
   * Presente quando o contorno é uma CONSTRUÇÃO, e não a pista. Ausente ou
   * nulo é a pista — que é o que todo croqui antigo tem.
   */
  structure?: StructureInfo | null;
}

/* ----------------------------------------------------------- obstáculos */

export type ObstacleType = 'vertical' | 'oxer' | 'triplice' | 'muro' | 'plano';

export interface ObstacleElement {
  /** Altura em metros. `null` = não informada. */
  height: Meters | null;
  label?: string;
}

export type BarStyle = 'lisa' | 'listrada' | 'pontas';

/** Aparência das varas. Só se aplica aos tipos que têm vara. */
export interface BarAppearance {
  style: BarStyle;
  color: string;
  accent: string;
  /** Número de faixas no estilo listrado. */
  stripes: number;
}

/**
 * Lâmina de água acoplada a um vertical ou oxer. Não é um tipo de
 * obstáculo: é uma opção dele, e por construção fica sempre paralela à
 * frente — só a posição ao longo da profundidade é ajustável.
 */
export interface LiverpoolOption {
  enabled: boolean;
  /** Comprimento da lâmina, ao longo da frente. Padrão 3 m. */
  widthM: Meters;
  /** Profundidade da lâmina. Padrão 0,50 m. */
  spreadM: Meters;
  /** Deslocamento na profundidade, a partir do centro do obstáculo. */
  offsetM: Meters;
  color: string;
}

/**
 * Suporte das varas em vista superior.
 *
 * `paraflanco` é o padrão: sem ele o obstáculo parece uma vara solta no
 * chão. `pilar` desenha só o montante, e `nenhum` deixa a vara no chão de
 * propósito — há obstáculo assim.
 */
export type WingStyle = 'paraflanco' | 'pilar' | 'nenhum';

export interface WingsAppearance {
  style: WingStyle;
  /** Espessura do paraflanco, medida ao longo da frente. */
  widthM: Meters;
  /** Profundidade mínima; um oxer usa a própria largura de salto se maior. */
  depthM: Meters;
  color: string;
}

/** Rótulo do obstáculo. `auto` posiciona sozinho, fugindo do corpo e da seta. */
export interface ObstacleLabel {
  visible: boolean;
  auto: boolean;
  /** Deslocamento no sistema LOCAL do obstáculo, em metros. */
  offsetM: Vec2;
}

export interface Obstacle extends BaseObject {
  kind: 'obstacle';
  type: ObstacleType;
  /** Centro geométrico do obstáculo. */
  pos: Vec2;
  /** Absoluta, em graus horários. Nunca acumulada. */
  rotation: number;
  /** Frente do obstáculo (largura da barra). */
  faceWidthM: Meters;
  /** Profundidade real, para oxer/tríplice/rio. `null` quando não se aplica. */
  spreadM: Meters | null;
  /** Texto livre: "7", "10", "" — numeração manual (§14). */
  number: string;
  letter: 'A' | 'B' | 'C' | '';
  elements: ObstacleElement[];
  bar: BarAppearance;
  wings: WingsAppearance;
  liverpool: LiverpoolOption;
  arrow: { visible: boolean; reversed: boolean; lengthMm: Millimeters };
  /** Rótulo de alturas ao lado do obstáculo, como no croqui de referência. */
  heightLabel: ObstacleLabel;
  numberLabel: ObstacleLabel;
  note: string;
}

/* -------------------------------------------------------------- traçado */

export type NodeType = 'corner' | 'smooth';

export interface PathNode {
  pos: Vec2;
  type: NodeType;
  /** Alças relativas ao nó, em metros. `null` = segmento reto desse lado. */
  handleIn: Vec2 | null;
  handleOut: Vec2 | null;
  /**
   * Vínculo opcional a um obstáculo: mover ou girar o obstáculo arrasta o
   * nó junto (decisão 76). `at` guarda onde o obstáculo estava da última
   * vez — a diferença é o quanto o nó tem de andar.
   */
  anchor: {
    objectId: ObjectId;
    ref: 'takeoff' | 'landing' | 'center';
    at?: { pos: Vec2; rotation: number };
  } | null;
}

export type DashPreset = 'solid' | 'dashed' | 'dotted' | 'dashdot';

export interface DistanceLabel {
  visible: boolean;
  /** Deslocamento em relação ao ponto médio da perna, em metros. */
  offsetM: Vec2;
  decimals: number;
  color: string;
}

/**
 * Como as distâncias aparecem no croqui.
 *
 * `total` é o padrão: uma linha entre dois obstáculos mostra UM número,
 * como no croqui impresso. `trecho` mostra a distância de cada par de nós,
 * o que só faz sentido em traçado de poucos nós.
 */
export type DistanceMode = 'total' | 'trecho' | 'nenhum';

export interface CoursePath extends BaseObject {
  kind: 'path';
  nodes: PathNode[];
  /** Trechos medidos entre dois nós, cada um com seu rótulo de distância. */
  legs: { fromNode: number; toNode: number; label: DistanceLabel }[];
  distanceMode: DistanceMode;
  /** Rótulo do comprimento total, quando o modo é `total`. */
  totalLabel: DistanceLabel;
  style: { dash: DashPreset; strokeMm: Millimeters; color: string };
  /**
   * Distâncias entre obstáculos consecutivos que aparecem no croqui,
   * medidas ao longo deste traçado, de vara a vara. Chave "idDe>idPara";
   * ausente = oculta (decisão 54).
   */
  obstacleDistances: Record<string, boolean>;
  /**
   * Distâncias travadas (B-62), na mesma chave, com o valor em metros.
   * Depois de qualquer edição o programa repõe cada uma movendo o
   * obstáculo de destino sobre o traçado (decisão 76).
   */
  lockedDistances?: Record<string, number>;
  /**
   * Traçado gerado pelos assistentes (automático ou por trechos). Rodar o
   * assistente de novo SUBSTITUI esse traçado em vez de empilhar outro por
   * cima (B-04). Ausente = desenhado à mão, que nunca é substituído.
   */
  assistant?: true;
}

/* ------------------------------------------------------------ anotações */

export interface TextLabel extends BaseObject {
  kind: 'text';
  pos: Vec2;
  text: string;
  sizeMm: Millimeters;
  align: 'start' | 'middle' | 'end';
  rotation: number;
  color: string;
  bold: boolean;
}

/**
 * Trena (B-64): uma medida entre dois pontos do terreno, desenhada como
 * cota e impressa — referência para armar a pista. O texto é de papel.
 */
export interface MeasureLine extends BaseObject {
  kind: 'measure';
  a: Vec2;
  b: Vec2;
  sizeMm: Millimeters;
  decimals: number;
  color: string;
}

export interface InfoBoxField {
  id: string;
  label: string;
  value: string;
  enabled: boolean;
}

export interface InfoBox extends BaseObject {
  kind: 'infobox';
  /** Posição em milímetros de papel: o quadro é anotação, não geometria. */
  posMm: Vec2;
  widthMm: Millimeters;
  columns: number;
  fields: InfoBoxField[];
  style: { sizeMm: Millimeters; borderMm: Millimeters };
}

export interface HeightTable extends BaseObject {
  kind: 'heighttable';
  posMm: Vec2;
  /** Número de colunas de elemento (varas) exibidas. */
  elementColumns: number;
  showSpread: boolean;
  showNote: boolean;
  style: { sizeMm: Millimeters; rowHeightMm: Millimeters };
}

/**
 * Logo ou imagem na FOLHA (decisão 55): da federação, do clube, do
 * patrocinador. Como o quadro técnico, mora em milímetros de papel — não
 * cresce nem encolhe quando a escala do desenho muda.
 */
export interface Logo extends BaseObject {
  kind: 'logo';
  posMm: Vec2;
  widthMm: Millimeters;
  assetId: string;
  /** Proporção do arquivo: a altura sai da largura, sem deformar. */
  widthPx: number;
  heightPx: number;
}

/* --------------------------------------------- partida e chegada */

/**
 * Linha de cronometragem. Não é obstáculo: não tem altura, não entra na
 * tabela de alturas e não recebe número de percurso — mas tem paraflancos
 * e seta, como no croqui impresso.
 */
/**
 * Vínculo da cruzada com o obstáculo que ela serve.
 *
 * A partida pertence ao primeiro obstáculo e a chegada ao último. Guardar
 * o vínculo — e não só a posição — é o que permite a cruzada ACOMPANHAR o
 * obstáculo quando ele é movido ou girado. Sem isso, mexer no obstáculo 1
 * deixava a partida para trás, desalinhada, e a regra de "nunca há volta
 * na cronometragem" se perdia silenciosamente.
 */
export interface TimingAnchor {
  obstacleId: ObjectId;
  /**
   * Distância em metros até a VARA, não até o centro: da partida à vara
   * de entrada, ou da vara de saída à chegada. Num oxer as duas coisas
   * diferem pela largura do salto.
   */
  distanceM: Meters;
}

export interface TimingLine extends BaseObject {
  kind: 'timing';
  role: 'start' | 'finish';
  /** `null` em cruzada solta, de croqui antigo ou posicionada à mão. */
  anchor: TimingAnchor | null;
  pos: Vec2;
  rotation: number;
  /** Distância entre os dois paraflancos. */
  widthM: Meters;
  label: string;
  labelVisible: boolean;
  wings: WingsAppearance;
  arrow: { visible: boolean; reversed: boolean; lengthMm: Millimeters };
  style: { dash: DashPreset; strokeMm: Millimeters; color: string };
}

/* -------------------------------------------------- fundo e ornamentos */

export interface BackgroundImage extends BaseObject {
  kind: 'image';
  assetId: string;
  /** Canto superior esquerdo, em metros. */
  origin: Vec2;
  /** Escala resultante da calibração: metros por pixel da imagem. */
  metersPerPixel: number;
  /**
   * Dimensões em pixels, copiadas do arquivo. Ficam no objeto para que a
   * envoltória e o desenho não dependam de o asset estar carregado.
   */
  widthPx: number;
  heightPx: number;
  rotation: number;
  opacity: number;
  /** Registro da calibração feita, para poder revisar/refazer. */
  calibration: {
    pointA: Vec2;
    pointB: Vec2;
    knownDistanceM: Meters;
  } | null;
}

export type OrnamentType =
  | 'arvore'
  | 'arbusto'
  | 'vaso'
  | 'cerca'
  | 'cronometro'
  | 'seta'
  | 'entrada'
  | 'saida';

export interface Ornament extends BaseObject {
  kind: 'ornament';
  type: OrnamentType;
  pos: Vec2;
  rotation: number;
  sizeM: Meters;
  color: string;
  /** Entrada e saída: escreve "ENTRADA"/"SAÍDA" ao lado da seta. */
  showLabel?: boolean;
}

/* ------------------------------------------------------------ documento */

export type SceneObject =
  | Arena
  | Obstacle
  | TimingLine
  | CoursePath
  | TextLabel
  | MeasureLine
  | InfoBox
  | HeightTable
  | BackgroundImage
  | Ornament
  | Logo;

export type ObjectKind = SceneObject['kind'];

export interface GridSettings {
  visible: boolean;
  /** 0 = automático conforme o zoom. */
  stepM: Meters;
  subdivisions: number;
  /** Passo do giro com Shift segurado, em graus. */
  angleSnapDeg: number;
}

export interface DocumentMeta {
  title: string;
  competition: string;
  venue: string;
  date: string;
  designer: string;
  technicalDelegate: string;
}

export interface Asset {
  mime: string;
  /** Data URL completa. Embutida no arquivo do projeto. */
  dataUrl: string;
  width: number;
  height: number;
  name: string;
}

export interface CourseDocument {
  schemaVersion: number;
  meta: DocumentMeta;
  page: PageSetup;
  /** Onde o ponto (0,0) do modelo cai na página, em mm. */
  originMm: Vec2;
  grid: GridSettings;
  layers: Layer[];
  objects: SceneObject[];
  assets: Record<string, Asset>;
}

export const SCHEMA_VERSION = 11;
