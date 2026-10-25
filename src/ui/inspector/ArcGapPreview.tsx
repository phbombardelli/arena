import { useRef, useState } from 'react';
import { ARC_MAX_DEG, arcGapBetween, arcPoints, arcPose, type ArcGap } from '@core/commands/alignOps';
import { obstacleDef } from '@core/library/obstacles';
import type { Vec2 } from '@core/geometry/vec';
import type { Obstacle } from '@core/model/types';
import { mmPerMeter } from '@core/scale/units';
import { ObstacleLayer } from '@render/layers/ObstacleLayer';

/**
 * Prévia da linha em curva (B-81), como a do pé de galinha da ginástica:
 * cada vão em curva é um arco que sai da vara de saída do anterior; o
 * círculo no seguinte se arrasta de lado, sobre o que aquele vão permite,
 * sem mudar a distância. `curvas[i]` diz se o vão i se ajusta assim (o que
 * tem traçado passando pelos dois segue o traçado).
 */

const ESCALA = 400;

interface Props {
  ordenados: Obstacle[];
  curvas: boolean[];
  travado: boolean;
  onAbertura: (indice: number, gap: ArcGap) => void;
}

type Quadro = { min: Vec2; max: Vec2 };

function enquadra(ordenados: Obstacle[], curvas: boolean[]): Quadro {
  const pts: Vec2[] = [];
  ordenados.forEach((o, i) => {
    const r = obstacleDef(o.type).faceWidthM / 2 + 1;
    pts.push({ x: o.pos.x - r, y: o.pos.y - r }, { x: o.pos.x + r, y: o.pos.y + r });
    if (i > 0 && curvas[i - 1]) pts.push(...arcPoints(ordenados[i - 1]!, arcGapBetween(ordenados[i - 1]!, o), 8));
  });
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  return { min: { x: Math.min(...xs), y: Math.min(...ys) }, max: { x: Math.max(...xs), y: Math.max(...ys) } };
}

export function ArcGapPreview({ ordenados, curvas, travado, onAbertura }: Props) {
  const svg = useRef<SVGSVGElement | null>(null);
  const [arrasto, setArrasto] = useState<{ indice: number; quadro: Quadro } | null>(null);
  const atual = enquadra(ordenados, curvas);
  // Arrastando, o enquadramento fica parado, para a prévia não fugir do dedo.
  const quadro = arrasto?.quadro ?? atual;
  const k = mmPerMeter(ESCALA);
  const pad = 3;
  const origemMm = { x: -quadro.min.x * k + pad, y: -quadro.min.y * k + pad };
  const largura = (quadro.max.x - quadro.min.x) * k + pad * 2;
  const altura = (quadro.max.y - quadro.min.y) * k + pad * 2;
  const tela = (p: Vec2) => ({ x: origemMm.x + p.x * k, y: origemMm.y + p.y * k });

  const paraModelo = (e: React.PointerEvent): Vec2 | null => {
    const m = svg.current?.getScreenCTM();
    if (!m) return null;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return { x: (p.x - origemMm.x) / k, y: (p.y - origemMm.y) / k };
  };

  const move = (e: React.PointerEvent) => {
    if (!arrasto) return;
    const alvo = paraModelo(e);
    const a = ordenados[arrasto.indice];
    const b = ordenados[arrasto.indice + 1];
    if (!alvo || !a || !b) return;
    const { gapM, angleDeg } = arcGapBetween(a, b);
    // A abertura cujo salto cai mais perto do dedo; a distância não muda.
    let melhor = angleDeg;
    let menor = Infinity;
    for (let g = -ARC_MAX_DEG; g <= ARC_MAX_DEG; g += 1) {
      const pose = arcPose(a, (b.spreadM ?? 0) / 2, { gapM, angleDeg: g });
      const d = Math.hypot(pose.pos.x - alvo.x, pose.pos.y - alvo.y);
      if (d < menor) {
        menor = d;
        melhor = g;
      }
    }
    if (Math.round(melhor) !== Math.round(angleDeg)) onAbertura(arrasto.indice, { gapM, angleDeg: melhor });
  };

  return (
    <div className="arc-preview">
      <svg
        ref={svg}
        viewBox={`0 0 ${largura} ${altura}`}
        preserveAspectRatio="xMidYMid meet"
        onPointerMove={move}
        onPointerUp={() => setArrasto(null)}
        onPointerLeave={() => setArrasto(null)}
      >
        <rect width={largura} height={altura} fill="#ffffff" />
        {ordenados.slice(1).map((b, i) => {
          if (!curvas[i]) return null;
          const pts = arcPoints(ordenados[i]!, arcGapBetween(ordenados[i]!, b)).map(tela);
          return (
            <polyline
              key={b.id}
              points={pts.map((p) => `${p.x},${p.y}`).join(' ')}
              fill="none"
              stroke="#333"
              strokeWidth={0.3}
              strokeDasharray="0.6 0.6"
            />
          );
        })}
        {ordenados.map((o) => (
          <ObstacleLayer key={o.id} obstacle={o} printScale={ESCALA} originMm={origemMm} />
        ))}
        {!travado &&
          ordenados.slice(1).map((b, i) => {
            if (!curvas[i] || b.locked) return null;
            const c = tela(b.pos);
            const graus = Math.round(arcGapBetween(ordenados[i]!, b).angleDeg);
            return (
              <g key={b.id}>
                <text x={c.x} y={c.y - 6} className="gym-angle" textAnchor="middle">
                  {Math.abs(graus)}°
                </text>
                <circle
                  className="gym-handle"
                  cx={c.x}
                  cy={c.y}
                  r={3.5}
                  onPointerDown={(e) => {
                    (e.target as Element).setPointerCapture?.(e.pointerId);
                    setArrasto({ indice: i, quadro: atual });
                  }}
                >
                  <title>Arraste para abrir ou fechar a curva; a distância fica a mesma</title>
                </circle>
              </g>
            );
          })}
      </svg>
    </div>
  );
}
