import { formatHeights, labelOffset, obstacleExtent, obstacleLabel } from '@core/library/obstacles';
import { rotate, type Vec2 } from '@core/geometry/vec';
import type { Obstacle } from '@core/model/types';
import { mmPerMeter } from '@core/scale/units';
import { JumpArrow, ObstacleShape } from '@render/symbols/obstacleShapes';
import { FLAG_SPAN_MM, SideFlags } from '@render/symbols/flags';
import { color, font, text } from '@render/style/tokens';

interface Props {
  obstacle: Obstacle;
  printScale: number;
  originMm: Vec2;
  /** Bandeirolas do documento ligadas. */
  flags?: boolean;
  /**
   * Centros escolhidos pelo leiaute de rótulos, em metros (decisão 55).
   * Ausentes, vale a posição fixa de antes.
   */
  numberAt?: Vec2;
  heightsAt?: Vec2;
  onPointerDown?: (e: React.PointerEvent) => void;
}

export function ObstacleLayer({
  obstacle,
  printScale,
  originMm,
  flags = false,
  numberAt,
  heightsAt,
  onPointerDown,
}: Props) {
  const k = mmPerMeter(printScale);
  const cx = originMm.x + obstacle.pos.x * k;
  const cy = originMm.y + obstacle.pos.y * k;

  const numero = obstacleLabel(obstacle);
  const alturas = formatHeights(obstacle);

  // O deslocamento do rótulo é local: gira com o obstáculo para continuar
  // fugindo do corpo e da seta. O TEXTO em si nunca gira.
  const numeroEm = numberAt
    ? { x: numberAt.x - obstacle.pos.x, y: numberAt.y - obstacle.pos.y }
    : rotate(labelOffset(obstacle, 'numberLabel', flags ? FLAG_SPAN_MM / k : 0), obstacle.rotation);
  const alturasEm = heightsAt
    ? { x: heightsAt.x - obstacle.pos.x, y: heightsAt.y - obstacle.pos.y }
    : rotate(labelOffset(obstacle, 'heightLabel'), obstacle.rotation);

  return (
    <g data-object={obstacle.id} data-kind="obstacle">
      {/* Corpo e seta giram com o obstáculo. */}
      <g
        transform={`translate(${round(cx)} ${round(cy)}) rotate(${obstacle.rotation})`}
        onPointerDown={onPointerDown}
        style={{ cursor: obstacle.locked ? 'default' : 'move' }}
      >
        {onPointerDown && <ObstacleHitArea obstacle={obstacle} k={k} />}
        <ObstacleShape obstacle={obstacle} k={k} />
        {obstacle.arrow.visible && <JumpArrow obstacle={obstacle} k={k} />}
        {flags && (
          <SideFlags
            halfMm={(obstacleExtent(obstacle).halfWidthM + (obstacle.wings.style === 'paraflanco' ? obstacle.wings.widthM : 0)) * k}
            reversed={obstacle.arrow.reversed}
          />
        )}
      </g>

      {/*
        Rótulos NÃO giram: número e alturas têm de continuar legíveis com o
        obstáculo em qualquer ângulo, como no croqui de referência. O
        deslocamento é em metros, medido a partir do centro.
      */}
      {obstacle.numberLabel.visible && numero !== '' && (
        <text
          x={round(cx + numeroEm.x * k)}
          y={round(cy + numeroEm.y * k)}
          fontFamily={font.family}
          fontSize={text.medium}
          fontWeight="bold"
          fill={color.ink}
          textAnchor="middle"
          dominantBaseline="middle"
          pointerEvents="none"
        >
          {numero}
        </text>
      )}

      {obstacle.heightLabel.visible && alturas !== '' && (
        <text
          x={round(cx + alturasEm.x * k)}
          y={round(cy + alturasEm.y * k)}
          fontFamily={font.family}
          fontSize={text.small}
          fill={color.height}
          textAnchor="middle"
          dominantBaseline="middle"
          pointerEvents="none"
        >
          {alturas}
        </text>
      )}
    </g>
  );
}

const round = (v: number): number => Math.round(v * 1000) / 1000;

/** Folga da área de clique além do desenho, em pixels de TELA. */
export const HIT_MARGIN_PX = 9;

/**
 * Área de clique do obstáculo: o retângulo inteiro, com o vão do oxer e os
 * paraflancos, mais uma folga fixa na tela. Só o desenho respondia ao
 * clique — num oxer largo o miolo vazio não pegava, e em escala grande a
 * vara fina sumia debaixo do cursor. A folga é um traço invisível que não
 * escala com o zoom (`non-scaling-stroke`), então vale o mesmo de perto e
 * de longe. Só existe no editor: o PDF não recebe `onPointerDown`.
 */
function ObstacleHitArea({ obstacle, k }: { obstacle: Obstacle; k: number }) {
  const ext = obstacleExtent(obstacle);
  const flanco = obstacle.wings.style === 'paraflanco' ? obstacle.wings.widthM : 0;
  const meia = (ext.halfWidthM + flanco) * k;
  return (
    <rect
      data-part="hit-area"
      x={-meia}
      y={ext.frontM * k}
      width={meia * 2}
      height={Math.max(0.01, (ext.backM - ext.frontM) * k)}
      fill="transparent"
      stroke="transparent"
      strokeWidth={HIT_MARGIN_PX * 2}
      vectorEffect="non-scaling-stroke"
    />
  );
}
