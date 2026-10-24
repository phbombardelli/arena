/**
 * O que fazer para deixar este aparelho e a nuvem iguais (B-78, decisão 90).
 *
 * Lógica pura, sem rede: recebe o que há aqui, o que há lá e quando cada
 * arquivo foi sincronizado pela última vez, e devolve a lista de ações.
 *
 * Regras:
 * - Só de um lado: vai para o outro (a não ser apagado na nuvem).
 * - Iguais (mesma data): nada.
 * - Um lado mais novo: ele vale. Mas se o OUTRO também mudou desde a última
 *   sincronização (editado em dois aparelhos), o mais antigo não se perde:
 *   vira uma cópia.
 * - Apagado na nuvem: apaga aqui — a não ser que aqui tenha mudado depois
 *   da última sincronização; aí volta para a nuvem.
 */

export interface ItemMeta {
  id: string;
  savedAt: string;
}

export interface RemoteMeta extends ItemMeta {
  apagado: boolean;
}

export type SyncAction =
  | { faz: 'baixar'; id: string }
  | { faz: 'enviar'; id: string }
  | { faz: 'apagar-local'; id: string }
  /** Os dois mudaram: a versão daqui vira cópia, e a da nuvem entra no lugar. */
  | { faz: 'copiar-local-e-baixar'; id: string }
  /** Os dois mudaram: a da nuvem vira cópia aqui, e a daqui sobe. */
  | { faz: 'copiar-remota-e-enviar'; id: string };

export function planSync(
  locais: ItemMeta[],
  remotos: RemoteMeta[],
  sincronizado: Record<string, string>,
): SyncAction[] {
  const aqui = new Map(locais.map((i) => [i.id, i]));
  const la = new Map(remotos.map((i) => [i.id, i]));
  const ids = new Set([...aqui.keys(), ...la.keys()]);
  const acoes: SyncAction[] = [];
  for (const id of ids) {
    const l = aqui.get(id);
    const r = la.get(id);
    const s = sincronizado[id];
    const mudouAqui = l !== undefined && (s === undefined || l.savedAt > s);
    const mudouLa = r !== undefined && (s === undefined || r.savedAt > s);
    if (!l && r) {
      if (!r.apagado) acoes.push({ faz: 'baixar', id });
      continue;
    }
    if (l && !r) {
      acoes.push({ faz: 'enviar', id });
      continue;
    }
    if (!l || !r) continue;
    if (r.apagado) {
      acoes.push(mudouAqui && s !== undefined ? { faz: 'enviar', id } : { faz: 'apagar-local', id });
      continue;
    }
    if (l.savedAt === r.savedAt) continue;
    if (r.savedAt > l.savedAt) {
      acoes.push(mudouAqui && s !== undefined ? { faz: 'copiar-local-e-baixar', id } : { faz: 'baixar', id });
    } else {
      acoes.push(mudouLa && s !== undefined ? { faz: 'copiar-remota-e-enviar', id } : { faz: 'enviar', id });
    }
  }
  return acoes;
}
