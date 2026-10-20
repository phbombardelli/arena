import { timingExtent } from '@core/library/timing';
import type { Vec2 } from '@core/geometry/vec';
import type { TimingLine } from '@core/model/types';
import { mmPerMeter } from '@core/scale/units';
import { color, dashPattern, font, stroke, text } from '@render/style/tokens';

interface Props {
  line: TimingLine;
  printScale: number;
  originMm: Vec2;
  /** Centro do rótulo escolhido pelo leiaute (decisão 55), em metros. */
  labelAt?: Vec2;
  onPointerDown?: (e: React.PointerEvent) => void;
}

/**
 * Linha de cronometragem: os dois paraflancos, o traço entre eles e a seta
 * de passagem. Mesmo sistema local do obstáculo — X ao longo da linha,
 * passagem para −Y —, então a seta é perpendicular por construção.
 */
export function TimingLayer({ line, printScale, originMm, labelAt, onPointerDown }: Props) {
  const k = mmPerMeter(printScale);
  const cx = originMm.x + line.pos.x * k;
  const cy = originMm.y + line.pos.y * k;

  const halfW = (line.widthM / 2) * k;
  const larguraAsa = line.wings.widthM * k;
  const profAsa = line.wings.depthM * k;
  const dir = line.arrow.reversed ? 1 : -1;
  const ponta = dir * (profAsa / 2 + 1 + line.arrow.lengthMm);
  const cabeca = line.arrow.lengthMm * 0.42;
  const ext = timingExtent(line);

  return (
    <g data-object={line.id} data-kind="timing" data-role={line.role}>
      <g
        transform={`translate(${round(cx)} ${round(cy)}) rotate(${line.rotation})`}
        onPointerDown={onPointerDown}
        style={{ cursor: line.locked ? 'default' : 'move' }}
      >
        <line
          x1={-halfW}
          y1={0}
          x2={halfW}
          y2={0}
          stroke={line.style.color}
          strokeWidth={line.style.strokeMm}
          strokeDasharray={dashPattern[line.style.dash]}
        />

        {line.wings.style === 'paraflanco' &&
          [-halfW - larguraAsa / 2, halfW - larguraAsa / 2].map((x, i) => (
            <rect
              key={i}
              x={x}
              y={-profAsa / 2}
              width={larguraAsa}
              height={profAsa}
              rx={larguraAsa * 0.18}
              fill={line.wings.color}
              stroke={color.ink}
              strokeWidth={stroke.hairline}
            />
          ))}

        {line.arrow.visible && (
          <g data-part="arrow">
            <line
              x1={0}
              y1={dir * (profAsa / 2 + 1)}
              x2={0}
              y2={ponta - dir * cabeca * 0.8}
              stroke={line.style.color}
              strokeWidth={stroke.medium}
            />
            <path
              d={`M ${-cabeca * 0.45} ${ponta - dir * cabeca} L 0 ${ponta} L ${cabeca * 0.45} ${ponta - dir * cabeca} Z`}
              fill={line.style.color}
            />
          </g>
        )}
      </g>

      {/* O texto não gira, como nos rótulos de obstáculo (decisão 23). */}
      {line.labelVisible && line.label !== '' && (
        <text
          x={round(labelAt ? originMm.x + labelAt.x * k : cx)}
          y={round(labelAt ? originMm.y + labelAt.y * k : cy - (ext.backM + 1.4) * k)}
          fontFamily={font.family}
          fontSize={text.regular}
          fontWeight="bold"
          fill={color.ink}
          textAnchor="middle"
          dominantBaseline="middle"
          pointerEvents="none"
        >
          {line.label}
        </text>
      )}
    </g>
  );
}

const round = (v: number): number => Math.round(v * 1000) / 1000;
