import {
  formatDistance,
  legLength,
  pathD,
  pathLength,
} from '@core/model/path';
import type { Vec2 } from '@core/geometry/vec';
import type { CoursePath, Obstacle } from '@core/model/types';
import { obstacleDistancesAlong, pathSampler } from '@core/assist/obstacleDistances';
import {
  LABEL_FONT_MM,
  ON_LINE_GAP_MM,
  TOTAL_KEY,
  legKey,
  onLinePlacement,
  type OnLineLabel,
} from '@core/assist/labelLayout';
import { mmPerMeter } from '@core/scale/units';
import { HIT_BAND_PX } from './ArenaLayer';
import { dashPattern, font, text } from '@render/style/tokens';

interface Props {
  path: CoursePath;
  printScale: number;
  originMm: Vec2;
  /** Obstáculos do croqui: para as distâncias entre eles (decisão 54). */
  obstacles?: Obstacle[];
  /** Posição e giro escolhidos pelo leiaute de rótulos (decisões 55 e 56). */
  distanceAt?: Map<string, OnLineLabel>;
  onPointerDown?: (e: React.PointerEvent) => void;
}


/**
 * Traçado do percurso e as distâncias de cada trecho.
 *
 * O número mostrado é o comprimento do traçado desenhado, medido sobre a
 * curva — não a distância em linha reta entre os nós (§19).
 */
export function PathLayer({ path, printScale, originMm, obstacles = [], distanceAt, onPointerDown }: Props) {
  const k = mmPerMeter(printScale);
  const toPaper = (p: Vec2): Vec2 => ({ x: originMm.x + p.x * k, y: originMm.y + p.y * k });
  // Toda distância do traçado é escrita SOBRE a linha, paralela a ela, como
  // uma cota (decisão 56). O leiaute escolhe o lugar ao longo do trecho
  // para não cobrir nada; sem leiaute, fica no meio.
  const amostra = path.distanceMode !== 'nenhum' ? pathSampler(path) : null;
  const altura = (LABEL_FONT_MM.distance * 1.05) / k;
  const sobreALinha = (s: number): OnLineLabel | null => {
    if (!amostra) return null;
    const { p, normal } = amostra.pointAt(s);
    return onLinePlacement(p, { x: normal.y, y: -normal.x }, altura, ON_LINE_GAP_MM / k);
  };
  const inicioDoTrecho = (i: number): number => {
    let s = 0;
    for (let j = 0; j < i; j += 1) s += legLength(path, j);
    return s;
  };

  const escolhidas = Object.values(path.obstacleDistances ?? {}).some(Boolean)
    ? obstacleDistancesAlong(path, obstacles).filter((d) => path.obstacleDistances[d.key])
    : [];

  return (
    <g data-object={path.id} data-kind="path">
      {/* Faixa larga e invisível, de largura fixa na tela: dá o que clicar
          num traço de 0,4 mm em qualquer escala e zoom. */}
      <path
        d={pathD(path, toPaper)}
        fill="none"
        stroke="transparent"
        strokeWidth={HIT_BAND_PX}
        vectorEffect="non-scaling-stroke"
        onPointerDown={onPointerDown}
        style={{ cursor: path.locked ? 'default' : 'move' }}
      />
      <path
        d={pathD(path, toPaper)}
        fill="none"
        stroke={path.style.color}
        strokeWidth={path.style.strokeMm}
        strokeDasharray={dashPattern[path.style.dash]}
        strokeLinecap="round"
        strokeLinejoin="round"
        pointerEvents="none"
      />

      {path.distanceMode === 'total' && path.totalLabel.visible && path.nodes.length > 1 && (() => {
        const lbl = distanceAt?.get(TOTAL_KEY) ?? sobreALinha(pathLength(path) / 2);
        return lbl ? (
          <DistanceText
            at={toPaper(lbl.pos)}
            angle={lbl.angle}
            value={formatDistance(pathLength(path), path.totalLabel.decimals)}
            color={path.totalLabel.color}
          />
        ) : null;
      })()}

      {path.distanceMode === 'trecho' && path.legs.map((leg, i) => {
        if (!leg.label.visible) return null;
        const lbl = distanceAt?.get(legKey(i)) ?? sobreALinha(inicioDoTrecho(i) + legLength(path, i) / 2);
        if (!lbl) return null;
        return (
          <DistanceText
            key={i}
            at={toPaper(lbl.pos)}
            angle={lbl.angle}
            value={formatDistance(legLength(path, i), leg.label.decimals)}
            color={leg.label.color}
          />
        );
      })}

      {escolhidas.map((d) => {
        // Sem leiaute (traçado provisório), fica no meio do trecho.
        const lbl =
          distanceAt?.get(d.key) ??
          onLinePlacement(d.at, { x: d.normal.y, y: -d.normal.x }, altura, ON_LINE_GAP_MM / k);
        return (
          <DistanceText
            key={d.key}
            at={toPaper(lbl.pos)}
            angle={lbl.angle}
            value={`${formatDistance(d.meters, 2)} m`}
            color={path.totalLabel.color}
          />
        );
      })}
    </g>
  );
}

function DistanceText({
  at,
  angle = 0,
  value,
  color,
}: {
  at: Vec2;
  /** Giro do texto, em graus: o da linha onde ele se apoia. */
  angle?: number;
  value: string;
  color: string;
}) {
  return (
    <text
      x={round(at.x)}
      y={round(at.y)}
      transform={angle !== 0 ? `rotate(${round(angle)} ${round(at.x)} ${round(at.y)})` : undefined}
      fontFamily={font.family}
      fontSize={text.small}
      fill={color}
      textAnchor="middle"
      dominantBaseline="middle"
      pointerEvents="none"
    >
      {value}
    </text>
  );
}

const round = (v: number): number => Math.round(v * 1000) / 1000;
