import type { FonteDoTitulo } from '@core/model/types';

/**
 * Fontes da caixa de texto (B-106).
 *
 * A padrão é a dos outros textos do croqui (Helvetica no PDF). As outras
 * são fontes abertas (OFL/Apache) comuns no LibreOffice e no Google Fonts,
 * guardadas em public/fonts — só o subconjunto latino, regular, negrito e
 * itálicos. A tela as carrega pelo @font-face; o PDF as embute, porque o
 * jsPDF só conhece Helvetica, Times e Courier.
 */
export interface Fonte {
  id: FonteDoTitulo;
  nome: string;
  /** A família no CSS e no PDF. */
  familia: string;
  /** Pasta em public/fonts; ausente = fonte do sistema. */
  pasta?: string;
}

export const FONTES: readonly Fonte[] = [
  // A mesma dos quadros, números e legendas do croqui.
  { id: 'padrao', nome: 'Padrão', familia: 'Helvetica, Arial, sans-serif' },
  { id: 'arimo', nome: 'Arimo', familia: 'Arimo', pasta: 'arimo' },
  { id: 'tinos', nome: 'Tinos', familia: 'Tinos', pasta: 'tinos' },
  { id: 'cousine', nome: 'Cousine', familia: 'Cousine', pasta: 'cousine' },
  { id: 'carlito', nome: 'Carlito', familia: 'Carlito', pasta: 'carlito' },
  { id: 'caladea', nome: 'Caladea', familia: 'Caladea', pasta: 'caladea' },
  { id: 'open-sans', nome: 'Open Sans', familia: 'Open Sans', pasta: 'open-sans' },
  { id: 'noto-sans', nome: 'Noto Sans', familia: 'Noto Sans', pasta: 'noto-sans' },
  { id: 'noto-serif', nome: 'Noto Serif', familia: 'Noto Serif', pasta: 'noto-serif' },
  { id: 'source-sans-3', nome: 'Source Sans', familia: 'Source Sans 3', pasta: 'source-sans-3' },
  { id: 'source-serif-4', nome: 'Source Serif', familia: 'Source Serif 4', pasta: 'source-serif-4' },
  { id: 'roboto', nome: 'Roboto', familia: 'Roboto', pasta: 'roboto' },
  { id: 'lato', nome: 'Lato', familia: 'Lato', pasta: 'lato' },
  { id: 'montserrat', nome: 'Montserrat', familia: 'Montserrat', pasta: 'montserrat' },
];

const PADRAO = FONTES[0]!;
export const fonteDe = (id: string | undefined): Fonte => FONTES.find((f) => f.id === id) ?? PADRAO;

/** A família CSS, com a de reserva do sistema atrás das fontes carregadas. */
export const familiaCss = (id: string | undefined): string => {
  const f = fonteDe(id);
  return f.pasta ? `"${f.familia}", ${PADRAO.familia}` : f.familia;
};

const ESTILOS = [
  { peso: 400, estilo: 'normal', pdf: 'normal' },
  { peso: 700, estilo: 'normal', pdf: 'bold' },
  { peso: 400, estilo: 'italic', pdf: 'italic' },
  { peso: 700, estilo: 'italic', pdf: 'bolditalic' },
] as const;

const arquivo = (pasta: string, peso: number, estilo: string): string =>
  `${import.meta.env.BASE_URL}fonts/${pasta}/${peso}-${estilo}.ttf`;

/** As regras @font-face das fontes abertas (a tela e o iframe da impressão). */
export function cssDasFontes(exibe: 'swap' | 'block' = 'block'): string {
  return FONTES.filter((f) => f.pasta)
    .flatMap((f) =>
      ESTILOS.map(
        (e) =>
          `@font-face{font-family:"${f.familia}";font-weight:${e.peso};font-style:${e.estilo};font-display:${exibe};` +
          `src:url("${new URL(arquivo(f.pasta!, e.peso, e.estilo), location.href).href}") format("truetype");}`,
      ),
    )
    .join('\n');
}

/**
 * Declara as fontes abertas para a tela, uma vez. O navegador só baixa o
 * arquivo de uma fonte quando algum texto a usa.
 */
let declaradas = false;
export function declaraFontes(): void {
  if (declaradas || typeof document === 'undefined') return;
  declaradas = true;
  const css = cssDasFontes('swap');
  const el = document.createElement('style');
  el.dataset.fontes = 'arena';
  el.textContent = css;
  document.head.appendChild(el);
}

/** Garante que as fontes pedidas já carregaram (antes de medir ou imprimir). */
export async function carregaFontes(ids: Iterable<string>): Promise<void> {
  declaraFontes();
  if (typeof document === 'undefined' || !document.fonts) return;
  const pedidos: Promise<unknown>[] = [];
  for (const id of new Set(ids)) {
    const f = fonteDe(id);
    if (!f.pasta) continue;
    for (const e of ESTILOS) pedidos.push(document.fonts.load(`${e.estilo} ${e.peso} 10px "${f.familia}"`).catch(() => null));
  }
  await Promise.all(pedidos);
}

interface PdfComFontes {
  addFileToVFS(nome: string, base64: string): unknown;
  addFont(arquivo: string, familia: string, estilo: string): unknown;
  getFontList(): Record<string, string[]>;
}

const base64Cache = new Map<string, Promise<string>>();

function emBase64(url: string): Promise<string> {
  let p = base64Cache.get(url);
  if (!p) {
    p = fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`fonte ${url}: ${r.status}`);
        return r.arrayBuffer();
      })
      .then((buf) => {
        const bytes = new Uint8Array(buf);
        let s = '';
        for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        return btoa(s);
      });
    base64Cache.set(url, p);
    p.catch(() => base64Cache.delete(url));
  }
  return p;
}

/**
 * Embute no PDF as fontes abertas que as caixas usam. Uma fonte que não
 * carregar (sem rede, por exemplo) cai na Helvetica: o PDF sai do mesmo jeito.
 */
export async function embuteFontes(pdf: PdfComFontes, ids: Iterable<string>): Promise<void> {
  const lista = pdf.getFontList();
  for (const id of new Set(ids)) {
    const f = fonteDe(id);
    if (!f.pasta || lista[f.familia]) continue;
    await Promise.all(
      ESTILOS.map(async (e) => {
        try {
          const nome = `${f.pasta}-${e.peso}-${e.estilo}.ttf`;
          pdf.addFileToVFS(nome, await emBase64(arquivo(f.pasta!, e.peso, e.estilo)));
          pdf.addFont(nome, f.familia, e.pdf);
        } catch {
          /* sem a fonte, o svg2pdf usa a Helvetica */
        }
      }),
    );
  }
}
