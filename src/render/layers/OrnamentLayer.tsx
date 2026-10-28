import type { Vec2 } from '@core/geometry/vec';
import type { Ornament } from '@core/model/types';
import { mmPerMeter } from '@core/scale/units';
import { OrnamentShape } from '@render/symbols/ornamentShapes';
import { gateLabel } from '@core/library/ornaments';
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

  // Entrada e saída escrevem o papel do lado de FORA da pista: atrás da
  // cauda na entrada (que aponta para dentro), além da ponta na saída. O
  // texto não gira, para ler sempre na horizontal.
  const rotulo =
    (ornament.type === 'entrada' || ornament.type === 'saida') && ornament.showLabel
      ? (() => {
          const a = (ornament.rotation * Math.PI) / 180;
          const lado = ornament.type === 'entrada' ? -1 : 1;
          // Afastamento pelo tamanho do próprio texto na direção da seta: com
          // a seta deitada, ENTRADA é comprido e encostava na cauda (B-66).
          const texto = gateLabel(ornament.type);
          const meiaLargura = (texto.length * text.small * 0.74) / 2;
          const meiaAltura = (text.small * 0.75) / 2;
          const alcance = Math.abs(Math.cos(a)) * meiaLargura + Math.abs(Math.sin(a)) * meiaAltura;
          const d = s + 1.8 + alcance;
          return {
            x: x + Math.cos(a) * d * lado,
            y: y + Math.sin(a) * d * lado,
            texto: gateLabel(ornament.type),
          };
        })()
      : null;

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
