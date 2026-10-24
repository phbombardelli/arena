import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { insertArenaVertex } from '@core/commands/arenaOps';
import { insertNode } from '@core/commands/pathOps';
import { allObstacles } from '@core/commands/obstacleOps';
import { addObject, deleteObjects, moveObjects } from '@core/commands/ops';
import { slideAlongPath } from '@core/commands/distanceOps';
import { toMillimeterPrecision } from '@core/geometry/snap';
import { distance, type Vec2 } from '@core/geometry/vec';
import { COURSE_TYPES, createObstacle, nextObstacleNumber } from '@core/library/obstacles';
import { createOrnament, gateRotation } from '@core/library/ornaments';
import { ovalPoints } from '@core/assist/decor';
import { createTextLabel } from '@core/library/annotations';
import { constrainToFence, createMeasure, measureLength } from '@core/library/measures';
import { createPath, createPathNode, smoothedNodes } from '@core/model/path';
import { createPolygonArena, createRectangleArena } from '@core/model/arena';
import { createPolygonStructure, createRectangleStructure } from '@core/library/structures';
import { pageRectMm } from '@core/model/document';
import { getRotation, scaleMode } from '@core/model/transform';
import { mmPerMeter } from '@core/scale/units';
import {
  fitToRect,
  metersPerPixel as mppOf,
  panBy,
  screenToModel,
  viewBox,
  viewBoxAttr,
  zoomAt,
} from '@core/scale/viewport';
import { RenderDocument } from '@render/renderDocument';
import { color } from '@render/style/tokens';
import { useDocumentStore } from '@store/documentStore';
import { imageFromClipboard, pasteBackgroundImage } from '@ui/actions/imageActions';
import { useEditorStore } from '@store/editorStore';
import { saveCourse, saveDocumentAs } from '@ui/actions/documentActions';
import {
  copySelection,
  deleteSelection,
  duplicateSelection,
  linkSelection,
  pasteClipboard,
  unlinkSelection,
  selectAll,
} from '@ui/actions/editActions';
import { exportCurrentPdf } from '@ui/actions/exportActions';
import { toggleGrid } from '@ui/actions/viewActions';
import { printDocument } from '@platform/print';
import { useElementSize } from '@ui/hooks/useElementSize';
import { ArenaDraft, ArenaHandles } from './ArenaHandles';
import { PathDraft, PathHandles } from './PathHandles';
import { measureFrame } from '@core/model/measureFrame';
import { CalibrationOverlay } from './CalibrationOverlay';
import { RULER_SIZE, Rulers } from './Rulers';
import { GuidedOverlay } from './GuidedOverlay';
import { InterferenceOverlay } from './InterferenceOverlay';
import { LiveDistanceOverlay } from './LiveDistanceOverlay';
import { CenterGuideOverlay } from './CenterGuideOverlay';
import { InlineTextEditor } from './InlineTextEditor';
import { SelectionOverlay } from './SelectionOverlay';
import { useObjectGestures } from './useObjectGestures';

const ZOOM_STEP = 1.12;

