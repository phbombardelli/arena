import { arrowGeometry, semParaflanco, wingDepth } from '@core/library/obstacles';
import type { BarAppearance, Obstacle, WingsAppearance } from '@core/model/types';
import { color, stroke } from '@render/style/tokens';

/**
 * Símbolos de obstáculo em vista superior.
 *
 * Desenhados em MILÍMETROS DE PAPEL, recebendo `k` (mm por metro) para
 * converter a geometria real. Não se usa `scale()` aqui: a escala do grupo
 * engordaria também a espessura do traço, que é anotação e precisa ficar
 * constante em qualquer escala de impressão (DECISOES, decisões 1 e 3).
 *
 * Sistema local: X ao longo da frente, Y na profundidade, salto para −Y.
 * Sem <symbol>/<use> — o conversor de PDF perde o conteúdo deles.
 */

const BAR_MM = 1.1;
const STANDARD_M = 0.35;
/** Meio lado do X do cavalete, em metros: um suporte de ~0,6 m. */
const CAVALETE_X_M = 0.3;
/** Fração da vara ocupada por cada ponta, no estilo "pontas". */
const TIP_FRACTION = 0.16;

interface Props {
  obstacle: Obstacle;
  /** Milímetros de papel por metro. */
  k: number;
}

export function ObstacleShape({ obstacle, k }: Props) {
  const halfW = (obstacle.faceWidthM / 2) * k;
  const spread = (obstacle.spreadM ?? 0) * k;
  const bar = obstacle.bar;

  const corpo = () => {
    switch (obstacle.type) {
      case 'vertical':
        return <Bar halfW={halfW} y={0} k={k} bar={bar} wings={obstacle.wings} />;
      case 'plano':
        // Vara no chão: só a vara, sem pilar nem paraflanco.
        return <Bar halfW={halfW} y={0} k={k} bar={bar} wings={{ ...obstacle.wings, style: 'nenhum' }} thin />;

      case 'cavalete':
        // Vara no chão com o suporte em X em cada ponta, visto de cima.
        return (
          <>
            <Bar halfW={halfW} y={0} k={k} bar={bar} wings={{ ...obstacle.wings, style: 'nenhum' }} thin />
            {[-halfW, halfW].map((x) => {
              const h = CAVALETE_X_M * k;
              return (
                <path
                  key={x}
                  d={`M${x - h} ${-h}L${x + h} ${h}M${x - h} ${h}L${x + h} ${-h}`}
                  stroke={color.ink}
                  strokeWidth={stroke.regular}
                  strokeLinecap="round"
                  fill="none"
                />
              );
            })}
          </>
        );

      case 'x': {
        // Duas varas cruzadas de uma ponta à outra, sobre os suportes.
        const a = Math.min(halfW * 0.28, 0.7 * k);
        return (
          <>
            {[-1, 1].map((s) => (
              <line
                key={s}
                x1={-halfW}
                y1={-a * s}
                x2={halfW}
                y2={a * s}
                stroke={color.ink}
                strokeWidth={stroke.heavy}
                strokeLinecap="round"
              />
            ))}
          </>
        );
      }

      case 'oxer':
        return (
          <>
            <Bar halfW={halfW} y={spread / 2} k={k} bar={bar} wings={obstacle.wings} />
            <Bar halfW={halfW} y={-spread / 2} k={k} bar={bar} wings={obstacle.wings} />
          </>
        );

      case 'triplice':
        return (
          <>
            <Bar halfW={halfW} y={spread / 2} k={k} bar={bar} wings={obstacle.wings} />
            <Bar halfW={halfW} y={0} k={k} bar={bar} wings={obstacle.wings} />
            <Bar halfW={halfW} y={-spread / 2} k={k} bar={bar} wings={obstacle.wings} />
          </>
        );

      case 'muro':
        return (
          <rect
            x={-halfW}
            y={-spread / 2}
            width={halfW * 2}
            height={spread}
            fill={bar.color === '#ffffff' ? '#8d8d8d' : bar.color}
            stroke={color.ink}
            strokeWidth={stroke.thin}
          />
        );

    }
  };

  return (
    <>
      {/* A água entra por baixo de tudo; os paraflancos, sob as varas. */}
      {obstacle.liverpool.enabled && <Liverpool obstacle={obstacle} k={k} />}
      {obstacle.wings.style === 'paraflanco' && !semParaflanco(obstacle.type) && <Wings obstacle={obstacle} k={k} />}
      {corpo()}
    </>
  );
}

