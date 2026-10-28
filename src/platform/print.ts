import type { CourseDocument } from '@core/model/types';
import { buildPaperSvg } from './paperSvg';
import { t } from '@core/i18n/i18n';

/**
 * Impressão direta pelo navegador, também vetorial. Rota secundária ao
 * PDF: usa o mesmo SVG do modo papel, isolado em um iframe com `@page`
 * do tamanho exato da folha, para o navegador não reescalar nada.
 */
export function printDocument(doc: CourseDocument): void {
  const handle = buildPaperSvg(doc);
  const markup = new XMLSerializer().serializeToString(handle.svg);
  handle.dispose();

  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.appendChild(frame);

  const win = frame.contentWindow;
  const docFrame = frame.contentDocument;
  if (!win || !docFrame) {
    frame.remove();
    return;
  }

  docFrame.open();
  docFrame.write(`<!doctype html><html><head><meta charset="utf-8">
<title>${t('aviso.croqui')}</title>
<style>
  @page { size: ${handle.widthMm}mm ${handle.heightMm}mm; margin: 0; }
  html, body { margin: 0; padding: 0; }
  svg { display: block; }
  /* O Chrome remove fundos na impressão se "gráficos de segundo plano"
     estiver desligado; isto força a fidelidade de cor. */
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
</style></head><body>${markup}</body></html>`);
  docFrame.close();

  const cleanup = () => window.setTimeout(() => frame.remove(), 1000);
  win.addEventListener('afterprint', cleanup, { once: true });
  window.setTimeout(() => {
    win.focus();
    win.print();
    // Navegadores que não disparam afterprint não deixam o iframe órfão.
    window.setTimeout(cleanup, 60_000);
  }, 100);
}
