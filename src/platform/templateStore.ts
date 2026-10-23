import {
  isArenaTemplate,
  TEMPLATE_EXTENSION,
  type ArenaTemplate,
} from '@core/library/arenaTemplate';

/**
 * Repositório local de pistas.
 *
 * Fica no `localStorage`: é o único armazenamento persistente disponível
 * sem servidor, e o requisito é funcionar offline. Não substitui o arquivo
 * — o repositório é conveniência da máquina, e o `.pista` é o que se leva
 * para outro computador ou se guarda em backup.
 *
 * A cota do `localStorage` gira em torno de 5 MB, e uma imagem de satélite
 * embutida estoura isso sozinha. Por isso a gravação avisa em vez de
 * falhar em silêncio, e a exportação em arquivo continua sempre à mão.
 */

const CHAVE = 'percurso.pistas.v1';

export class TemplateStoreError extends Error {}

export interface TemplateSummary {
  id: string;
  name: string;
  savedAt: string;
  widthM: number;
  heightM: number;
  objectCount: number;
  /** Tamanho aproximado em kB, para o usuário entender o custo. */
  sizeKB: number;
  /** Vem com o programa (banco de pistas): todos veem, ninguém apaga. */
  builtin: boolean;
}

/* ------------------------------------------- banco de pistas embutido */

/**
 * Pistas que vêm com o programa (B-49): arquivos `.pista` publicados em
 * `public/pistas/`, listados em `index.json`. Carregam uma vez, quando o
 * painel abre, e somam-se às guardadas neste navegador. Uma pista local
 * com o mesmo nome tem a preferência — é a versão que o usuário mexeu.
 */
let embutidas: ArenaTemplate[] = [];
let carregando: Promise<void> | null = null;

export function loadBuiltinTemplates(): Promise<void> {
  carregando ??= (async () => {
    try {
      const indice = await fetch('pistas/index.json', { cache: 'no-cache' });
      if (!indice.ok) return;
      const nomes: unknown = await indice.json();
      if (!Array.isArray(nomes)) return;
      const lidas = await Promise.all(
        nomes
          .filter((n): n is string => typeof n === 'string')
          .map(async (n) => {
            try {
              const r = await fetch(`pistas/${encodeURIComponent(n)}`);
              const v: unknown = r.ok ? await r.json() : null;
              return isArenaTemplate(v) ? v : null;
            } catch {
              return null;
            }
          }),
      );
      embutidas = lidas.filter((t): t is ArenaTemplate => t !== null);
    } catch {
      // Sem internet ou sem banco publicado: fica só o repositório local.
    }
  })();
  return carregando;
}

function ler(): ArenaTemplate[] {
  try {
    const cru = window.localStorage.getItem(CHAVE);
    if (!cru) return [];
    const lista = JSON.parse(cru);
    return Array.isArray(lista) ? lista.filter(isArenaTemplate) : [];
  } catch {
    // Repositório corrompido não pode impedir o programa de abrir.
    return [];
  }
}

function gravar(lista: ArenaTemplate[]): void {
  try {
    window.localStorage.setItem(CHAVE, JSON.stringify(lista));
  } catch {
    throw new TemplateStoreError(
      'Não coube no repositório do navegador. ' +
        'Provavelmente a imagem de fundo é grande demais — use "Exportar pista" ' +
        'para guardar em arquivo.',
    );
  }
}

const resumo = (t: ArenaTemplate, builtin: boolean): TemplateSummary => ({
  id: t.id,
  name: t.name,
  savedAt: t.savedAt,
  widthM: t.summary?.widthM ?? 0,
  heightM: t.summary?.heightM ?? 0,
  objectCount: t.summary?.objectCount ?? t.objects.length,
  sizeKB: Math.round(JSON.stringify(t).length / 1024),
  builtin,
});

export function listTemplates(): TemplateSummary[] {
  const locais = ler();
  const nomesLocais = new Set(locais.map((t) => t.name));
  return [
    ...locais.map((t) => resumo(t, false)),
    ...embutidas.filter((t) => !nomesLocais.has(t.name)).map((t) => resumo(t, true)),
  ].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

export const getTemplate = (id: string): ArenaTemplate | null =>
  ler().find((t) => t.id === id) ?? embutidas.find((t) => t.id === id) ?? null;

/** Grava, substituindo o modelo de mesmo nome se já existir. */
export function saveTemplate(template: ArenaTemplate): void {
  const lista = ler().filter((t) => t.name !== template.name);
  lista.push(template);
  gravar(lista);
}

export function deleteTemplate(id: string): void {
  gravar(ler().filter((t) => t.id !== id));
}

/* ------------------------------------------------- arquivo .pista */

export function exportTemplateFile(template: ArenaTemplate): void {
  const texto = JSON.stringify(template, null, 2);
  const url = URL.createObjectURL(new Blob([texto], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${slug(template.name)}${TEMPLATE_EXTENSION}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function importTemplateFile(): Promise<ArenaTemplate | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = `${TEMPLATE_EXTENSION},application/json`;
    input.style.display = 'none';
    document.body.appendChild(input);

    input.addEventListener('change', () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) {
        resolve(null);
        return;
      }
      file
        .text()
        .then((texto) => {
          const valor = JSON.parse(texto);
          if (!isArenaTemplate(valor)) {
            throw new TemplateStoreError('Este arquivo não é um modelo de pista.');
          }
          resolve(valor);
        })
        .catch((err) =>
          reject(
            err instanceof TemplateStoreError
              ? err
              : new TemplateStoreError('Não foi possível ler o modelo de pista.'),
          ),
        );
    });
    input.addEventListener('cancel', () => {
      input.remove();
      resolve(null);
    });
    input.click();
  });
}

const slug = (nome: string): string =>
  nome
    .replace(/ª/g, 'a')
    .replace(/º/g, 'o')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase() || 'pista';
