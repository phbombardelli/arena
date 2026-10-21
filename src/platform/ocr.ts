import { labelRect, parseDistance, textForOcr, type MeasureMarkers, type Pixels } from '@core/mapImport/mapImport';

/**
 * Leitura do número da medida do Maps (B-40, decisão 64).
 *
 * O leitor (Tesseract.js) pesa alguns MB e só é baixado aqui, quando o
 * assistente pede — o resto do app nunca o carrega. Lê só o recorte
 * logo abaixo de cada marcador, já em preto sobre branco, o que leva
 * menos de meio segundo depois de carregado. Sem internet (ou se a
 * leitura falhar), devolve null e o assistente pede o número.
 */
export async function readMeasureDistance(img: Pixels, m: MeasureMarkers): Promise<number | null> {
  try {
    const { createWorker, PSM } = await import('tesseract.js');
    const worker = await createWorker('eng');
    try {
      await worker.setParameters({
        tessedit_char_whitelist: '0123456789,.km ',
        tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
      });
      // O Maps escreve a distância total junto do marcador final; o
      // inicial mostra "0". Lê os dois e fica com o primeiro número > 0.
      for (const ponto of [m.b, m.a]) {
        const recorte = textForOcr(img, labelRect(ponto, m.radiusPx, img));
        const canvas = document.createElement('canvas');
        canvas.width = recorte.width;
        canvas.height = recorte.height;
        canvas
          .getContext('2d')!
          .putImageData(new ImageData(new Uint8ClampedArray(recorte.data), recorte.width, recorte.height), 0, 0);
        const { data } = await worker.recognize(canvas);
        const metros = parseDistance(data.text);
        if (metros) return metros;
      }
      return null;
    } finally {
      await worker.terminate();
    }
  } catch (err) {
    console.warn('Leitura automática da medida falhou:', err);
    return null;
  }
}
