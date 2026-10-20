import { create } from 'zustand';
import type { Vec2 } from '@core/geometry/vec';
import type {
  ObjectId,
  ObjectScope,
  ObstacleType,
  OrnamentType,
  StructureType,
  PathNode,
  SceneObject,
} from '@core/model/types';
import { withChoice, type GuidedRide } from '@core/assist/guidedRide';
import type { Viewport } from '@core/scale/viewport';
import { ZOOM_ACTUAL_SIZE } from '@core/scale/viewport';

/**
 * Estado de edição. NÃO é salvo no arquivo e NÃO entra no histórico:
 * zoom, seleção e ferramenta ativa não são dados do croqui.
 */

/** Janelas que se abrem por menu. Só uma de cada vez. */
export type DialogId = 'atalhos' | 'modelos' | 'folha' | 'sobre';

export type Tool =
  | 'select'
  | 'pan'
  | 'ornament'
  | 'arena-rect'
  | 'arena-polygon'
  | 'calibrate'
  | 'obstacle'
  | 'path'
  | 'text';

interface EditorState {
  /**
   * Momento do trabalho. Só é selecionável o que pertence ao modo ativo:
   * configurando a pista não se esbarra nos obstáculos, e desenhando o
   * percurso a pista vira fundo intocável.
   */
  mode: ObjectScope;
  tool: Tool;
  viewport: Viewport;
  selection: ObjectId[];
  /** Ponto do modelo sob o cursor, em metros. `null` fora do canvas. */
  cursorM: Vec2 | null;
  /** Distância da cruzada de tempo ao obstáculo que ela serve, em metros. */
  timingDistanceM: number;
  /**
   * Traçado por trechos em andamento. Fica no editor, e não no documento:
   * é rascunho de trabalho, some ao sair, e nada dele vai para o arquivo
   * até o desenhador aplicar.
   */
  guided: GuidedRide | null;
  guidedLeg: number;
  showPageFrame: boolean;
  /**
   * Marcadores de interferência na tela. Ferramenta de trabalho: nunca
   * sai no PDF nem na impressão, ligada ou desligada.
   */
  showInterference: boolean;
  /** Área de transferência do editor: cópias profundas, sem id. */
  clipboard: SceneObject[];
  /** Tipo de ornamento que a ferramenta de inserção vai criar. */
  ornamentType: OrnamentType;
  /** Tipo de obstáculo que a ferramenta de inserção vai criar. */
  obstacleType: ObstacleType;
  /**
   * Desenho em andamento (contorno da pista): vértices já fixados e o
   * ponto sob o cursor. Some ao concluir ou cancelar — nunca vira dado.
   */
  draft: { points: Vec2[]; cursor: Vec2 | null } | null;
  /** Modo de edição de vértices do contorno selecionado. */
  editingVertices: boolean;
  /**
   * Calibração em andamento: a imagem alvo e os dois pontos marcados.
   * Vira escala só quando o usuário confirma a distância real.
   */
  calibration: { imageId: ObjectId; pointA: Vec2 | null; pointB: Vec2 | null } | null;
  /**
   * Traçado em construção: nós já fixados e o ponto sob o cursor. Vira
   * objeto só ao concluir — um rascunho nunca entra no documento.
   */
  pathDraft: { nodes: PathNode[]; cursor: Vec2 | null } | null;
  /** Nó do traçado selecionado, para editar alças. */
  activeNode: number | null;
  /** Desenhar traçado curvo (padrão) ou em segmentos retos. */
  pathSmooth: boolean;
  /**
   * Com valor, as ferramentas de contorno desenham uma CONSTRUÇÃO desse
   * tipo em vez da pista (decisão 54).
   */
  structureType: StructureType | null;
  /** Janela aberta por menu, ou nenhuma. */
  dialog: DialogId | null;
  /**
   * Dicas dos painéis visíveis. Começam escondidas: o painel mostra os
   * campos, e a explicação fica a um clique no "?".
   */
  showHints: boolean;

