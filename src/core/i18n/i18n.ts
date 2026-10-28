import { MESSAGES, type MessageKey } from './messages';

/**
 * Língua da interface (B-10). Português por padrão; inglês e espanhol da
 * América do Sul como opção. Toda palavra da tela, da folha e dos avisos
 * sai do catálogo (messages.ts), que segue o glossário (docs/GLOSSARIO.md).
 *
 * A língua é estado do aparelho, não do croqui: o mesmo arquivo abre em
 * português num computador e em espanhol no outro, e a folha impressa segue
 * a língua da tela (decisão 98).
 */

export type Lang = 'pt' | 'en' | 'es';

export const LANGS: readonly { code: Lang; nome: string; sigla: string }[] = [
  { code: 'pt', nome: 'Português', sigla: 'PT' },
  { code: 'en', nome: 'English', sigla: 'EN' },
  { code: 'es', nome: 'Español', sigla: 'ES' },
];

export const isLang = (v: unknown): v is Lang => v === 'pt' || v === 'en' || v === 'es';

let atual: Lang = 'pt';
const ouvintes = new Set<() => void>();

export const getLang = (): Lang => atual;

export function setLang(lang: Lang): void {
  if (lang === atual) return;
  atual = lang;
  ouvintes.forEach((fn) => fn());
}

/** Avisa quando a língua muda; devolve a função que desliga o aviso. */
export function onLangChange(fn: () => void): () => void {
  ouvintes.add(fn);
  return () => ouvintes.delete(fn);
}

export type MessageVars = Record<string, string | number>;

/**
 * O texto de uma chave na língua atual. `{nome}` no texto é trocado pelo
 * valor de `vars.nome`; número entra com o separador decimal da língua.
 */
export function t(key: MessageKey, vars?: MessageVars): string {
  const texto = MESSAGES[key][atual];
  if (!vars) return texto;
  return texto.replace(/\{(\w+)\}/g, (inteiro, nome: string) => {
    const v = vars[nome];
    if (v === undefined) return inteiro;
    return typeof v === 'number' ? formatNumber(v) : v;
  });
}

/**
 * Rótulo que o croqui guarda (campo do quadro, linha de partida, nome da
 * construção): se ainda é o padrão do programa, em qualquer das línguas,
 * sai na língua atual; se o usuário o reescreveu, sai como ele escreveu.
 * É o que faz a folha seguir a língua da tela sem mexer no arquivo.
 */
export function localizeDefault(guardado: string, key: MessageKey): string {
  const m = MESSAGES[key];
  return guardado === m.pt || guardado === m.en || guardado === m.es ? m[atual] : guardado;
}

/** Data curta no formato da língua: 27/10/2026, 27 Oct 2026, 27/10/2026. */
export function formatDate(d: Date): string {
  if (atual === 'en') return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  return d.toLocaleDateString(LOCALE[atual]);
}

const LOCALE: Record<Lang, string> = { pt: 'pt-BR', en: 'en-GB', es: 'es-AR' };

/** Hora curta (14:05) no formato da língua. */
export const formatTime = (d: Date): string => d.toLocaleTimeString(LOCALE[atual], { hour: '2-digit', minute: '2-digit' });

/** Data e hora, para listas de arquivos. */
export const formatDateTime = (d: Date): string => `${formatDate(d)} ${formatTime(d)}`;

/** Vírgula em português e espanhol; ponto em inglês (glossário, seção 8). */
export const decimalSeparator = (): string => (atual === 'en' ? '.' : ',');

/** Número com casas fixas e o separador decimal da língua. */
export function formatDecimal(n: number, decimals: number): string {
  const s = n.toFixed(decimals);
  return atual === 'en' ? s : s.replace('.', ',');
}

/** Número sem casas forçadas: inteiro sai sem decimais. */
export function formatNumber(n: number): string {
  const s = String(Math.round(n * 1000) / 1000);
  return atual === 'en' ? s : s.replace('.', ',');
}
