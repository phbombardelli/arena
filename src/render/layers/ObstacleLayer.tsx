import { t } from '@core/i18n/i18n';
import { formatHeights, labelOffset, obstacleExtent, obstacleLabel } from '@core/library/obstacles';
import { rotate, type Vec2 } from '@core/geometry/vec';
import type { Obstacle } from '@core/model/types';
import { mmPerMeter } from '@core/scale/units';
import { JumpArrow, ObstacleShape } from '@render/symbols/obstacleShapes';
import { color, font, text } from '@render/style/tokens';
import { COR_DESEMPATE } from '@core/commands/pathOps';

interface Props {
  obstacle: Obstacle;
  printScale: number;
  originMm: Vec2;
  /**
   * Centros escolhidos pelo leiaute de rótulos, em metros (decisão 55).
   * Ausentes, vale a posição fixa de antes.
   */
  numberAt?: Vec2;
  heightsAt?: Vec2;
  /**
   * Com o percurso e o desempate juntos, o que muda no desempate (B-92):
   * a seta azul do sentido contrário e a etiqueta do vertical que vira oxer.
   */
  noDesempate?: { contrario: boolean; oxer: boolean };
  onPointerDown?: (e: React.PointerEvent) => void;
}

export function ObstacleLayer({
  obstacle,
  printScale,
  originMm,
  numberAt,
  heightsAt,
  noDesempate,
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
    : rotate(labelOffset(obstacle, 'numberLabel'), obstacle.rotation);
  const alturasEm = heightsAt
    ? { x: heightsAt.x - obstacle.pos.x, y: heightsAt.y - obstacle.pos.y }
    : rotate(labelOffset(obstacle, 'heightLabel'), obstacle.rotation);

  // Etiquetas do desempate (B-92), empilhadas a partir do número para o
  // lado oposto ao obstáculo.
  const comNumero = obstacle.numberLabel.visible && numero !== '';
  const etiquetas = [
    ...(obstacle.soDesempate && comNumero ? [{ chave: 'so', texto: t('dsp.soDesempate'), cor: color.ink }] : []),
    ...(noDesempate?.oxer && comNumero ? [{ chave: 'oxer', texto: t('dsp.oxerNoDesempate'), cor: COR_DESEMPATE }] : []),
  ];
  const nx = cx + numeroEm.x * k;
  const ny = cy + numeroEm.y * k;
  const passo = text.small * 1.2;
  const meioNumero = text.medium * 0.5 + text.small * 0.6;
  const etiquetaEm = (i: number): { x: number; y: number; anchor: 'start' | 'middle' | 'end' } => {
    // Para cima se o número está acima do centro do obstáculo; para baixo
    // se está abaixo. Assim a etiqueta nunca atravessa o número em direção
    // ao salto, nem com o obstáculo girado na diagonal.
    const sinal = numeroEm.y < 0 ? -1 : 1;
    const y = ny + sinal * (meioNumero + i * passo);
    // Número ao lado: a etiqueta cresce para fora, a partir da borda de dentro.
    const lado = Math.abs(numeroEm.x) > Math.abs(numeroEm.y) * 0.5;
    if (!lado) return { x: nx, y, anchor: 'middle' };
    const borda = text.medium * 0.35;
    return numeroEm.x > 0 ? { x: nx - borda, y, anchor: 'start' } : { x: nx + borda, y, anchor: 'end' };
  };

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
        {obstacle.arrow.visible && !obstacle.arrow.both && <JumpArrow obstacle={obstacle} k={k} />}
        {obstacle.arrow.visible && obstacle.arrow.both && <SetasDuplas obstacle={obstacle} k={k} />}
        {noDesempate?.contrario && (
          <JumpArrow
            obstacle={{ ...obstacle, arrow: { ...obstacle.arrow, both: false, reversed: !obstacle.arrow.reversed } }}
            k={k}
            cor={COR_DESEMPATE}
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

      {/* Etiquetas do desempate (B-92): sempre do lado de fora do número,
          para não cair em cima do obstáculo. */}
      {etiquetas.map((e, i) => {
        const p = etiquetaEm(i);
        return (
          <text
            key={e.chave}
            x={round(p.x)}
            y={round(p.y)}
            fontFamily={font.family}
            fontSize={text.small}
            fontStyle="italic"
            fill={e.cor}
            textAnchor={p.anchor}
            dominantBaseline="middle"
            pointerEvents="none"
          >
            {e.texto}
          </text>
        );
      })}

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

/**
 * Duplo sentido (B-88): as duas setas lado a lado, uma de cada lado do
 * centro, como placa de mão dupla. Entre duas varas vizinhas, a que vai e
 * a que volta passam uma ao lado da outra em vez de bater de frente.
 */
function SetasDuplas({ obstacle, k }: { obstacle: Obstacle; k: number }) {
  const meiaCabeca = obstacle.arrow.lengthMm * 0.42 * 0.45;
  const lado = Math.min(meiaCabeca + 0.4, (obstacle.faceWidthM / 2) * k);
  return (
    <>
      <g transform={`translate(${round(lado)} 0)`}>
        <JumpArrow obstacle={obstacle} k={k} />
      </g>
      <g transform={`translate(${round(-lado)} 0)`}>
        <JumpArrow obstacle={{ ...obstacle, arrow: { ...obstacle.arrow, reversed: !obstacle.arrow.reversed } }} k={k} />
      </g>
    </>
  );
}