  setMode: (mode: ObjectScope) => void;
  setTool: (tool: Tool) => void;
  setViewport: (vp: Viewport) => void;
  setSelection: (ids: ObjectId[]) => void;
  toggleSelection: (id: ObjectId) => void;
  clearSelection: () => void;
  setCursor: (p: Vec2 | null) => void;
  setTimingDistance: (metros: number) => void;
  startGuided: (ride: GuidedRide) => void;
  setGuidedLeg: (index: number) => void;
  chooseGuidedOption: (option: number) => void;
  endGuided: () => void;
  togglePageFrame: () => void;
  toggleInterference: () => void;
  setClipboard: (objs: SceneObject[]) => void;
  setOrnamentType: (t: OrnamentType) => void;
  setObstacleType: (t: ObstacleType) => void;
  startDraft: (first: Vec2) => void;
  addDraftPoint: (p: Vec2) => void;
  setDraftCursor: (p: Vec2 | null) => void;
  clearDraft: () => void;
  setEditingVertices: (v: boolean) => void;
  beginCalibration: (imageId: ObjectId) => void;
  setCalibrationPoint: (p: Vec2) => void;
  cancelCalibration: () => void;
  startPathDraft: (node: PathNode) => void;
  addPathNode: (node: PathNode) => void;
  updateLastPathNode: (patch: Partial<PathNode>) => void;
  setPathCursor: (p: Vec2 | null) => void;
  clearPathDraft: () => void;
  setActiveNode: (index: number | null) => void;
  setPathSmooth: (v: boolean) => void;
  setStructureType: (t: StructureType | null) => void;
  setDialog: (d: DialogId | null) => void;
  toggleHints: () => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  // O documento novo não tem pista: o primeiro passo é desenhá-la.
  mode: 'pista',
  tool: 'select',
  viewport: { centerMm: { x: 148, y: 105 }, zoom: ZOOM_ACTUAL_SIZE },
  selection: [],
  cursorM: null,
  timingDistanceM: 12,
  guided: null,
  guidedLeg: 0,
  showPageFrame: true,
  showInterference: true,
  clipboard: [],
  ornamentType: 'arvore',
  obstacleType: 'vertical',
  draft: null,
  editingVertices: false,
  calibration: null,
  pathDraft: null,
  activeNode: null,
  pathSmooth: true,
  structureType: null,
  dialog: null,
  showHints: false,

  // Trocar de modo limpa a seleção: o que estava escolhido pode não ser
  // mais selecionável, e uma seleção invisível é fonte de confusão.
  setStructureType: (structureType) => set({ structureType }),
  setDialog: (dialog) => set({ dialog }),
  toggleHints: () => set((s) => ({ showHints: !s.showHints })),
  setMode: (mode) =>
    set({ mode, selection: [], tool: 'select', draft: null, pathDraft: null, calibration: null }),
  setTool: (tool) => set({ tool }),
  setViewport: (viewport) => set({ viewport }),
  setSelection: (selection) => set({ selection }),
  toggleSelection: (id) =>
    set((s) => ({
      selection: s.selection.includes(id)
        ? s.selection.filter((x) => x !== id)
        : [...s.selection, id],
    })),
  clearSelection: () => set({ selection: [] }),
  setCursor: (cursorM) => set({ cursorM }),
  setTimingDistance: (timingDistanceM) => set({ timingDistanceM }),
  startGuided: (guided) => set({ guided, guidedLeg: 0, selection: [] }),
  setGuidedLeg: (guidedLeg) => set({ guidedLeg }),
  chooseGuidedOption: (option) =>
    set((s) => (s.guided ? { guided: withChoice(s.guided, s.guidedLeg, option) } : s)),
  endGuided: () => set({ guided: null, guidedLeg: 0 }),
  togglePageFrame: () => set((s) => ({ showPageFrame: !s.showPageFrame })),
  toggleInterference: () => set((s) => ({ showInterference: !s.showInterference })),
  setClipboard: (clipboard) => set({ clipboard }),
  setOrnamentType: (ornamentType) => set({ ornamentType }),
  setObstacleType: (obstacleType) => set({ obstacleType }),
  startDraft: (first) => set({ draft: { points: [first], cursor: first } }),
  addDraftPoint: (p) =>
    set((s) => (s.draft ? { draft: { ...s.draft, points: [...s.draft.points, p] } } : {})),
  setDraftCursor: (cursor) => set((s) => (s.draft ? { draft: { ...s.draft, cursor } } : {})),
  clearDraft: () => set({ draft: null }),
  setEditingVertices: (editingVertices) => set({ editingVertices }),
  beginCalibration: (imageId) =>
    set({ calibration: { imageId, pointA: null, pointB: null }, tool: 'calibrate' }),
  setCalibrationPoint: (p) =>
    set((s) => {
      if (!s.calibration) return {};
      const { pointA, pointB } = s.calibration;
      // Terceiro clique recomeça: é mais previsível do que ignorá-lo.
      if (pointA && pointB) return { calibration: { ...s.calibration, pointA: p, pointB: null } };
      return {
        calibration: pointA
          ? { ...s.calibration, pointB: p }
          : { ...s.calibration, pointA: p },
      };
    }),
  cancelCalibration: () => set({ calibration: null, tool: 'select' }),
  startPathDraft: (node) => set({ pathDraft: { nodes: [node], cursor: node.pos } }),
  addPathNode: (node) =>
    set((s) => (s.pathDraft ? { pathDraft: { ...s.pathDraft, nodes: [...s.pathDraft.nodes, node] } } : {})),
  updateLastPathNode: (patch) =>
    set((s) => {
      if (!s.pathDraft || s.pathDraft.nodes.length === 0) return {};
      const nodes = s.pathDraft.nodes.slice();
      nodes[nodes.length - 1] = { ...nodes[nodes.length - 1]!, ...patch };
      return { pathDraft: { ...s.pathDraft, nodes } };
    }),
  setPathCursor: (cursor) => set((s) => (s.pathDraft ? { pathDraft: { ...s.pathDraft, cursor } } : {})),
  clearPathDraft: () => set({ pathDraft: null }),
  setActiveNode: (activeNode) => set({ activeNode }),
  setPathSmooth: (pathSmooth) => set({ pathSmooth }),
}));
