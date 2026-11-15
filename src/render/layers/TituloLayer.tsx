import type { BordaDaCaixa, TituloDaFolha } from '@core/model/types';
import { TITULO_LINHA, tituloLayout } from '@core/model/annotationLayout';
import { declaraFontes, familiaCss } from '../fontes';

interface Props {
  titulo: TituloDaFolha;
  /** Enquanto se edita no lugar, o texto some e fica só a caixa de edição. */
  editando?: boolean;
  onPointerDown?: (e: React.PointerEvent) => void;
}

declaraFontes();

/** O traço da borda: tracejado e pontilhado proporcionais à espessura. */
export function tracoDaBorda(b: BordaDaCaixa): string | undefined {
  const e = Math.max(0.1, b.espessuraMm);
  if (b.estilo === 'tracejada') return `${e * 4} ${e * 2.5}`;
  if (b.estilo === 'pontilhada') return `${e} ${e * 1.8}`;
  return undefined;
}

/** Recuo do texto em relação às bordas da caixa. */
export const recuoDoTexto = (t: TituloDaFolha): number => tituloLayout(t).padMm + (t.borda ? t.borda.espessuraMm : 0);

/**
 * Caixa de texto da folha (B-106). Flutua por cima de tudo. Sem borda nem
 * fundo, no papel sai só o texto; na tela, um retângulo transparente por
 * baixo deixa pegar a caixa também entre as letras.
 */
export function TituloLayer({ titulo, editando, onPointerDown }: Props) {
  const l = tituloLayout(titulo);
  const recuo = recuoDoTexto(titulo);
  const x =
    titulo.align === 'middle' ? titulo.posMm.x + l.widthMm / 2
    : titulo.align === 'end' ? titulo.posMm.x + l.widthMm - recuo
    : titulo.posMm.x + recuo;
  const linha = titulo.sizeMm * TITULO_LINHA;
  const b = titulo.borda;
  return (
    <g
      data-object={titulo.id}
      data-kind="titulo"
      onPointerDown={onPointerDown}
      style={{ cursor: titulo.locked ? 'default' : 'move' }}
    >
      {(onPointerDown || titulo.fundo || b) && (
        <rect
          x={titulo.posMm.x + (b ? b.espessuraMm / 2 : 0)}
          y={titulo.posMm.y + (b ? b.espessuraMm / 2 : 0)}
          width={Math.max(0.1, l.widthMm - (b ? b.espessuraMm : 0))}
          height={Math.max(0.1, l.heightMm - (b ? b.espessuraMm : 0))}
          fill={titulo.fundo ?? (onPointerDown ? 'transparent' : 'none')}
          stroke={b ? b.cor : 'none'}
          strokeWidth={b ? b.espessuraMm : undefined}
          strokeDasharray={b ? tracoDaBorda(b) : undefined}
        />
      )}
      {!editando && (
        <text
          x={x}
          fontFamily={familiaCss(titulo.fonte)}
          fontSize={titulo.sizeMm}
          fontWeight={titulo.bold ? 700 : 400}
          fontStyle={titulo.italic ? 'italic' : 'normal'}
          fill={titulo.color}
          textAnchor={titulo.align}
        >
          {l.linhas.map((t, i) => (
            <tspan key={i} x={x} y={titulo.posMm.y + l.padMm + (b ? b.espessuraMm : 0) + linha * i + titulo.sizeMm * 0.95}>
              {t || ' '}
            </tspan>
          ))}
        </text>
      )}
    </g>
  );
}
