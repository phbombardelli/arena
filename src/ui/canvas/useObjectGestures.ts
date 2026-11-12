import { useCallback, useRef, useState } from 'react';
import { angleOf, normalizeAngle, type Vec2 } from '@core/geometry/vec';
import { snapAngle, toMillimeterPrecision } from '@core/geometry/snap';
import { moveObjects, rotateObjects } from '@core/commands/ops';
import { withLinked } from '@core/commands/groupOps';
import { moveArenaVertex, resizeArenaByCorner } from '@core/commands/arenaOps';
import { bendLeg, legHalfPoint, moveHandle, moveNode } from '@core/commands/pathOps';
import {
  boundsIn,
  boundsCenter,
  boundsContains,
  objectScope,
  scaleBounds,
  scaleInDoc,
  scaleMode,
  unionBounds,
} from '@core/model/transform';
import { deepClone } from '@core/model/clone';
import type { ObjectId, SceneObject } from '@core/model/types';
import { DESENHO_ID, desenhoNaFolhaMm } from '@core/model/document';
import { isPaperAnchored } from '@core/model/transform';
import { STANDARD_SCALES } from '@core/scale/units';
import { useDocumentStore } from '@store/documentStore';
import { useEditorStore } from '@store/editorStore';

export interface Marquee {
  from: Vec2;
  to: Vec2;
}

