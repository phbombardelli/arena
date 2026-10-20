import type { Vec2 } from '@core/geometry/vec';
import { arenaExtent, arenaPoints } from '@core/model/arena';
import { polygonPathD } from '@core/geometry/outline';
import { hatchSegments, longestEdgeAngle, polygonCentroid } from '@core/geometry/hatch';
import { structureDef } from '@core/library/structures';
import { mmPerMeter } from '@core/scale/units';
import type { Arena } from '@core/model/types';
import { color, font, stroke, text } from '@render/style/tokens';

interface Props {
  arena: Arena;
  printScale: number;
  originMm: Vec2;
  selected: boolean;
  onPointerDown?: (e: React.PointerEvent) => void;
}

const TICK_MM = 1.3;
const TICK_MAJOR_MM = 2.2;
const LABEL_GAP_MM = 1.2;

/** Largura da faixa de clique de uma linha, em pixels de tela. */
export const HIT_BAND_PX = 16;

export function ArenaLayer({ arena, printScale, originMm, selected, onPointerDown }: Props) {
  if (!arena.visible) return null;
  const k = mmPerMeter(printScale);
  const toPaper = (p: Vec2): Vec2 => ({ x: originMm.x + p.x * k, y: originMm.y + p.y * k });

  const d = polygonPathD(
    arenaPoints(arena),
    arena.corner.style,
    arena.corner.radiusM * k,
    toPaper,
  );

  return (
    <g data-object={arena.id} data-kind="arena">
      <path
        d={d}
        fill={arena.style.fill}
        stroke={selected ? color.selection : arena.style.stroke}
        strokeWidth={arena.style.strokeMm}
        strokeLinejoin="round"
        onPointerDown={onPointerDown}
        style={{ cursor: 'pointer' }}
      />
      {/* Faixa invisível ao longo do contorno, de largura fixa na TELA: a
          linha de 0,5 mm vira um fio em escala grande e ninguém acerta. */}
      {onPointerDown && (
        <path
          d={d}
          fill="none"
          stroke="transparent"
          strokeWidth={HIT_BAND_PX}
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="round"
          onPointerDown={onPointerDown}
          style={{ cursor: 'pointer' }}
        />
      )}
      {arena.structure ? (
        <StructureDetails arena={arena} toPaper={toPaper} />
      ) : (
        arena.perimeterRuler.visible && <PerimeterRuler arena={arena} k={k} toPaper={toPaper} />
      )}
    </g>
  );
}

/**
 * O miolo de uma construção: degraus ou hachura e o rótulo (decisão 54).
 * As linhas saem já recortadas no contorno — nada de <pattern> nem de
 * recorte, que o PDF não garante.
 */
function StructureDetails({ arena, toPaper }: { arena: Arena; toPaper: (p: Vec2) => Vec2 }) {
  const info = arena.structure!;
  const def = structureDef(info.type);
  const pts = arenaPoints(arena);
  const aresta = longestEdgeAngle(pts);
  const linhas = def.hatch
    ? hatchSegments(pts, def.hatch.angle === 'aresta' ? aresta : def.hatch.angle, def.hatch.spacingM)
    : [];
  const centro = toPaper(polygonCentroid(pts));
  // O rótulo acompanha a aresta longa, mas nunca de cabeça para baixo.
  let giro = ((aresta % 180) + 180) % 180;
  if (giro > 90) giro -= 180;

  return (
    <g data-part="structure" pointerEvents="none">
      {linhas.map(([a, b], i) => {
        const pa = toPaper(a);
        const pb = toPaper(b);
        return (
          <line key={i} x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y} stroke={def.hatch!.color} strokeWidth={stroke.hairline} />
        );
      })}
      {info.label.trim() !== '' && (
        <text
          x={centro.x}
          y={centro.y}
          transform={giro !== 0 ? `rotate(${giro} ${centro.x} ${centro.y})` : undefined}
          fontFamily={font.family}
          fontSize={text.regular}
          fontWeight="bold"
          fill={color.ink}
          textAnchor="middle"
          dominantBaseline="middle"
        >
          {info.label}
        </text>
      )}
    </g>
  );
}

/**
 * Régua de metros impressa no perímetro da pista, como nos croquis FEI.
 * Faz parte do desenho (vai para o PDF), diferente da régua da interface.
 */
function PerimeterRuler({
  arena,
  k,
  toPaper,
}: {
  arena: Arena;
  k: number;
  toPaper: (p: Vec2) => Vec2;
}) {
  const { stepM, labelEveryM, sides } = arena.perimeterRuler;
  if (!(stepM > 0)) return null;

  // Pela caixa envolvente: num contorno irregular, a régua continua sendo
  // uma referência retilínea, como nos croquis impressos.
  const extent = arenaExtent(arena);
  const x0 = extent.origin.x;
  const y0 = extent.origin.y;
  const x1 = x0 + extent.widthM;
  const y1 = y0 + extent.heightM;

  const ticks: JSX.Element[] = [];
  const isLabel = (m: number) => labelEveryM > 0 && Math.abs(m % labelEveryM) < stepM / 1000;

  const push = (
    key: string,
    from: Vec2,
    to: Vec2,
    label: string | null,
    labelAt: Vec2,
    anchor: 'middle' | 'start' | 'end',
    baseline: 'auto' | 'hanging' | 'middle',
  ) => {
    const a = toPaper(from);
    const b = toPaper(to);
    ticks.push(
      <g key={key}>
        <line
          x1={a.x}
          y1={a.y}
          x2={b.x}
          y2={b.y}
          stroke={color.arenaLine}
          strokeWidth={stroke.hairline}
        />
        {label != null && (
          <text
            x={toPaper(labelAt).x}
            y={toPaper(labelAt).y}
            fontFamily={font.family}
            fontSize={text.tiny}
            fill={color.ink}
            textAnchor={anchor}
            dominantBaseline={baseline}
          >
            {label}
          </text>
        )}
      </g>,
    );
  };

  const tickM = TICK_MM / k;
  const tickMajorM = TICK_MAJOR_MM / k;
  const gapM = LABEL_GAP_MM / k;

  for (let m = 0; m <= extent.widthM + 1e-9; m += stepM) {
    const major = isLabel(m);
    const len = major ? tickMajorM : tickM;
    const x = x0 + m;
    const label = major && m > 0 && m < extent.widthM ? String(Math.round(m)) : null;
    if (sides.top) {
      push(`t${m}`, { x, y: y0 }, { x, y: y0 - len }, label, { x, y: y0 - len - gapM }, 'middle', 'auto');
    }
    if (sides.bottom) {
      push(`b${m}`, { x, y: y1 }, { x, y: y1 + len }, label, { x, y: y1 + len + gapM }, 'middle', 'hanging');
    }
  }

  for (let m = 0; m <= extent.heightM + 1e-9; m += stepM) {
    const major = isLabel(m);
    const len = major ? tickMajorM : tickM;
    const y = y0 + m;
    const label = major && m > 0 && m < extent.heightM ? String(Math.round(m)) : null;
    if (sides.left) {
      push(`l${m}`, { x: x0, y }, { x: x0 - len, y }, label, { x: x0 - len - gapM, y }, 'end', 'middle');
    }
    if (sides.right) {
      push(`r${m}`, { x: x1, y }, { x: x1 + len, y }, label, { x: x1 + len + gapM, y }, 'start', 'middle');
    }
  }

  return <g data-part="perimeter-ruler" pointerEvents="none">{ticks}</g>;
}