export function Canvas() {
  const doc = useDocumentStore((s) => s.doc);
  const {
    viewport,
    setViewport,
    tool,
    setTool,
    selection,
    setSelection,
    cursorM,
    setCursor,
    showPageFrame,
    draft,
    editingVertices,
    calibration,
    pathDraft,
    activeNode,
    mode,
  } = useEditorStore();

  const { ref, size: wrapSize } = useElementSize<HTMLDivElement>();
  /**
   * Tamanho do SVG, já descontadas as réguas. TODA a matemática de
   * viewport usa este valor — usar o tamanho do contêiner em um lugar e o
   * do SVG em outro desloca o cursor e o zoom em meia régua.
   */
  const size = useMemo(
    () => ({
      width: Math.max(0, wrapSize.width - RULER_SIZE),
      height: Math.max(0, wrapSize.height - RULER_SIZE),
    }),
    [wrapSize.width, wrapSize.height],
  );
  const svgRef = useRef<SVGSVGElement | null>(null);
  const panState = useRef<{ pointerId: number; last: Vec2 } | null>(null);
  /** Ponto onde o último nó do traçado foi fixado, para o arrasto curvar. */
  const pathDragFrom = useRef<Vec2 | null>(null);
  /** Trena sendo desenhada: o arrasto leva a segunda ponta. */
  const measureDraft = useRef<{ id: string; a: Vec2 } | null>(null);
  /** Texto sendo editado no próprio desenho (B-68). */
  const [editingText, setEditingText] = useState<string | null>(null);
  const spaceDown = useRef(false);

  const localPoint = useCallback((e: { clientX: number; clientY: number }): Vec2 => {
    const rect = svgRef.current?.getBoundingClientRect();
    return rect ? { x: e.clientX - rect.left, y: e.clientY - rect.top } : { x: 0, y: 0 };
  }, []);

  const toModel = useCallback(
    (e: { clientX: number; clientY: number }): Vec2 =>
      screenToModel(localPoint(e), viewport, size, doc.page.printScale, doc.originMm),
    [localPoint, viewport, size, doc.page.printScale, doc.originMm],
  );

  const gestures = useObjectGestures(toModel);

  /** Ponto do modelo arredondado ao milímetro — sem ímã: vai onde se clicou. */
  const snapped = useCallback(
    (p: Vec2): Vec2 => ({ x: toMillimeterPrecision(p.x), y: toMillimeterPrecision(p.y) }),
    [],
  );

  /** Tolerância de fechamento do contorno: 10 px, convertidos para metros. */
  const closeToleranceM = useCallback(
    () => 10 * mppOf(viewport, doc.page.printScale),
    [viewport, doc.page.printScale],
  );

  const finishPolygon = useCallback(() => {
    const ed = useEditorStore.getState();
    const points = ed.draft?.points ?? [];
    ed.clearDraft();
    if (points.length < 3) return;
    const tipo = ed.structureType;
    const arena = tipo ? createPolygonStructure(points, tipo) : createPolygonArena(points);
    // Ilha desenhada no modo Percurso é ornamento móvel da prova (decisão 74).
    if (tipo && ed.mode === 'percurso') arena.scope = 'percurso';
    useDocumentStore.getState().apply(tipo ? 'Desenhar construção' : 'Desenhar pista', (d) => addObject(d, arena));
    ed.setSelection([arena.id]);
    ed.setEditingVertices(true);
    ed.setTool('select');
  }, []);

  /**
   * Conclui o traçado. Menos de dois nós não é traçado: some sem deixar
   * objeto no documento.
   */
  const finishPath = useCallback(() => {
    const ed = useEditorStore.getState();
    const nodes = ed.pathDraft?.nodes ?? [];
    ed.clearPathDraft();
    if (nodes.length < 2) return;
    // Curvo por padrão: clicar ponto a ponto e receber uma poligonal
    // angulosa não é o que o desenhador quer ver.
    const traco = createPath(ed.pathSmooth ? smoothedNodes(nodes) : nodes);
    useDocumentStore.getState().apply('Desenhar traçado', (d) => addObject(d, traco));
    ed.setSelection([traco.id]);
    ed.setActiveNode(null);
    ed.setTool('select');
  }, []);

  const finishRectangle = useCallback(() => {
    const ed = useEditorStore.getState();
    const draft = ed.draft;
    ed.clearDraft();
    if (!draft?.cursor) return;
    const a = draft.points[0]!;
    const b = draft.cursor;
    const widthM = Math.abs(b.x - a.x);
    const heightM = Math.abs(b.y - a.y);
    // Arrasto muito curto costuma ser clique acidental.
    if (widthM < 2 || heightM < 2) return;
    const canto = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) };
    const tipo = ed.structureType;
    // Ilha arrastada nasce oval, inscrita no retângulo (decisão 74).
    const arena =
      tipo === 'ilha'
        ? createPolygonStructure(ovalPoints(canto, widthM, heightM), 'ilha')
        : tipo
          ? createRectangleStructure(canto, widthM, heightM, tipo)
          : createRectangleArena(canto, widthM, heightM);
    if (tipo && ed.mode === 'percurso') arena.scope = 'percurso';
    useDocumentStore.getState().apply(tipo ? 'Criar construção' : 'Criar pista', (d) => addObject(d, arena));
    ed.setSelection([arena.id]);
    ed.setTool('select');
  }, []);

  const fitPage = useCallback(() => {
    if (size.width > 0) setViewport(fitToRect(pageRectMm(doc), size));
  }, [doc, size, setViewport]);

  const didFit = useRef(false);
  useEffect(() => {
    if (!didFit.current && size.width > 0 && size.height > 0 && wrapSize.width > 0) {
      didFit.current = true;
      fitPage();
    }
  }, [size, wrapSize.width, fitPage]);

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      const factor = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
      setViewport(zoomAt(viewport, localPoint(e), factor, size));
    },
    [viewport, size, setViewport, localPoint],
  );

  /**
   * A ferramenta ativa é lida no momento do evento, e não do render. Se
   * viesse do render, o primeiro clique logo depois de trocar de
   * ferramenta ainda usaria a anterior.
   */
  const activeTool = () => useEditorStore.getState().tool;

  const wantsPan = (e: React.PointerEvent) =>
    activeTool() === 'pan' || e.button === 1 || spaceDown.current;

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      const tool = activeTool();
      if (wantsPan(e)) {
        e.preventDefault();
        panState.current = { pointerId: e.pointerId, last: { x: e.clientX, y: e.clientY } };
        try {
          (e.target as Element).setPointerCapture?.(e.pointerId);
        } catch {
          /* segue sem captura */
        }
        return;
      }
      if (e.button !== 0) return;

      if (tool === 'calibrate') {
        // Sem snap: a mira segue exatamente onde o usuário clicou sobre a
        // imagem. Alinhar ao grid aqui falsearia a própria calibração.
        useEditorStore.getState().setCalibrationPoint(toModel(e));
        return;
      }

      if (tool === 'arena-rect') {
        useEditorStore.getState().startDraft(snapped(toModel(e)));
        return;
      }

      if (tool === 'arena-polygon') {
        const ed = useEditorStore.getState();
        const p = snapped(toModel(e));
        if (!ed.draft) {
          ed.startDraft(p);
          return;
        }
        // Clicar de volta no primeiro vértice fecha o contorno.
        const first = ed.draft.points[0]!;
        if (ed.draft.points.length >= 3 && distance(first, p) <= closeToleranceM()) {
          finishPolygon();
          return;
        }
        ed.addDraftPoint(p);
        return;
      }

      if (tool === 'obstacle') {
        const ed = useEditorStore.getState();
        const st = useDocumentStore.getState();
        // No percurso de salto só entram os quatro tipos de salto; na
        // ginástica, todos, e sem número automático (B-37).
        const ginastica = st.doc.kind === 'ginastica';
        const tipo = ginastica || COURSE_TYPES.includes(ed.obstacleType) ? ed.obstacleType : 'vertical';
        const obstaculo = createObstacle(tipo, snapped(toModel(e)), ginastica ? '' : nextObstacleNumber(allObstacles(st.doc)));
        st.apply('Inserir obstáculo', (d) => addObject(d, obstaculo));
        setSelection([obstaculo.id]);
        if (!e.shiftKey) setTool('select');
        return;
      }

      if (tool === 'path') {
        const ed = useEditorStore.getState();
        const p = snapped(toModel(e));
        const no = createPathNode(p, 'corner');
        if (!ed.pathDraft) ed.startPathDraft(no);
        else ed.addPathNode(no);
        // O arrasto a partir daqui curva o nó recém-criado.
        pathDragFrom.current = p;
        return;
      }

      if (tool === 'measure') {
        // Trena: aperta numa ponta, arrasta até a outra (B-64).
        const a = snapped(toModel(e));
        const trena = createMeasure(a);
        useDocumentStore.getState().apply('Trena', (d) => addObject(d, trena), 'gesto-trena');
        measureDraft.current = { id: trena.id, a };
        return;
      }

      if (tool === 'text') {
        const texto = createTextLabel(snapped(toModel(e)));
        useDocumentStore.getState().apply('Inserir texto', (d) => addObject(d, texto));
        setSelection([texto.id]);
        if (!e.shiftKey) setTool('select');
        return;
      }

      if (tool === 'ornament') {
        const tipo = useEditorStore.getState().ornamentType;
        const ornament = createOrnament(
          tipo,
          snapped(toModel(e)),
        );
        // Entrada e saída já nascem perpendiculares à cerca mais próxima.
        if (tipo === 'entrada' || tipo === 'saida') {
          ornament.rotation = gateRotation(tipo, ornament.pos, measureFrame(useDocumentStore.getState().doc).outline);
        }
        useDocumentStore.getState().apply('Inserir ornamento', (d) => addObject(d, ornament));
        setSelection([ornament.id]);
        if (!e.shiftKey) setTool('select');
        return;
      }

      gestures.beginMarquee(e);
    },
    [toModel, snapped, closeToleranceM, finishPolygon, gestures, setSelection, setTool],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const pan = panState.current;
      if (pan && pan.pointerId === e.pointerId) {
        setViewport(panBy(viewport, { x: e.clientX - pan.last.x, y: e.clientY - pan.last.y }));
        pan.last = { x: e.clientX, y: e.clientY };
        return;
      }
      // Arrastar logo após fixar um nó cria a curva, como numa caneta
      // vetorial: a distância arrastada vira o tamanho da alça.
      const arrasto = pathDragFrom.current;
      if (arrasto && activeTool() === 'path') {
        const atual = toModel(e);
        const rel = { x: atual.x - arrasto.x, y: atual.y - arrasto.y };
        if (Math.hypot(rel.x, rel.y) > 0.15) {
          useEditorStore.getState().updateLastPathNode({
            type: 'smooth',
            handleOut: rel,
            handleIn: { x: -rel.x, y: -rel.y },
          });
        }
      }

      gestures.onPointerMove(e);

      const trena = measureDraft.current;
      if (trena) {
        const raw = toModel(e);
        // Shift: perpendicular ou paralela à cerca mais próxima, exata.
        const b = e.shiftKey
          ? constrainToFence(measureFrame(useDocumentStore.getState().doc).outline, trena.a, raw)
          : snapped(raw);
        useDocumentStore.getState().apply(
          'Trena',
          (d) => {
            const m = d.objects.find((o) => o.id === trena.id);
            if (m?.kind === 'measure') m.b = b;
          },
          'gesto-trena',
        );
      }

      // Durante a calibração o cursor não é alinhado ao grid: a mira tem
      // de cair exatamente sobre a referência da imagem.
      const raw = toModel(e);
      const p = activeTool() === 'calibrate' ? raw : snapped(raw);
      setCursor(p);
      const ed = useEditorStore.getState();
      if (ed.draft) ed.setDraftCursor(p);
      if (ed.pathDraft && !pathDragFrom.current) ed.setPathCursor(p);
    },
    [viewport, setViewport, setCursor, toModel, gestures, snapped],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (panState.current?.pointerId === e.pointerId) panState.current = null;
      pathDragFrom.current = null;
      if (activeTool() === 'arena-rect') finishRectangle();
      const trena = measureDraft.current;
      if (trena) {
        measureDraft.current = null;
        const st = useDocumentStore.getState();
        const m = st.doc.objects.find((o) => o.id === trena.id);
        // Clique sem arrastar não deixa trena de comprimento zero.
        if (m?.kind === 'measure' && measureLength(m) < 0.2) {
          st.apply('Trena', (d) => deleteObjects(d, [trena.id]), 'gesto-trena');
        } else {
          setSelection([trena.id]);
          setTool('select');
        }
      }
      gestures.onPointerUp();
    },
    [gestures, finishRectangle, setSelection, setTool],
  );

  /* ------------------------------------------------------------ teclado */

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;

      const ed = useEditorStore.getState();
      const st = useDocumentStore.getState();
      const ctrl = e.ctrlKey || e.metaKey;
      const sel = ed.selection;

      if (e.code === 'Space') {
        spaceDown.current = true;
        return;
      }

      const key = e.key.toLowerCase();

      // O traçado em construção tem prioridade sobre os atalhos gerais.
      if (ed.pathDraft) {
        if (e.key === 'Enter') {
          e.preventDefault();
          finishPath();
          return;
        }
        if (e.key === 'Escape') {
          ed.clearPathDraft();
          ed.setTool('select');
          return;
        }
      }

      // O contorno em construção tem prioridade sobre os atalhos gerais.
      if (ed.draft) {
        if (e.key === 'Enter') {
          e.preventDefault();
          finishPolygon();
          return;
        }
        if (e.key === 'Escape') {
          ed.clearDraft();
          ed.setTool('select');
          return;
        }
      }

      if (ctrl && key === 's') {
        e.preventDefault();
        void (e.shiftKey ? saveDocumentAs() : saveCourse());
      } else if (ctrl && key === 'o') {
        e.preventDefault();
        ed.setDialog('abrir');
      } else if (ctrl && key === 'n') {
        e.preventDefault();
        ed.setDialog('novo');
      } else if (ctrl && key === 'z' && !e.shiftKey) {
        e.preventDefault();
        st.undo();
      } else if (ctrl && (key === 'y' || (key === 'z' && e.shiftKey))) {
        e.preventDefault();
        st.redo();
      } else if (ctrl && key === 'a') {
        e.preventDefault();
        selectAll();
      } else if (ctrl && key === 'c') {
        copySelection();
      } else if (ctrl && key === 'v') {
        // Quem cola é o evento 'paste', logo abaixo: só ele enxerga uma
        // imagem vinda de fora (um print do mapa, por exemplo).
      } else if (ctrl && key === 'g') {
        e.preventDefault();
        if (e.shiftKey) unlinkSelection();
        else linkSelection();
      } else if (ctrl && key === 'd') {
        e.preventDefault();
        duplicateSelection();
      } else if (ctrl && key === 'e') {
        e.preventDefault();
        void exportCurrentPdf();
      } else if (ctrl && key === 'p') {
        e.preventDefault();
        printDocument(st.doc);
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (sel.length === 0) return;
        e.preventDefault();
        deleteSelection();
      } else if (e.key.startsWith('Arrow')) {
        if (sel.length === 0) return;
        e.preventDefault();
        // Setas: 10 cm por toque; com Shift, 1 m.
        const step = e.shiftKey ? 1 : 0.1;
        // Alt + setas: o obstáculo preso ao traçado anda sobre ele (B-65) —
        // para cima/direita no sentido do percurso.
        if (e.altKey) {
          const sentido = e.key === 'ArrowUp' || e.key === 'ArrowRight' ? 1 : -1;
          st.apply(
            'Mover sobre o traçado',
            (draft) => {
              for (const id of sel) slideAlongPath(draft, id, sentido * step);
            },
            'teclado-deslizar',
          );
          return;
        }
        const d: Vec2 = {
          x: e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0,
          y: e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0,
        };
        st.apply(
          'Mover',
          (draft) => moveObjects(draft, sel, d),
          'teclado-mover',
        );
      } else if (e.key === '0' && ctrl) {
        e.preventDefault();
        fitPage();
      } else if (ctrl || e.altKey) {
        // Letra com modificador não é atalho de ferramenta.
      } else if (key === 'g') {
        toggleGrid();
      } else if (key === 'v') {
        ed.setTool('select');
      } else if (key === 'h') {
        ed.setTool('pan');
      } else if (key === 't' && st.doc.kind === 'ginastica') {
        // Ginástica não tem traçado.
      } else if (key === 'o' || key === 't' || key === 'x' || key === 'm') {
        // Ferramentas do percurso: vindo do modo Pista, troca de modo antes.
        if (ed.mode !== 'percurso') ed.setMode('percurso');
        useEditorStore
          .getState()
          .setTool(key === 'o' ? 'obstacle' : key === 't' ? 'path' : key === 'm' ? 'measure' : 'text');
      } else if (e.key === '?') {
        ed.setDialog('atalhos');
      } else if (e.key === 'Escape') {
        if (ed.calibration) {
          ed.cancelCalibration();
          return;
        }
        ed.setTool('select');
        ed.setEditingVertices(false);
        ed.clearSelection();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') spaceDown.current = false;
    };
    // Colar: uma imagem na área de transferência vira imagem de fundo;
    // senão, cola os objetos copiados dentro do próprio editor.
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      e.preventDefault();
      const imagem = imageFromClipboard(e.clipboardData);
      if (imagem) void pasteBackgroundImage(imagem);
      else pasteClipboard();
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('paste', onPaste);
    };
  }, [fitPage, finishPath]);

  const medida = useMemo(() => measureFrame(doc), [doc]);
  const mpp = mppOf(viewport, doc.page.printScale);
  const box = viewBox(viewport, size);
  const cursor = tool === 'pan' ? 'grab' : tool === 'select' ? 'default' : 'crosshair';

  const k = mmPerMeter(doc.page.printScale);
  const toPaper = (p: Vec2): Vec2 => ({
    x: doc.originMm.x + p.x * k,
    y: doc.originMm.y + p.y * k,
  });
  const selectedObjects = doc.objects.filter((o) => selection.includes(o.id));
  const selectedArena =
    selectedObjects.length === 1 && selectedObjects[0]!.kind === 'arena'
      ? selectedObjects[0]
      : null;
  const selectedPath =
    selectedObjects.length === 1 && selectedObjects[0]!.kind === 'path'
      ? selectedObjects[0]
      : null;

  return (
    <div className="canvas-wrap" ref={ref}>
      <div className="canvas-inner" style={{ left: RULER_SIZE, top: RULER_SIZE }}>
        <svg
          ref={svgRef}
          className="canvas-svg"
          width={size.width}
          height={size.height}
          viewBox={viewBoxAttr(viewport, size)}
          style={{ background: color.canvasBg, cursor }}
          onWheel={handleWheel}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onPointerLeave={() => setCursor(null)}
          onDoubleClick={(e) => {
            if (activeTool() !== 'select') return;
            const alvo = (e.target as Element).closest?.('[data-kind="text"]');
            const id = alvo?.getAttribute('data-object');
            const obj = id ? useDocumentStore.getState().doc.objects.find((o) => o.id === id) : null;
            if (obj?.kind === 'text' && !obj.locked) {
              e.stopPropagation();
              setSelection([obj.id]);
              setEditingText(obj.id);
            }
          }}
        >
          <RenderDocument
            mode="screen"
            editScope={mode}
            doc={doc}
            selection={selection}
            viewBoxMm={box}
            metersPerPixel={mpp}
            showPageFrame={showPageFrame}
            onObjectPointerDown={(id, e) => {
              if (wantsPan(e) || activeTool() !== 'select' || e.button !== 0) return;
              e.stopPropagation();
              gestures.beginDrag(e, id);
            }}
          />
          <GuidedOverlay zoom={viewport.zoom} />

          <InterferenceOverlay zoom={viewport.zoom} />
          <LiveDistanceOverlay zoom={viewport.zoom} />
          <CenterGuideOverlay zoom={viewport.zoom} />
          {editingText && (
            <InlineTextEditor key={editingText} doc={doc} id={editingText} onDone={() => setEditingText(null)} />
          )}

          <SelectionOverlay
            doc={doc}
            selection={selection}
            zoom={viewport.zoom}
            marquee={gestures.marquee}
            showRotate={selectedObjects.some(
              (o) => (getRotation(o) !== null && o.kind !== 'timing') || (o.kind === 'arena' && !!o.structure),
            )}
            onRotateHandleDown={(e) => {
              e.stopPropagation();
              gestures.beginRotate(e);
            }}
            onCornerDown={
              selectedObjects.length === 1 && scaleMode(selectedObjects[0]!)
                ? (e, corner) => {
                    if (e.button !== 0) return;
                    gestures.beginScale(e, selectedObjects[0]!.id, corner);
                  }
                : undefined
            }
          >
            {selectedArena && (
              <ArenaHandles
                arena={selectedArena}
                toPaper={toPaper}
                zoom={viewport.zoom}
                editingVertices={editingVertices}
                onVertexDown={(e, i) => gestures.beginVertexDrag(e, selectedArena.id, i)}
                onCornerDown={(e, c) => gestures.beginResize(e, selectedArena.id, c)}
                onEdgeDoubleClick={(i) =>
                  useDocumentStore
                    .getState()
                    .apply('Inserir vértice', (d) => {
                      insertArenaVertex(d, selectedArena.id, i);
                    })
                }
              />
            )}
            {selectedPath && (
              <PathHandles
                path={selectedPath}
                toPaper={toPaper}
                zoom={viewport.zoom}
                activeNode={activeNode}
                onNodeDown={(e, i) => gestures.beginPathNodeDrag(e, selectedPath.id, i)}
                onHandleDown={(e, i, which) =>
                  gestures.beginPathHandleDrag(e, selectedPath.id, i, which, selectedPath.nodes[i]!.pos)
                }
                onLegDown={(e, leg) => gestures.beginLegBend(e, selectedPath.id, leg)}
                onLegDoubleClick={(legIndex, at) =>
                  useDocumentStore.getState().apply('Inserir nó', (d) => {
                    insertNode(d, selectedPath.id, legIndex, at);
                  })
                }
              />
            )}
            {pathDraft && (
              <PathDraft
                nodes={pathDraft.nodes}
                cursor={pathDraft.cursor}
                toPaper={toPaper}
                zoom={viewport.zoom}
              />
            )}
            {calibration && (
              <CalibrationOverlay
                pointA={calibration.pointA}
                pointB={calibration.pointB}
                cursor={cursorM}
                toPaper={toPaper}
                zoom={viewport.zoom}
              />
            )}
            {draft && (
              <ArenaDraft
                points={draft.points}
                cursor={draft.cursor}
                toPaper={toPaper}
                zoom={viewport.zoom}
              />
            )}
          </SelectionOverlay>
        </svg>
      </div>

      {/* As réguas marcam 0 no canto superior esquerdo da pista (decisão 60). */}
      <Rulers
        viewport={viewport}
        size={size}
        printScale={doc.page.printScale}
        originMm={{
          x: doc.originMm.x + medida.originM.x * mmPerMeter(doc.page.printScale),
          y: doc.originMm.y + medida.originM.y * mmPerMeter(doc.page.printScale),
        }}
        metersPerPixel={mpp}
        cursorM={cursorM && { x: cursorM.x - medida.originM.x, y: cursorM.y - medida.originM.y }}
      />
    </div>
  );
}

