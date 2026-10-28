import { jsPDF } from 'jspdf';
import 'svg2pdf.js';
import type { CourseDocument } from '@core/model/types';
import { buildPaperSvg } from './paperSvg';
import { t } from '@core/i18n/i18n';

/**
 * Exportação em PDF **vetorial**: texto continua texto, linhas continuam
 * linhas. O SVG vem da mesma função que desenha a tela (renderDocument),
 * então não há risco de o papel divergir do que se vê.
 */

function makeDoc(widthMm: number, heightMm: number): jsPDF {
  return new jsPDF({
    orientation: widthMm >= heightMm ? 'landscape' : 'portrait',
    unit: 'mm',
    format: [widthMm, heightMm],
    compress: true,
  });
}

async function svgToPdf(svg: SVGSVGElement, widthMm: number, heightMm: number): Promise<jsPDF> {
  const pdf = makeDoc(widthMm, heightMm);
  await pdf.svg(svg, { x: 0, y: 0, width: widthMm, height: heightMm });
  return pdf;
}

/**
 * Ficha do arquivo PDF.
 *
 * Croqui circula por e-mail e acaba numa pasta com dezenas de outros; sem
 * isto ele aparece como "Untitled" na lista do leitor de PDF. O título
 * sai do nome do arquivo, e o assunto declara a escala, que é a primeira
 * coisa que se pergunta ao abrir um croqui de outra pessoa.
 */
function marcarFicha(pdf: jsPDF, doc: CourseDocument, fileName: string): void {
  pdf.setProperties({
    title: fileName.replace(/\.pdf$/i, ''),
    subject: t('aviso.assuntoPdf', { escala: String(doc.page.printScale) }),
    creator: 'Arena',
    keywords: 'salto, percurso, croqui, equitacao',
  });
}

