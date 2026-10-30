/**
 * O que o aparelho lembra dos tutoriais (B-25): se as boas-vindas já
 * apareceram e quais vídeos já foram vistos. Sem armazenamento, nada é
 * lembrado e tudo funciona do mesmo jeito.
 */

const BOAS_VINDAS = 'arena.boasVindas';
const VISTOS = 'arena.tutoriais.vistos';

export function boasVindasVistas(): boolean {
  try {
    return window.localStorage.getItem(BOAS_VINDAS) !== null;
  } catch {
    // Sem armazenamento, não dá para lembrar: melhor não insistir a cada abertura.
    return true;
  }
}

export function marcaBoasVindas(): void {
  try {
    window.localStorage.setItem(BOAS_VINDAS, new Date().toISOString());
  } catch {
    // Sem onde guardar: vale só nesta sessão.
  }
}

export function tutoriaisVistos(): string[] {
  try {
    const lista: unknown = JSON.parse(window.localStorage.getItem(VISTOS) ?? '[]');
    return Array.isArray(lista) ? lista.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function marcaTutorialVisto(id: string): void {
  const vistos = tutoriaisVistos();
  if (vistos.includes(id)) return;
  try {
    window.localStorage.setItem(VISTOS, JSON.stringify([...vistos, id]));
  } catch {
    // Sem onde guardar: a marca não aparece da próxima vez.
  }
}
