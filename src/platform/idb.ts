/**
 * Banco local do navegador (IndexedDB), para "Minhas pistas" e "Meus
 * percursos" (B-77, decisão 88). O localStorage de antes cabia ~5 MB — uma
 * imagem de fundo estourava sozinha. Aqui cabe bem mais, e é a base que a
 * sincronização com a nuvem (B-78) vai usar.
 *
 * Sem dependência: um punhado de funções em volta da API do navegador.
 */

const NOME = 'arena';
const VERSAO = 1;
export type Loja = 'pistas' | 'percursos';

let aberto: Promise<IDBDatabase> | null = null;

function banco(): Promise<IDBDatabase> {
  aberto ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(NOME, VERSAO);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const loja of ['pistas', 'percursos'] as const) {
        if (!db.objectStoreNames.contains(loja)) db.createObjectStore(loja, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return aberto;
}

function pedido<T>(loja: Loja, modo: IDBTransactionMode, faz: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return banco().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(loja, modo);
        const req = faz(tx.objectStore(loja));
        tx.oncomplete = () => resolve(req.result as T);
        tx.onerror = () => reject(tx.error ?? req.error);
        tx.onabort = () => reject(tx.error ?? req.error);
      }),
  );
}

export const idbAll = <T>(loja: Loja): Promise<T[]> => pedido<T[]>(loja, 'readonly', (s) => s.getAll());
export const idbGet = <T>(loja: Loja, id: string): Promise<T | undefined> =>
  pedido<T | undefined>(loja, 'readonly', (s) => s.get(id));
export const idbPut = <T extends { id: string }>(loja: Loja, valor: T): Promise<void> =>
  pedido<void>(loja, 'readwrite', (s) => s.put(valor)).then(() => undefined);
export const idbDelete = (loja: Loja, id: string): Promise<void> =>
  pedido<void>(loja, 'readwrite', (s) => s.delete(id)).then(() => undefined);
