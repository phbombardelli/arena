import {
  isArenaTemplate,
  TEMPLATE_EXTENSION,
  type ArenaTemplate,
} from '@core/library/arenaTemplate';
import { idbAll, idbDelete, idbPut } from './idb';

/**
 * "Minhas pistas" (B-77, decisão 88).
 *
 * Moram no banco local do navegador (IndexedDB). Uma cópia fica em memória
 * para a lista abrir na hora; gravar atualiza a cópia e o banco. Não
 * substitui o arquivo: o `.pista` continua sendo o que se leva para outro
 * computador.
 *
 * Antes moravam no localStorage, que cabia ~5 MB. Na primeira abertura
 * depois da troca, o que estava lá é copiado para o banco — e o original
 * fica onde estava, por segurança.
 */

const CHAVE_ANTIGA = 'percurso.pistas.v1';
const MIGRADO = 'percurso.pistas.migrado-idb';

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

let locais: ArenaTemplate[] = [];
let iniciando: Promise<void> | null = null;

/** Carrega "Minhas pistas" do banco (e migra as antigas). Uma vez só. */
export function initTemplateStore(): Promise<void> {
  iniciando ??= (async () => {
    try {
      let guardadas = (await idbAll<ArenaTemplate>('pistas')).filter(isArenaTemplate);
      if (!window.localStorage.getItem(MIGRADO)) {
        const antigas = lerAntigas();
        const ids = new Set(guardadas.map((t) => t.id));
        for (const t of antigas) if (!ids.has(t.id)) await idbPut('pistas', t);
        window.localStorage.setItem(MIGRADO, '1');
        if (antigas.length) guardadas = (await idbAll<ArenaTemplate>('pistas')).filter(isArenaTemplate);
      }
      locais = guardadas;
    } catch (err) {
      // Navegador sem IndexedDB (raro): fica com o que havia no localStorage.
      console.warn('Banco local indisponível; usando o armazenamento antigo.', err);
      locais = lerAntigas();
    }
  })();
  return iniciando;
}

function lerAntigas(): ArenaTemplate[] {
  try {
    const cru = window.localStorage.getItem(CHAVE_ANTIGA);
    if (!cru) return [];
    const lista = JSON.parse(cru);
    return Array.isArray(lista) ? lista.filter(isArenaTemplate) : [];
  } catch {
    // Repositório corrompido não pode impedir o programa de abrir.
    return [];
  }
}

const ler = (): ArenaTemplate[] => locais;

/* ------------------------------------------- banco de pistas embutido */

/**
 * Pistas que vêm com o programa (B-49): arquivos `.pista` publicados em
 * `public/pistas/`, listados em `index.json`. Carregam uma vez, quando o
 * painel abre, e aparecem ao lado das guardadas neste navegador (ver
 * `visiveis`).
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
  return visiveis()
    .map(({ t, builtin }) => resumo(t, builtin))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

export const getTemplate = (id: string): ArenaTemplate | null =>
  visiveis().find(({ t }) => t.id === id)?.t ?? null;

/**
 * As do programa aparecem sempre; as suas também, menos a cópia velha de
 * uma do programa (mesmo nome, gravada antes dela) — é o caso de quem
 * guardou as pistas antes de elas virem com o programa e de elas serem
 * corrigidas (decisão 88).
 */
function visiveis(): { t: ArenaTemplate; builtin: boolean }[] {
  const doPrograma = new Map(embutidas.map((t) => [t.name, t]));
  const minhas = ler().filter((t) => {
    const oficial = doPrograma.get(t.name);
    return !oficial || t.savedAt > oficial.savedAt;
  });
  return [...embutidas.map((t) => ({ t, builtin: true })), ...minhas.map((t) => ({ t, builtin: false }))];
}

/** Grava em "Minhas pistas", substituindo a de mesmo nome se já existir. */
export async function saveTemplate(template: ArenaTemplate): Promise<void> {
  const mesmoNome = locais.filter((t) => t.name === template.name && t.id !== template.id);
  try {
    await idbPut('pistas', template);
    for (const t of mesmoNome) await idbDelete('pistas', t.id);
  } catch {
    throw new TemplateStoreError(
      'Não coube no armazenamento do navegador. Use "Exportar" para guardar a pista em arquivo.',
    );
  }
  locais = [...locais.filter((t) => t.name !== template.name), template];
}

export async function deleteTemplate(id: string): Promise<void> {
  await idbDelete('pistas', id);
  locais = locais.filter((t) => t.id !== id);
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
