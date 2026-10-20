import { useCallback, useRef, useState } from 'react';
import { angleOf, normalizeAngle, type Vec2 } from '@core/geometry/vec';
import { snapAngle, toMillimeterPrecision } from '@core/geometry/snap';
import { moveObjects, rotateObjects } from '@core/commands/ops';
import { moveArenaVertex, resizeArenaByCorner } from '@core/commands/arenaOps';
import { bendLeg, legHalfPoint, moveHandle, moveNode } from '@core/commands/pathOps';
import {
  boundsIn,
  boundsCenter,
  boundsContains,
  objectScope,
  unionBounds,
} from '@core/model/transform';
import type { ObjectId } from '@core/model/types';
import { useDocumentStore } from '@store/documentStore';
import { useEditorStore } from '@store/editorStore';

export interface Marquee {
  from: Vec2;
  to: Vec2;
}

type Gesture =
  | { kind: 'drag'; anchorId: ObjectId; startM: Vec2; applied: Vec2 }
  | { kind: 'rotate'; pivot: Vec2; startAngle: number; applied: number }
  | { kind: 'marquee'; startM: Vec2 }
  | { kind: 'vertex'; arenaId: ObjectId; index: number }
  | { kind: 'resize'; arenaId: ObjectId; corner: 0 | 1 | 2 | 3 }
  | { kind: 'path-node'; pathId: ObjectId; index: number }
  | { kind: 'path-handle'; pathId: ObjectId; index: number; which: 'in' | 'out'; origin: Vec2 }
  | { kind: 'path-bend'; pathId: ObjectId; leg: number; startM: Vec2; half: Vec2 };

/**
 * Gestos sobre objetos: arrastar, girar e seleção por retângulo.
 *
 * Um gesto inteiro vira UMA entrada de desfazer, via `mergeKey`. As
 * atualizações são limitadas a um quadro (`requestAnimationFrame`) para o
 * arrasto não disparar um render por evento de ponteiro.
 */
