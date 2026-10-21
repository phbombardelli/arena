import type { Vec2 } from '@core/geometry/vec';
import { arenaExtent, arenaPoints } from '@core/model/arena';
import { outlinePolygon, polygonPathD } from '@core/geometry/outline';
import { hatchSegments, insideIntervals, longestEdgeAngle, polygonCentroid } from '@core/geometry/hatch';
import { STRUCTURE_LABEL_MM, structureDef, structureLabelAngle } from '@core/library/structures';
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

// Mais curtos que antes (decisão 70): o número fica a ~3,5 mm da cerca.
const TICK_MM = 1.0;
const TICK_MAJOR_MM = 1.6;
const LABEL_GAP_MM = 0.5;

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
      {/* A régua do perímetro é desenhada à parte, por cima das construções. */}
      {arena.structure && <StructureDetails arena={arena} toPaper={toPaper} />}
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
  const vertices = arenaPoints(arena);
  const aresta = longestEdgeAngle(vertices);
  // Hachura e rótulo recortam no contorno de verdade, com o canto redondo.
  const pts = outlinePolygon(vertices, arena.corner.style, arena.corner.radiusM);
  const linhas = def.hatch
    ? hatchSegments(pts, def.hatch.angle === 'aresta' ? aresta : def.hatch.angle, def.hatch.spacingM)
    : [];
  const meio = polygonCentroid(pts);
  const desloc = info.labelOffsetM ?? { x: 0, y: 0 };
  const centro = toPaper({ x: meio.x + desloc.x, y: meio.y + desloc.y });
  // Giro e letra escolhidos no painel; no automático, o rótulo acompanha a
  // aresta longa, nunca de cabeça para baixo (B-23).
  const giro = structureLabelAngle(arena);
  const letra = info.labelSizeMm ?? STRUCTURE_LABEL_MM;

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
          fontSize={letra}
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
 * Régua do perímetro (decisão 70).
 *
 * Os traços saem da BORDA REAL da pista — num contorno irregular, cada
 * traço encosta no trecho de cerca à frente dele, também no inclinado —,
 * mas continuam verticais (em cima e embaixo) e horizontais (nos lados),
 * nos múltiplos do passo contados do canto superior esquerdo, como a
 * grade. O número fica sempre de pé, logo depois do traço.
 *
 * É desenhada por cima das construções, com um contorno branco no número:
 * uma arquibancada encostada na cerca não esconde mais a metragem.
 */
export function PerimeterRulerLayer({
  arena,
  printScale,
  originMm,
}: {
  arena: Arena;
  printScale: number;
  originMm: Vec2;
}) {
  const { stepM, labelEveryM, sides } = arena.perimeterRuler;
  if (!arena.visible || !arena.perimeterRuler.visible || !(stepM > 0)) return null;
  const k = mmPerMeter(printScale);
  const toPaper = (p: Vec2): Vec2 => ({ x: originMm.x + p.x * k, y: originMm.y + p.y * k });

  const extent = arenaExtent(arena);
  const x0 = extent.origin.x;
  const y0 = extent.origin.y;
  const contorno = outlinePolygon(arenaPoints(arena), arena.corner.style, arena.corner.radiusM);
  // Exatamente no canto a linha toca só um vértice: amostra um fio para dentro.
  const fio = 1e-6;

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
    const t = toPaper(labelAt);
    const props = {
      x: t.x,
      y: t.y,
      fontFamily: font.family,
      fontSize: text.tiny,
      textAnchor: anchor,
      dominantBaseline: baseline,
    } as const;
    ticks.push(
      <g key={key}>
        <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color.arenaLine} strokeWidth={stroke.hairline} />
        {label != null && (
          <>
            {/* Contorno branco por baixo (cópia com traço), seguro no PDF. */}
            <text {...props} fill="#ffffff" stroke="#ffffff" strokeWidth={0.7} strokeLinejoin="round">
              {label}
            </text>
            <text {...props} fill={color.ink}>
              {label}
            </text>
          </>
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
    const trechos = insideIntervals(contorno, 'x', Math.min(x0 + extent.widthM - fio, Math.max(x0 + fio, x)));
    if (trechos.length === 0) continue;
    const topo = Math.min(...trechos.map((t) => t[0]));
    const base = Math.max(...trechos.map((t) => t[1]));
    const label = major && m > 0 && m < extent.widthM ? String(Math.round(m)) : null;
    if (sides.top) {
      push(`t${m}`, { x, y: topo }, { x, y: topo - len }, label, { x, y: topo - len - gapM }, 'middle', 'auto');
    }
    if (sides.bottom) {
      push(`b${m}`, { x, y: base }, { x, y: base + len }, label, { x, y: base + len + gapM }, 'middle', 'hanging');
    }
  }

  for (let m = 0; m <= extent.heightM + 1e-9; m += stepM) {
    const major = isLabel(m);
    const len = major ? tickMajorM : tickM;
    const y = y0 + m;
    const trechos = insideIntervals(contorno, 'y', Math.min(y0 + extent.heightM - fio, Math.max(y0 + fio, y)));
    if (trechos.length === 0) continue;
    const esq = Math.min(...trechos.map((t) => t[0]));
    const dir = Math.max(...trechos.map((t) => t[1]));
    const label = major && m > 0 && m < extent.heightM ? String(Math.round(m)) : null;
    if (sides.left) {
      push(`l${m}`, { x: esq, y }, { x: esq - len, y }, label, { x: esq - len - gapM, y }, 'end', 'middle');
    }
    if (sides.right) {
      push(`r${m}`, { x: dir, y }, { x: dir + len, y }, label, { x: dir + len + gapM, y }, 'start', 'middle');
    }
  }

  return <g data-part="perimeter-ruler" pointerEvents="none">{ticks}</g>;
}