type Gesture =
  | { kind: 'drag'; anchorId: ObjectId; startM: Vec2; applied: Vec2; soEste: ObjectId[] | null }
  | { kind: 'rotate'; pivot: Vec2; startAngle: number; applied: number }
  | { kind: 'marquee'; startM: Vec2 }
  | { kind: 'vertex'; arenaId: ObjectId; index: number }
  | { kind: 'resize'; arenaId: ObjectId; corner: 0 | 1 | 2 | 3 }
  | {
      kind: 'scale';
      id: ObjectId;
      /** Como estava ao começar: cada passo escala a partir dele, sem acumular erro. */
      original: SceneObject;
      ancora: Vec2;
      startM: Vec2;
      span: Vec2;
      uniform: boolean;
    }
  | { kind: 'path-node'; pathId: ObjectId; index: number }
  | { kind: 'path-handle'; pathId: ObjectId; index: number; which: 'in' | 'out'; origin: Vec2 }
  | { kind: 'path-bend'; pathId: ObjectId; leg: number; startM: Vec2; half: Vec2 }
  /** Aba Impressão (B-105): o desenho inteiro andando na folha. */
  | { kind: 'bloco'; startPaper: Vec2; originStart: Vec2 }
  /** Aba Impressão: o canto do desenho muda a escala, de escala padrão em escala padrão. */
  | { kind: 'bloco-escala'; ancoraPaper: Vec2; ancoraM: Vec2; startPaper: Vec2; span: Vec2; escalaStart: number };

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

      if (current.kind === 'bloco') {
        const agora = noPapel(store.doc, p);
        const origem = {
          x: Math.round((current.originStart.x + agora.x - current.startPaper.x) * 10) / 10,
          y: Math.round((current.originStart.y + agora.y - current.startPaper.y) * 10) / 10,
        };
        const o = store.doc.originMm;
        if (o.x === origem.x && o.y === origem.y) return;
        store.apply('Mover a pista na folha', (doc) => {
          doc.originMm = origem;
        }, 'gesto-bloco');
        if (!useEditorStore.getState().dragging) useEditorStore.getState().setDragging(true);
        return;
      }

      if (current.kind === 'bloco-escala') {
        const agora = noPapel(store.doc, p);
        const { ancoraPaper, span } = current;
        // Quanto o canto se afastou do oposto, pelo lado mais comprido.
        const r =
          Math.abs(span.x) >= Math.abs(span.y)
            ? (agora.x - ancoraPaper.x) / span.x
            : (agora.y - ancoraPaper.y) / span.y;
        if (!(r > 0.05)) return;
        const escala = escalaPadraoPerto(current.escalaStart / r);
        if (escala === store.doc.page.printScale) return;
        store.apply('Escala da folha', (doc) => {
          doc.page.printScale = escala;
          // O canto oposto fica onde estava.
          const k = 1000 / escala;
          doc.originMm = { x: ancoraPaper.x - current.ancoraM.x * k, y: ancoraPaper.y - current.ancoraM.y * k };
        }, 'gesto-bloco-escala');
        return;
      }

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

      if (current.kind === 'scale') {
        const { id, original, ancora, startM, span, uniform } = current;
        const fator = (v: number, d: number) => (Math.abs(v) < 1e-9 ? 1 : Math.max(0.05, (v + d) / v));
        let sx = fator(span.x, p.x - startM.x);
        let sy = fator(span.y, p.y - startM.y);
        if (uniform) sx = sy = Math.abs(span.x) >= Math.abs(span.y) ? sx : sy;
        store.apply(
          'Redimensionar',
          (doc) => {
            const i = doc.objects.findIndex((o) => o.id === id);
            if (i < 0) return;
            const copia = deepClone(original);
            scaleInDoc(doc, copia, ancora, sx, sy);
            doc.objects[i] = copia;
          },
          'gesto-escala',
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
        if (!useEditorStore.getState().dragging) useEditorStore.getState().setDragging(true);
        return;
      }

      const angle = angleOf({ x: p.x - current.pivot.x, y: p.y - current.pivot.y });
      let delta = normalizeAngle(angle - current.startAngle);
      if (delta > 180) delta -= 360;
      if (shift) delta = snapAngle(delta, store.doc.grid.angleSnapDeg);
      const step = delta - current.applied;
      if (Math.abs(step) < 1e-6) return;
      store.apply('Girar', (doc) => rotateObjects(doc, selection, step), 'gesto-girar');
      if (!useEditorStore.getState().dragging) useEditorStore.getState().setDragging(true);
      current.applied = delta;
    },
    [updateMarquee],
  );

  /* ------------------------------------------------------------ início */

  const beginDrag = useCallback(
    (e: React.PointerEvent, id: ObjectId) => {
      const editor = useEditorStore.getState();
      const { doc } = useDocumentStore.getState();
      // Vinculados vêm juntos; Alt + clique pega só este (decisão 61).
      const alvo = e.altKey ? [id] : withLinked(doc, [id]);
      const already = editor.selection.includes(id);
      const selection = e.shiftKey
        ? already
          ? editor.selection.filter((x) => !alvo.includes(x))
          : [...editor.selection, ...alvo.filter((x) => !editor.selection.includes(x))]
        : already
          ? editor.selection
          : alvo;
      editor.setSelection(selection);
      if (selection.length === 0) return;

      gesture.current = {
        kind: 'drag',
        anchorId: id,
        startM: toModel(e),
        applied: { x: 0, y: 0 },
        // Clique sem arrastar numa peça de uma seleção maior: ao soltar,
        // fica só ela (e os vinculados a ela). Sem isso, depois de
        // desvincular o cenário, nenhuma peça se deixava editar (B-55).
        soEste: !e.shiftKey && already && selection.length > alvo.length ? alvo : null,
      };
      capture(e.target as Element, e.pointerId);
    },
    [toModel],
  );

  /** Aba Impressão: pega o desenho inteiro para levar a outro ponto da folha. */
  const beginBloco = useCallback(
    (e: React.PointerEvent) => {
      const { doc } = useDocumentStore.getState();
      useEditorStore.getState().setSelection([DESENHO_ID]);
      gesture.current = {
        kind: 'bloco',
        startPaper: noPapel(doc, toModel(e)),
        originStart: { ...doc.originMm },
      };
      capture(e.target as Element, e.pointerId);
    },
    [toModel],
  );

  /** Aba Impressão: canto do bloco do desenho, a partir do canto oposto. */
  const beginBlocoEscala = useCallback(
    (e: React.PointerEvent, corner: 0 | 1 | 2 | 3) => {
      const { doc } = useDocumentStore.getState();
      const r = desenhoNaFolhaMm(doc);
      if (!r) return;
      e.stopPropagation();
      const cantos: Vec2[] = [
        { x: r.xMm, y: r.yMm },
        { x: r.xMm + r.widthMm, y: r.yMm },
        { x: r.xMm + r.widthMm, y: r.yMm + r.heightMm },
        { x: r.xMm, y: r.yMm + r.heightMm },
      ];
      const pego = cantos[corner]!;
      const ancora = cantos[(corner + 2) % 4]!;
      const k = 1000 / doc.page.printScale;
      gesture.current = {
        kind: 'bloco-escala',
        ancoraPaper: ancora,
        ancoraM: { x: (ancora.x - doc.originMm.x) / k, y: (ancora.y - doc.originMm.y) / k },
        startPaper: pego,
        span: { x: pego.x - ancora.x, y: pego.y - ancora.y },
        escalaStart: doc.page.printScale,
      };
      capture(e.target as Element, e.pointerId);
    },
    [],
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

  /** Canto da caixa de seleção: estica o objeto a partir do canto oposto. */
  const beginScale = useCallback(
    (e: React.PointerEvent, id: ObjectId, corner: 0 | 1 | 2 | 3) => {
      const { doc } = useDocumentStore.getState();
      const obj = doc.objects.find((o) => o.id === id);
      const modo = obj ? scaleMode(obj) : null;
      if (!obj || !modo) return;
      e.stopPropagation();
      const b = scaleBounds(doc, obj);
      const cantos: Vec2[] = [b.min, { x: b.max.x, y: b.min.y }, b.max, { x: b.min.x, y: b.max.y }];
      const pego = cantos[corner]!;
      const ancora = cantos[(corner + 2) % 4]!;
      gesture.current = {
        kind: 'scale',
        id,
        original: deepClone(obj),
        ancora,
        startM: toModel(e),
        span: { x: pego.x - ancora.x, y: pego.y - ancora.y },
        uniform: modo === 'proporcional',
      };
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
    // Dois arrastos seguidos são dois passos de desfazer, não um.
    useDocumentStore.getState().sealHistory();
    if (useEditorStore.getState().dragging) useEditorStore.getState().setDragging(false);

    if (g.kind === 'drag' && g.soEste && Math.abs(g.applied.x) < 1e-9 && Math.abs(g.applied.y) < 1e-9) {
      useEditorStore.getState().setSelection(g.soEste);
      return true;
    }

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
      // Na Impressão o retângulo pega só o que é da folha; nas outras abas, nunca.
      const doModo = (o: SceneObject) =>
        modo === 'impressao' ? isPaperAnchored(o) : !isPaperAnchored(o) && objectScope(o) === modo;
      const hits = tiny
        ? []
        : doc.objects
            .filter((o) => !o.locked && o.visible && doModo(o))
            .filter((o) => boundsContains(region, boundsIn(doc, o)))
            .map((o) => o.id);
      useEditorStore.getState().setSelection(withLinked(doc, hits));
      return true;
    }
    return g !== null;
  }, [applyPending, updateMarquee]);

  return {
    beginDrag,
    beginBloco,
    beginBlocoEscala,
    beginRotate,
    beginMarquee,
    beginVertexDrag,
    beginResize,
    beginScale,
    beginPathNodeDrag,
    beginPathHandleDrag,
    beginLegBend,
    onPointerMove,
    onPointerUp,
    marquee,
  };
}

/** Ponto do modelo (metros) em mm de papel, com a origem de agora. */
function noPapel(doc: { originMm: Vec2; page: { printScale: number } }, p: Vec2): Vec2 {
  const k = 1000 / doc.page.printScale;
  return { x: doc.originMm.x + p.x * k, y: doc.originMm.y + p.y * k };
}

/** A escala padrão mais perto (na proporção, não na diferença). */
function escalaPadraoPerto(exata: number): number {
  let melhor = STANDARD_SCALES[0]!;
  for (const s of STANDARD_SCALES) if (Math.abs(Math.log(s / exata)) < Math.abs(Math.log(melhor / exata))) melhor = s;
  return melhor;
}