export async function exportDocumentPdf(doc: CourseDocument, fileName: string): Promise<void> {
  const handle = buildPaperSvg(doc);
  try {
    const pdf = await svgToPdf(handle.svg, handle.widthMm, handle.heightMm);
    marcarFicha(pdf, doc, fileName);
    pdf.save(fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`);
  } finally {
    handle.dispose();
  }
}

/** Mesma exportação, devolvida como data URL. Usada na verificação. */
export async function documentPdfDataUrl(doc: CourseDocument): Promise<string> {
  const handle = buildPaperSvg(doc);
  try {
    const pdf = await svgToPdf(handle.svg, handle.widthMm, handle.heightMm);
    marcarFicha(pdf, doc, 'croqui');
    return pdf.output('datauristring');
  } finally {
    handle.dispose();
  }
}

/* ------------------------------------------------------- diagnóstico */

/**
 * Folha de diagnóstico do conversor SVG→PDF. Existe para responder, com
 * um PDF real em mãos, quais recursos são confiáveis - antes de a fase 10
 * construir quadro técnico e tabela em cima de premissas não verificadas.
 * Ver docs/DECISOES.md, decisão 6.
 */
export function buildDiagnosticSvg(): SVGSVGElement {
  const W = 297;
  const H = 210;
  // DOMParser em vez de innerHTML: `innerHTML` em um nó SVG não constrói
  // <symbol>/<use> do mesmo jeito que o React, e o diagnóstico precisa
  // exercitar exatamente o caminho do renderizador real.
  const parsed = new DOMParser().parseFromString(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}">${DIAGNOSTIC_BODY}</svg>`,
    'image/svg+xml',
  );
  return document.importNode(parsed.documentElement, true) as unknown as SVGSVGElement;
}

export async function exportDiagnosticPdf(): Promise<string> {
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-20000px;top:0;opacity:0;pointer-events:none';
  const svg = buildDiagnosticSvg();
  host.appendChild(svg);
  document.body.appendChild(host);
  try {
    const pdf = await svgToPdf(svg, 297, 210);
    return pdf.output('datauristring');
  } finally {
    host.remove();
  }
}

/** PNG 4x4 com quatro cores, para testar a inclusão de imagem raster. */
const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAI0lEQVR42mO4rKCgXX9FUFDwwQEGBjgLKMoAZwFFGeAsoCgAzIsRkcaMB9oAAAAASUVORK5CYII=';

const F = 'Helvetica, Arial, sans-serif';

const DIAGNOSTIC_BODY = `
<rect x="0" y="0" width="297" height="210" fill="#ffffff"/>

<text x="10" y="12" font-family="${F}" font-size="7" fill="#111111">Diagnostico de exportacao PDF</text>
<text x="10" y="19" font-family="${F}" font-size="3.5" fill="#555555">Arena - verificacao da fase 2 - svg2pdf.js + jsPDF</text>
<line x1="10" y1="22" x2="287" y2="22" stroke="#111111" stroke-width="0.5"/>

<text x="10" y="32" font-family="${F}" font-size="3.5" fill="#111111">1. Acentuacao WinAnsi</text>
<text x="10" y="38" font-family="${F}" font-size="4.5" fill="#111111">Percurso · Obstáculo · Combinação · Três · Cavaleiro · Não · Água · Ângulo</text>
<text x="10" y="44" font-family="${F}" font-size="4.5" fill="#111111">ÁÂÃÀÉÊÍÓÔÕÚÜÇ  áâãàéêíóôõúüç  27,80 m  1:250  °  ×  -  x</text>

<text x="10" y="56" font-family="${F}" font-size="3.5" fill="#111111">2. Corpo de texto em mm de papel (1,8 / 2,2 / 2,8 / 3,5 / 5 / 7)</text>
<text x="10" y="62" font-family="${F}" font-size="1.8" fill="#111111">1,8 mm - rotulo da régua de perímetro</text>
<text x="10" y="67" font-family="${F}" font-size="2.2" fill="#111111">2,2 mm - altura do obstáculo</text>
<text x="10" y="73" font-family="${F}" font-size="2.8" fill="#111111">2,8 mm - corpo do quadro técnico</text>
<text x="10" y="80" font-family="${F}" font-size="3.5" fill="#111111">3,5 mm - numero do obstáculo</text>
<text x="10" y="88" font-family="${F}" font-size="5" fill="#111111">5 mm - subtitulo</text>

<text x="10" y="100" font-family="${F}" font-size="3.5" fill="#111111">3. Espessuras (0,13 / 0,25 / 0,35 / 0,5 / 0,7 / 1,0 mm)</text>
<line x1="10" y1="104" x2="120" y2="104" stroke="#111111" stroke-width="0.13"/>
<line x1="10" y1="107" x2="120" y2="107" stroke="#111111" stroke-width="0.25"/>
<line x1="10" y1="110" x2="120" y2="110" stroke="#111111" stroke-width="0.35"/>
<line x1="10" y1="113" x2="120" y2="113" stroke="#111111" stroke-width="0.5"/>
<line x1="10" y1="116" x2="120" y2="116" stroke="#111111" stroke-width="0.7"/>
<line x1="10" y1="119" x2="120" y2="119" stroke="#111111" stroke-width="1"/>

<text x="10" y="130" font-family="${F}" font-size="3.5" fill="#111111">4. Tracejados</text>
<line x1="10" y1="134" x2="120" y2="134" stroke="#6b6b6b" stroke-width="0.35" stroke-dasharray="2.2 1.4"/>
<line x1="10" y1="138" x2="120" y2="138" stroke="#6b6b6b" stroke-width="0.35" stroke-dasharray="0.4 1"/>
<line x1="10" y1="142" x2="120" y2="142" stroke="#6b6b6b" stroke-width="0.35" stroke-dasharray="3 1.2 0.6 1.2"/>
<path d="M 10 152 C 40 138, 90 168, 120 152" fill="none" stroke="#6b6b6b" stroke-width="0.35" stroke-dasharray="2.2 1.4"/>
<text x="62" y="150" font-family="${F}" font-size="2.8" fill="#d32020" text-anchor="middle">27,80</text>

<text x="10" y="166" font-family="${F}" font-size="3.5" fill="#111111">5. Texto rotacionado e ancoragem</text>
<text x="14" y="185" font-family="${F}" font-size="3" fill="#111111" transform="rotate(-90 14 185)">vertical -90°</text>
<text x="30" y="180" font-family="${F}" font-size="3" fill="#111111" transform="rotate(45 30 180)">45°</text>
<text x="60" y="176" font-family="${F}" font-size="3" fill="#111111" text-anchor="start">start</text>
<text x="90" y="176" font-family="${F}" font-size="3" fill="#111111" text-anchor="middle">middle</text>
<text x="120" y="176" font-family="${F}" font-size="3" fill="#111111" text-anchor="end">end</text>
<text x="60" y="183" font-family="${F}" font-size="3" fill="#111111" dominant-baseline="hanging">hanging</text>
<text x="90" y="183" font-family="${F}" font-size="3" fill="#111111" dominant-baseline="middle">middle</text>

<text x="150" y="32" font-family="${F}" font-size="3.5" fill="#111111">6. Grupo rotacionado (obstáculo a 127°)</text>
<g transform="translate(175 52) rotate(127)">
  <rect x="-1.75" y="-0.35" width="3.5" height="0.7" fill="#111111"/>
  <rect x="-1.75" y="1.15" width="3.5" height="0.7" fill="#111111"/>
  <path d="M 0 -3 L 0 -8 M -0.9 -6.6 L 0 -8 L 0.9 -6.6" fill="none" stroke="#111111" stroke-width="0.3"/>
</g>
<text x="181" y="48" font-family="${F}" font-size="3.5" fill="#111111">7</text>
<text x="181" y="58" font-family="${F}" font-size="2.2" fill="#111111">1,53-1,60</text>

<text x="150" y="72" font-family="${F}" font-size="3.5" fill="#111111">7. Grupos repetidos (sem symbol/use)</text>
<g transform="translate(152 76)">
  <line x1="0.25" y1="0.9" x2="7.75" y2="0.9" stroke="#111111" stroke-width="0.5"/>
  <line x1="0.25" y1="3.9" x2="7.75" y2="3.9" stroke="#111111" stroke-width="0.5"/>
</g>
<g transform="translate(166 76)">
  <line x1="0.25" y1="0.9" x2="7.75" y2="0.9" stroke="#111111" stroke-width="0.5"/>
  <line x1="0.25" y1="3.9" x2="7.75" y2="3.9" stroke="#111111" stroke-width="0.5"/>
</g>

<text x="150" y="92" font-family="${F}" font-size="3.5" fill="#111111">8. Path com chanfro (pista)</text>
<path d="M 152 98 L 156 96 L 216 96 L 220 98 L 220 118 L 216 120 L 156 120 L 152 118 Z"
      fill="#ffffff" stroke="#1a1a1a" stroke-width="0.5" stroke-linejoin="round"/>
<line x1="167" y1="96" x2="167" y2="94.5" stroke="#1a1a1a" stroke-width="0.13"/>
<text x="167" y="93.5" font-family="${F}" font-size="1.8" fill="#111111" text-anchor="middle">5</text>
<line x1="182" y1="96" x2="182" y2="94.5" stroke="#1a1a1a" stroke-width="0.13"/>
<text x="182" y="93.5" font-family="${F}" font-size="1.8" fill="#111111" text-anchor="middle">10</text>

<text x="150" y="130" font-family="${F}" font-size="3.5" fill="#111111">9. Imagem raster (4x4 px ampliado)</text>
<image href="${TINY_PNG}" x="152" y="134" width="20" height="20"/>

<text x="150" y="166" font-family="${F}" font-size="3.5" fill="#111111">10. Tabela em SVG nativo (sem foreignObject)</text>
<g stroke="#111111" stroke-width="0.25" fill="none">
  <rect x="152" y="170" width="90" height="24"/>
  <line x1="152" y1="176" x2="242" y2="176"/>
  <line x1="152" y1="182" x2="242" y2="182"/>
  <line x1="152" y1="188" x2="242" y2="188"/>
  <line x1="172" y1="170" x2="172" y2="194"/>
  <line x1="197" y1="170" x2="197" y2="194"/>
  <line x1="222" y1="170" x2="222" y2="194"/>
</g>
<g font-family="${F}" font-size="2.8" fill="#111111">
  <text x="154" y="174.2">Obst.</text>
  <text x="195" y="174.2" text-anchor="end">Elem. 1</text>
  <text x="220" y="174.2" text-anchor="end">Elem. 2</text>
  <text x="240" y="174.2" text-anchor="end">Largura</text>
  <text x="154" y="180.2">3</text>
  <text x="195" y="180.2" text-anchor="end">1,20</text>
  <text x="220" y="180.2" text-anchor="end">1,30</text>
  <text x="240" y="180.2" text-anchor="end">1,50</text>
  <text x="154" y="186.2">4A</text>
  <text x="195" y="186.2" text-anchor="end">1,15</text>
  <text x="220" y="186.2" text-anchor="end">-</text>
  <text x="240" y="186.2" text-anchor="end">-</text>
  <text x="154" y="192.2">4B</text>
  <text x="195" y="192.2" text-anchor="end">1,25</text>
  <text x="220" y="192.2" text-anchor="end">1,40</text>
  <text x="240" y="192.2" text-anchor="end">2,20</text>
</g>

<text x="250" y="130" font-family="${F}" font-size="3.5" fill="#111111">11. Barra de escala</text>
<g>
  <rect x="250" y="134" width="10" height="1.5" fill="#111111"/>
  <rect x="260" y="134" width="10" height="1.5" fill="#ffffff" stroke="#111111" stroke-width="0.13"/>
  <rect x="270" y="134" width="10" height="1.5" fill="#111111"/>
  <text x="250" y="140" font-family="${F}" font-size="2.2" fill="#111111">0</text>
  <text x="270" y="140" font-family="${F}" font-size="2.2" fill="#111111" text-anchor="middle">20</text>
  <text x="280" y="140" font-family="${F}" font-size="2.2" fill="#111111" text-anchor="end">30 m</text>
</g>
<text x="250" y="150" font-family="${F}" font-size="2.8" fill="#111111">Escala 1:250</text>
`;
