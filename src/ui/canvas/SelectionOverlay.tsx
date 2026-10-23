import type { Vec2 } from '@core/geometry/vec';
import { boundsIn, unionBounds } from '@core/model/transform';
import type { CourseDocument, ObjectId } from '@core/model/types';
import { mmPerMeter } from '@core/scale/units';
import { color } from '@render/style/tokens';
import type { Marquee } from './useObjectGestures';

interface Props {
  doc: CourseDocument;
  selection: ObjectId[];
  /** Pixels por milímetro: mantém alças e traços com tamanho fixo na tela. */
  zoom: number;
  marquee: Marquee | null;
  onRotateHandleDown: (e: React.PointerEvent) => void;
  /** Some quando nada na seleção tem rotação própria (o caso da pista). */
  showRotate: boolean;
  /** Seleção que se redimensiona: os cantos viram alças (decisão 80). */
  onCornerDown?: (e: React.PointerEvent, corner: 0 | 1 | 2 | 3) => void;
  children?: React.ReactNode;
}

const HANDLE_PX = 7;
const ROTATE_GAP_PX = 22;

/**
 * Alças e realces de seleção. Fica FORA do grupo exportável: nada daqui
 * pode aparecer no PDF (docs/DECISOES.md, decisão 6).
 */
export function SelectionOverlay({
  doc,
  selection,
  zoom,
  marquee,
  onRotateHandleDown,
  showRotate,
  onCornerDown,
  children,
}: Props) {
  const k = mmPerMeter(doc.page.printScale);
  const toPaper = (p: Vec2): Vec2 => ({
    x: doc.originMm.x + p.x * k,
    y: doc.originMm.y + p.y * k,
  });
  const mm = (px: number) => px / zoom;

  const objs = doc.objects.filter((o) => selection.includes(o.id));
  const bounds = unionBounds(objs.map((o) => boundsIn(doc, o)));

  return (
    <g data-layer="overlay" pointerEvents="none">
      {objs.length > 1 &&
        objs.map((o) => {
          const b = boundsIn(doc, o);
          const min = toPaper(b.min);
          const max = toPaper(b.max);
          return (
            <rect
              key={o.id}
              x={min.x}
              y={min.y}
              width={max.x - min.x}
              height={max.y - min.y}
              fill="none"
              stroke={color.selection}
              strokeWidth={mm(0.8)}
              strokeDasharray={`${mm(2)} ${mm(2)}`}
              opacity={0.6}
            />
          );
        })}

      {bounds && (
        <SelectionFrame
          min={toPaper(bounds.min)}
          max={toPaper(bounds.max)}
          mm={mm}
          showRotate={showRotate}
          onRotateHandleDown={onRotateHandleDown}
          onCornerDown={onCornerDown}
        />
      )}

      {children}

      {marquee && (
        <rect
          x={Math.min(toPaper(marquee.from).x, toPaper(marquee.to).x)}
          y={Math.min(toPaper(marquee.from).y, toPaper(marquee.to).y)}
          width={Math.abs(toPaper(marquee.to).x - toPaper(marquee.from).x)}
          height={Math.abs(toPaper(marquee.to).y - toPaper(marquee.from).y)}
          fill={color.selectionFill}
          stroke={color.selection}
          strokeWidth={mm(1)}
          strokeDasharray={`${mm(4)} ${mm(3)}`}
        />
      )}
    </g>
  );
}

function SelectionFrame({
  min,
  max,
  mm,
  showRotate,
  onRotateHandleDown,
  onCornerDown,
}: {
  min: Vec2;
  max: Vec2;
  mm: (px: number) => number;
  showRotate: boolean;
  onRotateHandleDown: (e: React.PointerEvent) => void;
  onCornerDown?: (e: React.PointerEvent, corner: 0 | 1 | 2 | 3) => void;
}) {
  const pad = mm(3);
  const x = min.x - pad;
  const y = min.y - pad;
  const w = max.x - min.x + pad * 2;
  const h = max.y - min.y + pad * 2;
  const half = mm(HANDLE_PX) / 2;
  const corners: Vec2[] = [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ];
  const rotateAt = { x: x + w / 2, y: y - mm(ROTATE_GAP_PX) };

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        fill="none"
        stroke={color.selection}
        strokeWidth={mm(1.2)}
      />
      {corners.map((c, i) => (
        <rect
          key={i}
          x={c.x - half}
          y={c.y - half}
          width={half * 2}
          height={half * 2}
          fill="#ffffff"
          stroke={color.selection}
          strokeWidth={mm(1)}
          pointerEvents={onCornerDown ? 'all' : undefined}
          style={onCornerDown ? { cursor: i === 0 || i === 2 ? 'nwse-resize' : 'nesw-resize' } : undefined}
          onPointerDown={onCornerDown ? (e) => onCornerDown(e, i as 0 | 1 | 2 | 3) : undefined}
        />
      ))}
      {showRotate && (
        <>
          <line
            x1={x + w / 2}
            y1={y}
            x2={rotateAt.x}
            y2={rotateAt.y}
            stroke={color.selection}
            strokeWidth={mm(1)}
          />
          <circle
            cx={rotateAt.x}
            cy={rotateAt.y}
            r={mm(HANDLE_PX) / 1.6}
            fill="#ffffff"
            stroke={color.selection}
            strokeWidth={mm(1.2)}
            pointerEvents="all"
            style={{ cursor: 'grab' }}
            onPointerDown={onRotateHandleDown}
          />
        </>
      )}
    </g>
  );
}