export function useObjectGestures(toModel: (e: { clientX: number; clientY: number }) => Vec2) {
  const gesture = useRef<Gesture | null>(null);
  const frame = useRef<number | null>(null);
  const pending = useRef<Vec2 | null>(null);
  const shiftHeld = useRef(false);
  const [marquee, setMarquee] = useState<Marquee | null>(null);
  /** Espelho do retângulo de seleção: o `pointerup` precisa do valor já. */
  const marqueeRef = useRef<Marquee | null>(null);

  const updateMarquee = useCallback((box: Marquee | null) => {
    marqueeRef.current = box;
    setMarquee(box);
  }, []);

  /**
   * A captura de ponteiro pode falhar (ponteiro já liberado, ou evento
   * sintético). Nunca pode derrubar o gesto: o estado é registrado antes,
   * e a falha só custa o arrasto continuar fora do elemento.
   */
  const capture = (el: Element | null, pointerId: number) => {
    try {
      el?.setPointerCapture?.(pointerId);
    } catch {
      /* segue sem captura */
    }
  };

  const cancelFrame = () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
  };

  /**
   * Aplica a última posição recebida. Chamada tanto pelo quadro de
   * animação quanto pelo `pointerup` — sem o flush no fim do gesto, o
   * último movimento se perderia se o quadro não chegasse a rodar
   * (aba em segundo plano, por exemplo).
   */
  const applyPending = useCallback(
    (shift: boolean) => {
      const p = pending.current;
      const current = gesture.current;
      if (!p || !current) return;

      if (current.kind === 'marquee') {
        updateMarquee({ from: current.startM, to: p });
        return;
      }

      const store = useDocumentStore.getState();
      const { selection } = useEditorStore.getState();

      // Vértice e alça de canto arrastam para uma posição absoluta, e não
      // por deslocamento.
      if (current.kind === 'path-node') {
        const { pathId, index } = current;
        store.apply('Mover nó', (doc) => moveNode(doc, pathId, index, p), 'gesto-no');
        return;
      }

      if (current.kind === 'path-bend') {
        // Sem arrastar, nada muda: o duplo clique no mesmo marcador insere nó.
        if (Math.hypot(p.x - current.startM.x, p.y - current.startM.y) < 1e-6) return;
        const { pathId, leg, half, startM } = current;
        const alvo = { x: half.x + p.x - startM.x, y: half.y + p.y - startM.y };
        store.apply('Curvar trecho', (doc) => bendLeg(doc, pathId, leg, alvo), 'gesto-curvar');
        return;
      }

      if (current.kind === 'path-handle') {
        const { pathId, index, which, origin } = current;
        const rel = { x: p.x - origin.x, y: p.y - origin.y };
        store.apply(
          'Curvar traçado',
          (doc) => moveHandle(doc, pathId, index, which, rel),
          'gesto-alca',
        );
        return;
      }

      if (current.kind === 'vertex' || current.kind === 'resize') {
        const target = p;
        const { arenaId } = current;
        store.apply(
          current.kind === 'vertex' ? 'Mover vértice' : 'Redimensionar pista',
          (doc) =>
            current.kind === 'vertex'
              ? moveArenaVertex(doc, arenaId, current.index, target)
              : resizeArenaByCorner(doc, arenaId, current.corner, target),
          `gesto-${current.kind}`,
        );
        return;
      }

      if (current.kind === 'drag') {
        const total = { x: p.x - current.startM.x, y: p.y - current.startM.y };
        const before = current.applied;
        if (Math.abs(total.x - before.x) < 1e-9 && Math.abs(total.y - before.y) < 1e-9) return;
        store.apply(
          'Mover',
          (doc) =>
            moveObjects(doc, selection, {
              x: toMillimeterPrecision(total.x - before.x),
              y: toMillimeterPrecision(total.y - before.y),
            }),
          'gesto-mover',
        );
        current.applied = total;
        return;
      }

      const angle = angleOf({ x: p.x - current.pivot.x, y: p.y - current.pivot.y });
      let delta = normalizeAngle(angle - current.startAngle);
      if (delta > 180) delta -= 360;
      if (shift) delta = snapAngle(delta, store.doc.grid.angleSnapDeg);
      const step = delta - current.applied;
      if (Math.abs(step) < 1e-6) return;
      store.apply('Girar', (doc) => rotateObjects(doc, selection, step), 'gesto-girar');
      current.applied = delta;
    },
    [updateMarquee],
  );

  /* ------------------------------------------------------------ início */

  const beginDrag = useCallback(
    (e: React.PointerEvent, id: ObjectId) => {
      const editor = useEditorStore.getState();
      const already = editor.selection.includes(id);
      const selection = e.shiftKey
        ? already
          ? editor.selection.filter((x) => x !== id)
          : [...editor.selection, id]
        : already
          ? editor.selection
          : [id];
      editor.setSelection(selection);
      if (selection.length === 0) return;

      gesture.current = {
        kind: 'drag',
        anchorId: id,
        startM: toModel(e),
        applied: { x: 0, y: 0 },
      };
      capture(e.target as Element, e.pointerId);
    },
    [toModel],
  );

  const beginRotate = useCallback(
    (e: React.PointerEvent) => {
      const { selection } = useEditorStore.getState();
      const { doc } = useDocumentStore.getState();
      const objs = doc.objects.filter((o) => selection.includes(o.id));
      const bounds = unionBounds(objs.map((o) => boundsIn(doc, o)));
      if (!bounds) return;
      const pivot = boundsCenter(bounds);
      const p = toModel(e);
      gesture.current = {
        kind: 'rotate',
        pivot,
        startAngle: angleOf({ x: p.x - pivot.x, y: p.y - pivot.y }),
        applied: 0,
      };
      capture(e.target as Element, e.pointerId);
    },
    [toModel],
  );

  const beginVertexDrag = useCallback(
    (e: React.PointerEvent, arenaId: ObjectId, index: number) => {
      gesture.current = { kind: 'vertex', arenaId, index };
      pending.current = toModel(e);
      capture(e.target as Element, e.pointerId);
    },
    [toModel],
  );

  const beginResize = useCallback(
    (e: React.PointerEvent, arenaId: ObjectId, corner: 0 | 1 | 2 | 3) => {
      gesture.current = { kind: 'resize', arenaId, corner };
      pending.current = toModel(e);
      capture(e.target as Element, e.pointerId);
    },
    [toModel],
  );

  const beginPathNodeDrag = useCallback(
    (e: React.PointerEvent, pathId: ObjectId, index: number) => {
      gesture.current = { kind: 'path-node', pathId, index };
      pending.current = toModel(e);
      useEditorStore.getState().setActiveNode(index);
      capture(e.target as Element, e.pointerId);
    },
    [toModel],
  );

  const beginPathHandleDrag = useCallback(
    (e: React.PointerEvent, pathId: ObjectId, index: number, which: 'in' | 'out', origin: Vec2) => {
      gesture.current = { kind: 'path-handle', pathId, index, which, origin };
      pending.current = toModel(e);
      capture(e.target as Element, e.pointerId);
    },
    [toModel],
  );

  /** Arrastar o meio de um trecho curva o trecho (B-28). */
  const beginLegBend = useCallback(
    (e: React.PointerEvent, pathId: ObjectId, leg: number) => {
      const path = useDocumentStore.getState().doc.objects.find((o) => o.id === pathId);
      if (path?.kind !== 'path') return;
      const half = legHalfPoint(path, leg);
      if (!half) return;
      const start = toModel(e);
      gesture.current = { kind: 'path-bend', pathId, leg, startM: start, half };
      pending.current = start;
      capture(e.target as Element, e.pointerId);
    },
    [toModel],
  );

  const beginMarquee = useCallback(
    (e: React.PointerEvent) => {
      const start = toModel(e);
      gesture.current = { kind: 'marquee', startM: start };
      updateMarquee({ from: start, to: start });
      capture(e.currentTarget as Element, e.pointerId);
    },
    [toModel, updateMarquee],
  );

  /* ---------------------------------------------------------- movimento */

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const g = gesture.current;
      if (!g) return false;
      pending.current = toModel(e);
      shiftHeld.current = e.shiftKey;

      if (frame.current !== null) return true;
      frame.current = requestAnimationFrame(() => {
        frame.current = null;
        applyPending(shiftHeld.current);
      });
      return true;
    },
    [toModel, applyPending],
  );

  /* -------------------------------------------------------------- fim */

  const onPointerUp = useCallback(() => {
    const g = gesture.current;
    if (!g) return false;
    cancelFrame();
    applyPending(shiftHeld.current);
    pending.current = null;
    gesture.current = null;

    if (g.kind === 'marquee') {
      const box = marqueeRef.current;
      updateMarquee(null);
      if (!box) return true;
      const { doc } = useDocumentStore.getState();
      const region = {
        min: { x: Math.min(box.from.x, box.to.x), y: Math.min(box.from.y, box.to.y) },
        max: { x: Math.max(box.from.x, box.to.x), y: Math.max(box.from.y, box.to.y) },
      };
      // Um clique sem arrasto não é um retângulo: apenas limpa a seleção.
      const tiny =
        region.max.x - region.min.x < 0.05 && region.max.y - region.min.y < 0.05;
      const modo = useEditorStore.getState().mode;
      const hits = tiny
        ? []
        : doc.objects
            .filter((o) => !o.locked && o.visible && objectScope(o) === modo)
            .filter((o) => boundsContains(region, boundsIn(doc, o)))
            .map((o) => o.id);
      useEditorStore.getState().setSelection(hits);
      return true;
    }
    return g !== null;
  }, [applyPending, updateMarquee]);

  return {
    beginDrag,
    beginRotate,
    beginMarquee,
    beginVertexDrag,
    beginResize,
    beginPathNodeDrag,
    beginPathHandleDrag,
    beginLegBend,
    onPointerMove,
    onPointerUp,
    marquee,
  };
}
