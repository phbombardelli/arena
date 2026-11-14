import { alturaCorpo, montagemDe, topoPeca } from '@core/library/montagem';
import { obstacleExtent } from '@core/library/obstacles';
import type { Obstacle, PecaMontagem } from '@core/model/types';

/**
 * Desenhos da montagem (B-108), os mesmos na janela de edição e na folha
 * de especificação: a vista de frente do 1º plano e o perfil com todos os
 * planos. Coordenadas na unidade de quem chama (px na tela, mm no papel).
 */

export const COR_VARA = '#b8741a';
export const COR_SOLIDA = '#d3d1c7';
export const COR_MURO = '#e8a585';
export const COR_TRACO = '#4a4a46';
export const COR_POSTE = '#a9a79f';
export const COR_AGUA = '#2b7fd4';

export interface Caixa {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Altura máxima da escala vertical: um pouco acima do mais alto. */
export const escalaCm = (topo: number): number => Math.max(100, Math.ceil((topo + 15) / 25) * 25);

interface FrenteProps {
  pecas: PecaMontagem[];
  caixa: Caixa;
  maxCm: number;
  /** Espessura base do traço; a vara tem ~2,5x. */
  traco: number;
  selecionada?: number | null;
  corSelecao?: string;
  /** Nome da peça dentro dela (só onde há espaço, na tela). */
  rotulos?: (p: PecaMontagem) => string;
}

/** Vista de frente: dois postes e as peças entre eles. */
export function VistaFrente({ pecas, caixa, maxCm, traco, selecionada = null, corSelecao = '#378add', rotulos }: FrenteProps) {
  const { x, y, w, h } = caixa;
  const poste = Math.max(traco * 2, w * 0.025);
  const x0 = x + poste;
  const x1 = x + w - poste;
  const yDe = (cm: number) => y + h - (cm / maxCm) * h;
  const vara = traco * 2.6;
  return (
    <g>
      <line x1={x} y1={y + h} x2={x + w} y2={y + h} stroke={COR_POSTE} strokeWidth={traco * 0.6} />
      <rect x={x} y={y} width={poste} height={h} fill={COR_POSTE} />
      <rect x={x1} y={y} width={poste} height={h} fill={COR_POSTE} />
      {/* As sólidas primeiro: de frente, uma vara nunca some atrás delas. */}
      {pecas
        .map((p, k) => ({ p, k }))
        .sort((a, b) => Number(a.p.tipo === 'vara') - Number(b.p.tipo === 'vara'))
        .map(({ p, k }) => {
        const sel = k === selecionada;
        if (p.tipo === 'vara') {
          return (
            <g key={k}>
              {rotulos && (
                // Na tela, uma faixa invisível larga: a vara fina é difícil de pegar.
                <line
                  data-peca={k}
                  x1={x0}
                  y1={yDe(p.esq)}
                  x2={x1}
                  y2={yDe(p.dir)}
                  stroke="transparent"
                  strokeWidth={vara * 3.5}
                />
              )}
              <line
                data-peca={k}
                x1={x0 + vara / 2}
                y1={yDe(p.esq)}
                x2={x1 - vara / 2}
                y2={yDe(p.dir)}
                stroke={sel ? corSelecao : COR_VARA}
                strokeWidth={vara}
                strokeLinecap="round"
              />
              </g>
          );
        }
        const a = alturaCorpo(p);
        const rotulo = rotulos?.(p);
        return (
          <g key={k}>
            <polygon
              data-peca={k}
              points={`${x0},${yDe(p.esq)} ${x1},${yDe(p.dir)} ${x1},${yDe(Math.max(0, p.dir - a))} ${x0},${yDe(Math.max(0, p.esq - a))}`}
              fill={p.tipo === 'muro' ? COR_MURO : COR_SOLIDA}
              stroke={sel ? corSelecao : COR_TRACO}
              strokeWidth={sel ? traco * 1.6 : traco * 0.5}
            />
            {rotulo && (
              <text
                x={(x0 + x1) / 2}
                y={(yDe(p.esq - a / 2) + yDe(p.dir - a / 2)) / 2}
                dy="0.35em"
                textAnchor="middle"
                fontSize={Math.min(12, (a / maxCm) * h * 0.6)}
                fill="#444441"
                pointerEvents="none"
              >
                {rotulo}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}

export interface PlanoPerfil {
  /** Posição no sentido do salto, em metros a partir do centro (entrada negativa). */
  yM: number;
  /** A pilha do 1º plano, ou uma vara reta na altura dada. */
  pecas?: PecaMontagem[];
  alturaCm?: number | null;
  tracejado?: boolean;
}

interface PerfilProps {
  planos: PlanoPerfil[];
  /** Extensão na profundidade, em metros (frente → trás). */
  deM: number;
  ateM: number;
  agua?: { deM: number; ateM: number } | null;
  caixa: Caixa;
  maxCm: number;
  traco: number;
  selecionada?: number | null;
  corSelecao?: string;
}

/**
 * Perfil, com a aproximação à esquerda. A vara inclinada aparece pelas
 * duas pontas (cheia a da esquerda, vazada a da direita); reta, um ponto.
 */
export function VistaPerfil({ planos, deM, ateM, agua, caixa, maxCm, traco, selecionada = null, corSelecao = '#378add' }: PerfilProps) {
  const { x, y, w, h } = caixa;
  const folga = w * 0.18;
  const vao = Math.max(0.01, ateM - deM);
  const xDe = (m: number) => x + folga + ((m - deM) / vao) * (w - 2 * folga);
  const yDe = (cm: number) => y + h - (cm / maxCm) * h;
  const r = traco * 1.5;
  const poste = traco * 1.2;
  return (
    <g>
      <line x1={x} y1={y + h} x2={x + w} y2={y + h} stroke={COR_POSTE} strokeWidth={traco * 0.6} />
      {agua && (
        <rect
          x={xDe(agua.deM)}
          y={y + h - traco * 1.6}
          width={Math.max(traco, xDe(agua.ateM) - xDe(agua.deM))}
          height={traco * 1.6}
          fill={COR_AGUA}
        />
      )}
      {planos.map((pl, i) => {
        const px = xDe(pl.yM);
        const topo = pl.pecas ? Math.max(0, ...pl.pecas.map(topoPeca)) : pl.alturaCm ?? 0;
        const alto = Math.min(maxCm, topo + 12);
        return (
          <g key={i}>
            <rect x={px - poste / 2} y={yDe(alto)} width={poste} height={(alto / maxCm) * h} fill={COR_POSTE} />
            {pl.pecas?.map((p, k) => {
              const sel = i === 0 && k === selecionada;
              if (p.tipo === 'vara') {
                const cor = sel ? corSelecao : COR_VARA;
                return (
                  <g key={k}>
                    <circle cx={px - r * 1.2} cy={yDe(p.esq)} r={r} fill={cor} />
                    {p.dir !== p.esq && (
                      <circle cx={px - r * 1.2} cy={yDe(p.dir)} r={r * 0.8} fill="none" stroke={cor} strokeWidth={r * 0.45} />
                    )}
                  </g>
                );
              }
              const t = topoPeca(p);
              return (
                <rect
                  key={k}
                  x={px - r * 2.2}
                  y={yDe(t)}
                  width={p.tipo === 'muro' ? r * 2.4 : r * 1.6}
                  height={(Math.min(t, alturaCorpo(p)) / maxCm) * h}
                  fill={p.tipo === 'muro' ? COR_MURO : COR_SOLIDA}
                  stroke={sel ? corSelecao : COR_TRACO}
                  strokeWidth={traco * 0.4}
                />
              );
            })}
            {!pl.pecas && pl.alturaCm != null && (
              <circle
                cx={px + r * 1.2}
                cy={yDe(pl.alturaCm)}
                r={r}
                fill={pl.tracejado ? 'none' : COR_VARA}
                stroke={COR_VARA}
                strokeWidth={pl.tracejado ? r * 0.45 : 0}
                strokeDasharray={pl.tracejado ? `${r * 0.5} ${r * 0.4}` : undefined}
              />
            )}
          </g>
        );
      })}
    </g>
  );
}

/**
 * Os planos do obstáculo para o perfil: o 1º com a pilha, os outros com
 * uma vara na altura do elemento, repartidos na largura.
 */
export function planosDoObstaculo(o: Obstacle, viraOxer = false): {
  planos: PlanoPerfil[];
  deM: number;
  ateM: number;
  agua: { deM: number; ateM: number } | null;
} {
  const largura = o.spreadM ?? 0;
  const n = o.elements.length;
  const ext = obstacleExtent(o);
  const planos: PlanoPerfil[] = [{ yM: -largura / 2, pecas: montagemDe(o).pecas }];
  for (let i = 1; i < n; i++) {
    const h = o.elements[i]?.height;
    planos.push({ yM: -largura / 2 + (largura * i) / (n - 1), alturaCm: h == null ? null : Math.round(h * 100) });
  }
  // No sistema local o cavalo salta para −Y: no sentido do salto, a
  // profundidade troca de sinal (a entrada fica em +Y).
  let deM = Math.min(-ext.backM, -largura / 2);
  let ateM = Math.max(-ext.frontM, largura / 2);
  if (viraOxer) {
    // O vertical que vira oxer no desempate: a vara de trás, tracejada,
    // na largura padrão do oxer (a real não está no croqui).
    const topo = Math.max(0, ...montagemDe(o).pecas.map(topoPeca));
    planos.push({ yM: largura / 2 + 1.5, alturaCm: topo, tracejado: true });
    ateM = Math.max(ateM, largura / 2 + 1.5);
  }
  if (ateM - deM < 0.6) {
    const c = (ateM + deM) / 2;
    deM = c - 0.3;
    ateM = c + 0.3;
  }
  const agua = o.liverpool.enabled
    ? { deM: -o.liverpool.offsetM - o.liverpool.spreadM / 2, ateM: -o.liverpool.offsetM + o.liverpool.spreadM / 2 }
    : null;
  return { planos, deM, ateM, agua };
}
