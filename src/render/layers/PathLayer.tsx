import { formatDistance, pathD } from '@core/model/path';
import type { Vec2 } from '@core/geometry/vec';
import type { CoursePath, Obstacle, TimingLine } from '@core/model/types';
import { courseDistancesAlong, pathSampler } from '@core/assist/obstacleDistances';
import {
  besideLinePlacement,
  distanceFontMm,
  ON_LINE_GAP_MM,
  onLinePlacement,
  textWidth,
  type OnLineLabel,
} from '@core/assist/labelLayout';
import { mmPerMeter } from '@core/scale/units';
import { HIT_BAND_PX } from './ArenaLayer';
import { dashPattern, font } from '@render/style/tokens';

interface Props {
  path: CoursePath;
  printScale: number;
  originMm: Vec2;
  /** Obstáculos do croqui: para as distâncias entre eles (decisão 54). */
  obstacles?: Obstacle[];
  /** Partida e chegada, para as distâncias que começam ou terminam nelas. */
  timings?: TimingLine[];
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
export function PathLayer({ path, printScale, originMm, obstacles = [], timings = [], distanceAt, onPointerDown }: Props) {
  const k = mmPerMeter(printScale);
  const toPaper = (p: Vec2): Vec2 => ({ x: originMm.x + p.x * k, y: originMm.y + p.y * k });
  // Toda distância do traçado é escrita SOBRE a linha, paralela a ela, como
  // uma cota (decisão 56). O leiaute escolhe o lugar ao longo do trecho
  // para não cobrir nada; sem leiaute, fica no meio.
  const corpo = distanceFontMm(path);
  const altura = (corpo * 1.05) / k;

  // Todas as distâncias mostradas são de vara a vara, na ordem do percurso
  // (decisão 76); o checkbox de cada uma decide se ela entra no croqui.
  const pares = courseDistancesAlong(path, obstacles, timings);
  const escolhidas = pares.filter((d) => path.obstacleDistances?.[d.key]);

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

      {path.label && (() => {
        const amostra = pathSampler(path);
        if (!amostra) return null;
        const { p, normal } = amostra.pointAt(path.label.s);
        const deitado = path.label.deitado;
        const lbl = deitado
          ? {
              pos: besideLinePlacement(
                p,
                { x: -normal.x, y: -normal.y },
                textWidth(path.label.text, corpo) / k,
                altura,
                ON_LINE_GAP_MM / k + deitado.folgaM,
              ),
              angle: 0,
            }
          : onLinePlacement(p, { x: normal.y, y: -normal.x }, altura, ON_LINE_GAP_MM / k);
        return (
          <DistanceText at={toPaper(lbl.pos)} angle={lbl.angle} value={path.label.text} color={path.totalLabel.color} sizeMm={corpo} />
        );
      })()}

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
            sizeMm={corpo}
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
  sizeMm,
}: {
  at: Vec2;
  /** Giro do texto, em graus: o da linha onde ele se apoia. */
  angle?: number;
  value: string;
  color: string;
  sizeMm: number;
}) {
  return (
    <text
      x={round(at.x)}
      y={round(at.y)}
      transform={angle !== 0 ? `rotate(${round(angle)} ${round(at.x)} ${round(at.y)})` : undefined}
      fontFamily={font.family}
      fontSize={sizeMm}
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
