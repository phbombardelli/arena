import { createRoot, type Root } from 'react-dom/client';
import { flushSync } from 'react-dom';
import type { CourseDocument } from '@core/model/types';
import { pageSize } from '@core/scale/units';
import { RenderDocument } from '@render/renderDocument';
import { FolhaEspecificacao } from '@render/FolhaEspecificacao';
import type { PaginaDaSaida } from '@core/library/paginas';

export { paginasDaSaida, type PaginaDaSaida } from '@core/library/paginas';

/**
 * Monta o SVG no modo papel em um contêiner fora da tela e entrega o
 * elemento vivo. Precisa estar no documento — não basta `display:none` —
 * porque o conversor para PDF depende de getBBox/getComputedTextLength,
 * que só existem em elementos com layout.
 */
export interface PaperSvgHandle {
  svg: SVGSVGElement;
  widthMm: number;
  heightMm: number;
  dispose: () => void;
}

export function buildPaperSvg(doc: CourseDocument, vista: PaginaDaSaida = 'ambos'): PaperSvgHandle {
  const { widthMm, heightMm } = pageSize(doc.page);

  const host = document.createElement('div');
  host.setAttribute('data-paper-host', '');
  host.style.cssText =
    'position:fixed;left:-20000px;top:0;width:1px;height:1px;overflow:visible;opacity:0;pointer-events:none';
  document.body.appendChild(host);

  let root: Root | null = createRoot(host);
  flushSync(() => {
    root!.render(
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={`${widthMm}mm`}
        height={`${heightMm}mm`}
        viewBox={`0 0 ${widthMm} ${heightMm}`}
      >
        {vista === 'especificacao' ? (
          <FolhaEspecificacao doc={doc} />
        ) : (
          <RenderDocument
            mode="paper"
            doc={doc}
            vista={vista}
            selection={[]}
            viewBoxMm={{ x: 0, y: 0, width: widthMm, height: heightMm }}
            metersPerPixel={0}
            showPageFrame={false}
          />
        )}
      </svg>,
    );
  });

  const svg = host.querySelector('svg');
  if (!svg) {
    root.unmount();
    host.remove();
    throw new Error('Falha ao montar o SVG do papel.');
  }

  return {
    svg,
    widthMm,
    heightMm,
    dispose: () => {
      root?.unmount();
      root = null;
      host.remove();
    },
  };
}
