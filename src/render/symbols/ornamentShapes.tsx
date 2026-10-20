import type { OrnamentType } from '@core/model/types';

/**
 * Desenho de cada ornamento em vista superior, num sistema local de raio 1.
 * O chamador escala para o tamanho real e aplica posição e rotação.
 *
 * Sem <symbol>/<use>: o conversor para PDF perde o conteúdo deles
 * (docs/DECISOES.md, decisão 6).
 */
export function OrnamentShape({ type, color }: { type: OrnamentType; color: string }) {
  switch (type) {
    case 'arvore':
      return (
        <g>
          <path d={scallop(1, 9)} fill={color} stroke={darken(color)} strokeWidth={0.04} />
          <circle r={0.16} fill={darken(color)} />
        </g>
      );
    case 'arbusto':
      return (
        <g fill={color} stroke={darken(color)} strokeWidth={0.05}>
          <circle cx={-0.38} cy={0.12} r={0.55} />
          <circle cx={0.38} cy={0.12} r={0.5} />
          <circle cx={0} cy={-0.3} r={0.6} />
        </g>
      );
    case 'vaso':
      return (
        <g>
          <rect x={-1} y={-1} width={2} height={2} rx={0.18} fill="#efe7d8" stroke={color} strokeWidth={0.12} />
          <path d={scallop(0.66, 7)} fill="#5a9448" stroke="#3f7d3f" strokeWidth={0.04} />
        </g>
      );
    case 'cerca':
      return (
        <g stroke={color} strokeWidth={0.12} fill="none">
          <line x1={-1} y1={0} x2={1} y2={0} />
          {[-1, -0.5, 0, 0.5, 1].map((x) => (
            <line key={x} x1={x} y1={-0.22} x2={x} y2={0.22} />
          ))}
        </g>
      );
    case 'cronometro':
      return (
        <g>
          <circle r={1} fill="#ffffff" stroke={color} strokeWidth={0.16} />
          <line x1={0} y1={0} x2={0} y2={-0.62} stroke={color} strokeWidth={0.12} />
          <line x1={0} y1={0} x2={0.45} y2={0.2} stroke={color} strokeWidth={0.12} />
        </g>
      );
    case 'seta':
    case 'entrada':
    case 'saida':
      return (
        <g fill={color}>
          <rect x={-1} y={-0.12} width={1.5} height={0.24} />
          <path d="M 0.4 -0.42 L 1 0 L 0.4 0.42 Z" />
        </g>
      );
  }
}

/** Contorno recortado, para copa de árvore e folhagem de vaso. */
function scallop(radius: number, lobes: number): string {
  const pts: string[] = [];
  const steps = lobes * 6;
  for (let i = 0; i < steps; i += 1) {
    const t = (i / steps) * Math.PI * 2;
    const r = radius * (0.86 + 0.14 * Math.cos(t * lobes));
    const x = Math.cos(t) * r;
    const y = Math.sin(t) * r;
    pts.push(`${i === 0 ? 'M' : 'L'} ${round(x)} ${round(y)}`);
  }
  return `${pts.join(' ')} Z`;
}

const round = (v: number): number => Math.round(v * 1000) / 1000;

/** Escurece uma cor #rrggbb para o contorno, sem depender de CSS. */
function darken(hex: string, factor = 0.72): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1]!, 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) =>
    Math.max(0, Math.round(v * factor)),
  );
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}