/**
 * Paraflancos: os painéis laterais que sustentam as varas. Sem eles o
 * obstáculo parece uma vara solta no chão — foi o que motivou o desenho.
 * Ficam nas pontas da frente e acompanham a profundidade do obstáculo.
 */
function Wings({ obstacle, k }: Props) {
  const halfW = (obstacle.faceWidthM / 2) * k;
  const largura = obstacle.wings.widthM * k;
  const profundidade = wingDepth(obstacle) * k;
  const y = -profundidade / 2;

  return (
    <g data-part="wings">
      {[-halfW - largura / 2, halfW - largura / 2].map((x, i) => (
        <rect
          key={i}
          x={x}
          y={y}
          width={largura}
          height={profundidade}
          rx={largura * 0.18}
          fill={obstacle.wings.color}
          stroke={color.ink}
          strokeWidth={stroke.hairline}
        />
      ))}
    </g>
  );
}

/**
 * Lâmina de água acoplada. Desenhada no sistema local com os lados
 * alinhados aos eixos, o que a mantém paralela à frente por construção —
 * não há como o usuário desalinhá-la.
 */
function Liverpool({ obstacle, k }: Props) {
  const { widthM, spreadM, offsetM, color: fill } = obstacle.liverpool;
  const halfW = (widthM / 2) * k;
  return (
    <rect
      data-part="liverpool"
      x={-halfW}
      y={(offsetM - spreadM / 2) * k}
      width={halfW * 2}
      height={spreadM * k}
      fill={fill}
      stroke={color.ink}
      strokeWidth={stroke.hairline}
    />
  );
}

/**
 * Vara com os pilares nas pontas. O estilo é do usuário: lisa, listrada ou
 * só com as pontas destacadas — as três aparecem em obstáculo real, e a
 * diferença ajuda a distinguir obstáculos vizinhos no croqui.
 */
function Bar({
  halfW,
  y,
  k,
  bar,
  wings,
  thin = false,
}: {
  halfW: number;
  y: number;
  k: number;
  bar: BarAppearance;
  wings: WingsAppearance;
  thin?: boolean;
}) {
  const standard = (STANDARD_M / 2) * k;
  const espessura = thin ? BAR_MM * 0.55 : BAR_MM;
  const topo = y - espessura / 2;
  const largura = halfW * 2;

  return (
    <g>
      {bar.style === 'listrada' ? (
        <Stripes x={-halfW} y={topo} width={largura} height={espessura} bar={bar} />
      ) : bar.style === 'pontas' ? (
        <Tips x={-halfW} y={topo} width={largura} height={espessura} bar={bar} />
      ) : (
        <rect x={-halfW} y={topo} width={largura} height={espessura} fill={bar.color} />
      )}
      {/* Contorno por cima: garante a vara visível mesmo em cor clara. */}
      <rect
        x={-halfW}
        y={topo}
        width={largura}
        height={espessura}
        fill="none"
        stroke={color.ink}
        strokeWidth={stroke.hairline}
      />
      {wings.style === 'pilar' && (
        <>
          <line x1={-halfW} y1={y - standard} x2={-halfW} y2={y + standard} stroke={color.ink} strokeWidth={stroke.regular} />
          <line x1={halfW} y1={y - standard} x2={halfW} y2={y + standard} stroke={color.ink} strokeWidth={stroke.regular} />
        </>
      )}
    </g>
  );
}

function Stripes({
  x,
  y,
  width,
  height,
  bar,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  bar: BarAppearance;
}) {
  const n = Math.max(2, Math.min(24, Math.round(bar.stripes)));
  const passo = width / n;
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <rect
          key={i}
          x={x + i * passo}
          y={y}
          width={passo}
          height={height}
          fill={i % 2 === 0 ? bar.color : bar.accent}
        />
      ))}
    </>
  );
}

function Tips({
  x,
  y,
  width,
  height,
  bar,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  bar: BarAppearance;
}) {
  const ponta = width * TIP_FRACTION;
  return (
    <>
      <rect x={x} y={y} width={width} height={height} fill={bar.color} />
      <rect x={x} y={y} width={ponta} height={height} fill={bar.accent} />
      <rect x={x + width - ponta} y={y} width={ponta} height={height} fill={bar.accent} />
    </>
  );
}

export function JumpArrow({ obstacle, k }: Props) {
  const { shaft, head } = arrowGeometry(obstacle, k);
  return (
    <g data-part="arrow">
      <line {...shaft} stroke={color.ink} strokeWidth={stroke.medium} />
      <path
        d={`M ${head[0].x} ${head[0].y} L ${head[1].x} ${head[1].y} L ${head[2].x} ${head[2].y} Z`}
        fill={color.ink}
      />
    </g>
  );
}
