import type { Vec2 } from '@core/geometry/vec';
import type { Ornament } from '@core/model/types';
import { mmPerMeter } from '@core/scale/units';
import { OrnamentShape } from '@render/symbols/ornamentShapes';
import { rotuloDoPortao } from '@core/library/ornaments';
import { font, text } from '@render/style/tokens';

interface Props {
  ornament: Ornament;
  printScale: number;
  originMm: Vec2;
  onPointerDown?: (e: React.PointerEvent) => void;
}

export function OrnamentLayer({ ornament, printScale, originMm, onPointerDown }: Props) {
  const k = mmPerMeter(printScale);
  const x = originMm.x + ornament.pos.x * k;
  const y = originMm.y + ornament.pos.y * k;
  // A forma é desenhada em raio 1; escala leva ao tamanho real em papel.
  const s = (ornament.sizeM / 2) * k;

  // Entrada e saída escrevem o papel do lado de fora da pista (a conta é do
  // core, para a folha saber onde o rótulo cai).
  const r = rotuloDoPortao(ornament, k);
  const rotulo = r ? { x: originMm.x + r.centro.x * k, y: originMm.y + r.centro.y * k, texto: r.texto } : null;

  return (
    <g data-object={ornament.id} data-kind="ornament">
      <g
        transform={`translate(${round(x)} ${round(y)}) rotate(${ornament.rotation}) scale(${round(s)})`}
        onPointerDown={onPointerDown}
        style={{ cursor: 'move' }}
      >
        <OrnamentShape type={ornament.type} color={ornament.color} />
      </g>
      {rotulo && (
        <text
          x={round(rotulo.x)}
          y={round(rotulo.y)}
          fontFamily={font.family}
          fontSize={text.small}
          fontWeight="bold"
          fill={ornament.color}
          textAnchor="middle"
          dominantBaseline="middle"
          pointerEvents="none"
        >
          {rotulo.texto}
        </text>
      )}
    </g>
  );
}

const round = (v: number): number => Math.round(v * 1000) / 1000;
