/**
 * Avisos de mudança nas bibliotecas locais (B-78): quem sincroniza com a
 * nuvem escuta aqui, sem as bibliotecas precisarem conhecer a nuvem.
 */
export interface LocalChange {
  tipo: 'pista' | 'percurso';
  id: string;
  apagado: boolean;
}

const ouvintes = new Set<(m: LocalChange) => void>();

export function onLocalChange(f: (m: LocalChange) => void): () => void {
  ouvintes.add(f);
  return () => ouvintes.delete(f);
}

export function notifyLocalChange(m: LocalChange): void {
  for (const f of ouvintes) f(m);
}
