import type { Vec2 } from '@core/geometry/vec';
import type { TextLabel } from '@core/model/types';
import { mmPerMeter } from '@core/scale/units';

interface Props {
  label: TextLabel;
  printScale: number;
  originMm: Vec2;
  onPointerDown?: (e: React.PointerEvent) => void;
}

/**
 * Texto livre sobre a pista.
 *
 * A POSIÇÃO é do terreno, em metros: o texto acompanha o desenho quando a
 * escala muda, porque ele nomeia um lugar da pista. Já o TAMANHO da letra
 * é de papel, em milímetros, porque legibilidade é do impresso — a mesma
 * regra que vale para toda anotação (decisão 3).
 *
 * A rotação é do texto, não do desenho: quem gira o croqui não quer o
 * texto de cabeça para baixo, então o giro é sempre explícito.
 */
export function TextLayer({ label, printScale, originMm, onPointerDown }: Props) {
  const k = mmPerMeter(printScale);
  const x = originMm.x + label.pos.x * k;
  const y = originMm.y + label.pos.y * k;
  // Shift+Enter quebra a linha (B-68): cada linha desce 1,2 corpo.
  const linhas = label.text.split('\n');

  return (
    <text
      data-object={label.id}
      data-kind="text"
      x={round(x)}
      y={round(y)}
      transform={label.rotation ? `rotate(${label.rotation} ${round(x)} ${round(y)})` : undefined}
      fontSize={label.sizeMm}
      fontFamily="Helvetica, Arial, sans-serif"
      fontWeight={label.bold ? 700 : 400}
      fill={label.color}
      textAnchor={label.align}
      dominantBaseline="middle"
      onPointerDown={onPointerDown}
      style={{ cursor: 'move', userSelect: 'none' }}
    >
      {linhas.length === 1
        ? label.text
        : linhas.map((linha, i) => (
            <tspan key={i} x={round(x)} dy={i === 0 ? 0 : round(label.sizeMm * 1.2)}>
              {linha || ' '}
            </tspan>
          ))}
    </text>
  );
}

const round = (v: number): number => Math.round(v * 1000) / 1000;
