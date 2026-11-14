import { t } from '@core/i18n/i18n';
import type { MessageKey } from '@core/i18n/messages';
import type { Montagem, Obstacle, ObstacleType, PecaMontagem, TipoPeca } from '@core/model/types';

/**
 * Montagem do 1º plano do obstáculo (B-108): a pilha de peças, de baixo
 * para cima, cada uma com a altura das duas pontas em centímetros. É o que
 * sai na folha de especificação para quem monta a pista.
 *
 * Os outros planos (a saída do oxer, o meio e a saída da tríplice) têm
 * sempre uma vara reta, na altura do elemento — não entram aqui.
 */

/** Ordem fixa das peças na lista de material. */
export const TIPOS_PECA: readonly TipoPeca[] = ['vara', 'testeira', 'painel', 'portao', 'muro'];

/** Quanto a peça sólida desce a partir do topo, em cm. O muro vai até o chão. */
export const ALTURA_PECA: Record<Exclude<TipoPeca, 'vara' | 'muro'>, number> = {
  testeira: 20,
  painel: 50,
  portao: 70,
};

/** Teto das alturas no editor. */
export const ALTURA_MAX_CM = 200;

/** Distância entre as pontas juntas do leque e as do Z até as varas vizinhas. */
const PASSO_JUNTO = 10;

/** Os tipos que se montam com peças. Os outros não saem na especificação. */
export const temMontagem = (type: ObstacleType): boolean =>
  type === 'vertical' || type === 'oxer' || type === 'triplice' || type === 'muro';

export const solida = (p: PecaMontagem): boolean => p.tipo !== 'vara';

/** Topo da peça (a ponta mais alta). */
export const topoPeca = (p: PecaMontagem): number => Math.max(p.esq, p.dir);

/** Quanto a peça ocupa abaixo do topo, em cm. */
export function alturaCorpo(p: PecaMontagem): number {
  if (p.tipo === 'vara') return 0;
  if (p.tipo === 'muro') return topoPeca(p);
  return ALTURA_PECA[p.tipo];
}

export const topoMontagem = (m: Montagem): number =>
  m.pecas.length === 0 ? 0 : Math.max(...m.pecas.map(topoPeca));

const r5 = (v: number): number => Math.round(v / 5) * 5;
const limita = (v: number): number => Math.max(0, Math.min(ALTURA_MAX_CM, v));
const meio = (p: PecaMontagem): number => (p.esq + p.dir) / 2;

/** Altura do 1º elemento em cm, ou `null` se não informada. */
export function alturaEntradaCm(o: Obstacle): number | null {
  const h = o.elements[0]?.height;
  return h == null ? null : Math.round(h * 100);
}

/**
 * A montagem de quem nunca abriu o editor: varas paralelas até a altura
 * do 1º elemento (uma a cada ~40 cm), ou o muro na altura dele.
 */
export function montagemPadrao(o: Obstacle): Montagem {
  const topo = alturaEntradaCm(o) ?? 100;
  if (o.type === 'muro') return { pecas: [{ tipo: 'muro', esq: topo, dir: topo }] };
  const n = Math.max(2, Math.ceil(topo / 40));
  const pecas: PecaMontagem[] = [];
  for (let j = 1; j <= n; j++) {
    const h = j === n ? topo : r5((topo * j) / n);
    pecas.push({ tipo: 'vara', esq: h, dir: h });
  }
  return { pecas };
}

export const montagemDe = (o: Obstacle): Montagem => o.montagem ?? montagemPadrao(o);

/**
 * A altura do 1º elemento mudou por fora (painel, tabela de alturas): a
 * peça de cima sobe ou desce junto, as de baixo ficam onde estão.
 */
export function ajustaAoTopo(m: Montagem, novoTopo: number): Montagem {
  if (m.pecas.length === 0) return m;
  const topo = topoMontagem(m);
  const k = m.pecas.findIndex((p) => topoPeca(p) === topo);
  const delta = novoTopo - topo;
  const pecas = m.pecas.map((p, i) => (i === k ? { ...p, esq: limita(p.esq + delta), dir: limita(p.dir + delta) } : p));
  return { pecas };
}

/* ---------------------------------------------------------- disposição */

export type Disposicao = 'paralelas' | 'leque-dir' | 'leque-esq' | 'z' | 'z-inv' | 'espacar';

/** Por que a disposição não se aplica; `null` = aplica. */
export function impedimento(m: Montagem, d: Disposicao): 'leque' | 'z' | 'varas' | null {
  const n = m.pecas.filter((p) => p.tipo === 'vara').length;
  if ((d === 'leque-dir' || d === 'leque-esq') && n < 3) return 'leque';
  if ((d === 'z' || d === 'z-inv') && n !== 3) return 'z';
  if (n < 2) return 'varas';
  return null;
}

/**
 * Aplica a disposição às varas, sem tocar nas peças sólidas nem na ordem
 * de montagem. As varas são tomadas pela altura, não pela lista: é o que
 * se vê de frente.
 *
 * - paralelas: retas, repartindo por igual o espaço acima da peça sólida;
 * - leque: do lado que dá nome ao leque as pontas abrem por igual, da vara
 *   de baixo até a de cima; do outro elas ficam juntas, a 10 cm uma da
 *   outra, logo abaixo da de cima (que fica reta);
 * - Z: só com 3 varas — as de cima e de baixo retas, a do meio na diagonal
 *   com cada ponta a 10 cm delas (no Z sobe para a direita);
 * - espaçar igual: reparte as alturas mantendo a inclinação de cada uma.
 */
export function aplicaDisposicao(m: Montagem, d: Disposicao): Montagem {
  if (impedimento(m, d)) return m;
  const pecas = m.pecas.map((p) => ({ ...p }));
  const varas = pecas.filter((p) => p.tipo === 'vara').sort((a, b) => meio(a) - meio(b));
  const n = varas.length;
  const de = varas[0]!;
  const ate = varas[n - 1]!;
  const H = topoPeca(ate);
  const baixo = Math.min(de.esq, de.dir);
  // O espaço das varas começa no topo da peça sólida logo abaixo delas.
  const base = Math.max(0, ...pecas.filter((p) => solida(p) && topoPeca(p) <= baixo).map(topoPeca));

  if (d === 'z' || d === 'z-inv') {
    const meioV = varas[1]!;
    de.esq = de.dir = baixo;
    ate.esq = ate.dir = H;
    const lo = baixo + PASSO_JUNTO;
    const hi = H - PASSO_JUNTO;
    meioV.esq = d === 'z' ? lo : hi;
    meioV.dir = d === 'z' ? hi : lo;
    return { pecas };
  }

  if (d === 'leque-dir' || d === 'leque-esq') {
    const lo = Math.max(base, baixo);
    varas.forEach((p, j) => {
      const aberta = j === n - 1 ? H : r5(lo + ((H - lo) * j) / (n - 1));
      const junta = H - PASSO_JUNTO * (n - 1 - j);
      p.esq = d === 'leque-dir' ? junta : aberta;
      p.dir = d === 'leque-dir' ? aberta : junta;
    });
    return { pecas };
  }

  const topoMeio = meio(ate);
  varas.forEach((p, j) => {
    if (j === n - 1) {
      if (d === 'paralelas') p.esq = p.dir = r5(topoMeio);
      return;
    }
    const h = base + ((topoMeio - base) * (j + 1)) / n;
    if (d === 'espacar') {
      const meiaInclinacao = (p.dir - p.esq) / 2;
      p.esq = limita(r5(h - meiaInclinacao));
      p.dir = limita(r5(h + meiaInclinacao));
    } else {
      p.esq = p.dir = r5(h);
    }
  });
  return { pecas };
}

/** O que a disposição atual parece ser — para o resumo no painel. */
export function disposicaoAtual(m: Montagem): Exclude<Disposicao, 'espacar'> | 'livre' {
  const varas = m.pecas.filter((p) => p.tipo === 'vara');
  if (varas.every((p) => p.esq === p.dir)) return 'paralelas';
  for (const d of ['leque-dir', 'leque-esq', 'z', 'z-inv'] as const) {
    if (impedimento(m, d)) continue;
    const feita = aplicaDisposicao(m, d);
    if (feita.pecas.every((p, i) => p.esq === m.pecas[i]!.esq && p.dir === m.pecas[i]!.dir)) return d;
  }
  return 'livre';
}

/** Espelha esquerda e direita: o obstáculo saltado no sentido contrário. */
export const espelhaMontagem = (m: Montagem): Montagem => ({
  pecas: m.pecas.map((p) => ({ ...p, esq: p.dir, dir: p.esq })),
});

/* -------------------------------------------------------------- material */

export type ItemMaterial = TipoPeca | 'liverpool';
export const ORDEM_MATERIAL: readonly ItemMaterial[] = [...TIPOS_PECA, 'liverpool'];

/** Peças do obstáculo inteiro: a pilha, uma vara por plano de trás e a água. */
export function materialDe(o: Obstacle, extraVaras = 0): Map<ItemMaterial, number> {
  const conta = new Map<ItemMaterial, number>();
  const soma = (k: ItemMaterial, n = 1) => conta.set(k, (conta.get(k) ?? 0) + n);
  for (const p of montagemDe(o).pecas) soma(p.tipo);
  const planosDeTras = Math.max(0, o.elements.length - 1) + extraVaras;
  if (planosDeTras > 0) soma('vara', planosDeTras);
  if (o.liverpool.enabled) soma('liverpool');
  return conta;
}

export function somaMaterial(listas: Map<ItemMaterial, number>[]): Map<ItemMaterial, number> {
  const total = new Map<ItemMaterial, number>();
  for (const l of listas) for (const [k, v] of l) total.set(k, (total.get(k) ?? 0) + v);
  return total;
}

/** Em ordem fixa, só o que existe. */
export const itensEmOrdem = (m: Map<ItemMaterial, number>): [ItemMaterial, number][] =>
  ORDEM_MATERIAL.filter((k) => (m.get(k) ?? 0) > 0).map((k) => [k, m.get(k)!]);

const NOMES: Record<ItemMaterial, [MessageKey, MessageKey]> = {
  vara: ['peca.vara', 'peca.varas'],
  testeira: ['peca.testeira', 'peca.testeiras'],
  painel: ['peca.painel', 'peca.paineis'],
  portao: ['peca.portao', 'peca.portoes'],
  muro: ['peca.muro', 'peca.muros'],
  liverpool: ['peca.liverpool', 'peca.liverpools'],
};

export const nomePeca = (k: ItemMaterial, n = 1): string => t(NOMES[k][n > 1 ? 1 : 0]);

/** "1 testeira, 3 varas" — na ordem fixa do material. */
export const descreveMaterial = (m: Map<ItemMaterial, number>): string =>
  itensEmOrdem(m)
    .map(([k, n]) => `${n} ${nomePeca(k, n)}`)
    .join(', ');

/** O trecho de altura que a peça ocupa de frente: [de, até] em cm. */
function faixa(p: PecaMontagem): [number, number] {
  if (p.tipo === 'vara') return [Math.min(p.esq, p.dir), Math.max(p.esq, p.dir)];
  const topo = topoPeca(p);
  return [Math.max(0, topo - alturaCorpo(p)), topo];
}

/** Folga entre uma vara e o que estiver encostado nela. */
const FOLGA = 5;

/** Os vãos livres de baixo até o topo, com o que há em cada borda. */
function vaos(pecas: PecaMontagem[]): { de: number; ate: number; varaEmbaixo: boolean; varaEmCima: boolean }[] {
  const faixas = pecas.map((p) => ({ f: faixa(p), vara: p.tipo === 'vara' })).sort((a, b) => a.f[0] - b.f[0]);
  const res: { de: number; ate: number; varaEmbaixo: boolean; varaEmCima: boolean }[] = [];
  let ate = 0;
  let varaEmbaixo = false;
  for (const { f, vara } of faixas) {
    if (f[0] > ate) res.push({ de: ate, ate: f[0], varaEmbaixo, varaEmCima: vara });
    if (f[1] >= ate) {
      ate = f[1];
      varaEmbaixo = vara;
    }
  }
  return res;
}

/** Onde a peça entra na ordem de montagem: logo depois das que estão abaixo dela. */
const indiceDe = (pecas: PecaMontagem[], nova: PecaMontagem): number =>
  pecas.filter((p) => faixa(p)[1] <= faixa(nova)[0] + 0.5).length;

/**
 * Acrescenta uma peça sem mexer na altura do obstáculo e sem ela nascer
 * atrás de outra (de frente, nada tapa nada):
 *
 * - a vara entra reta no meio do maior vão livre; sem vão, ela fica no
 *   topo e a peça sólida que estava lá desce (o muro baixa);
 * - a sólida entra no vão mais baixo em que cabe (o muro, só no chão);
 *   sem vão, ela vai em cima do muro, que baixa, ou no chão, e as varas
 *   que ela taparia sobem, repartidas até a peça de cima.
 */
export function comPecaNova(pecas: PecaMontagem[], tipo: TipoPeca): { pecas: PecaMontagem[]; indice: number } {
  const topo = topoMontagem({ pecas });
  const novas = pecas.map((p) => ({ ...p }));
  const insere = (p: PecaMontagem) => {
    const indice = indiceDe(novas, p);
    novas.splice(indice, 0, p);
    return { pecas: novas, indice };
  };
  if (pecas.length === 0) {
    const h = tipo === 'vara' || tipo === 'muro' ? 100 : ALTURA_PECA[tipo];
    return { pecas: [{ tipo, esq: h, dir: h }], indice: 0 };
  }
  const livres = vaos(novas);

  if (tipo === 'vara') {
    const util = livres
      .map((v) => ({ ...v, de2: v.de + (v.de > 0 || v.varaEmbaixo ? FOLGA : 0), ate2: v.ate - FOLGA }))
      .filter((v) => v.ate2 - v.de2 >= 0)
      .sort((a, b) => b.ate2 - b.de2 - (a.ate2 - a.de2));
    const v = util[0];
    if (v && v.ate - v.de >= 2 * FOLGA) {
      const h = Math.min(v.ate2, Math.max(v.de2, r5((v.de2 + v.ate2) / 2)));
      return insere({ tipo: 'vara', esq: h, dir: h });
    }
    // Sem vão: a vara fica no topo e o que está lá desce.
    const baixo = topo - 2 * FOLGA;
    for (const p of novas) {
      if (p.tipo === 'vara' || topoPeca(p) <= baixo) continue;
      const d = topoPeca(p) - baixo;
      p.esq = Math.max(0, p.esq - d);
      p.dir = Math.max(0, p.dir - d);
    }
    novas.push({ tipo: 'vara', esq: topo, dir: topo });
    return { pecas: novas, indice: novas.length - 1 };
  }

  const corpo = tipo === 'muro' ? 60 : ALTURA_PECA[tipo];
  const cabe = livres.find((v) => {
    if (tipo === 'muro' && v.de > 0) return false;
    const de = v.de + (v.varaEmbaixo ? FOLGA : 0);
    const ate = v.ate - (v.varaEmCima ? FOLGA : 0);
    return ate - de >= (tipo === 'muro' ? 20 : corpo);
  });
  if (cabe) {
    const de = cabe.de + (cabe.varaEmbaixo ? FOLGA : 0);
    const ate = cabe.ate - (cabe.varaEmCima ? FOLGA : 0);
    const h = tipo === 'muro' ? Math.floor(Math.min(corpo, ate) / 5) * 5 : Math.ceil((de + corpo) / 5) * 5;
    return insere({ tipo, esq: h, dir: h });
  }

  // Sem vão. Em cima do muro, que baixa o que a peça ocupa.
  const muro = tipo !== 'muro' ? novas.find((p) => p.tipo === 'muro' && topoPeca(p) - corpo >= 20) : undefined;
  if (muro) {
    const h = topoPeca(muro);
    muro.esq = muro.dir = h - corpo;
    return insere({ tipo, esq: h, dir: h });
  }
  // No chão: as varas que ela taparia sobem, repartidas até a peça de cima.
  const h = Math.min(corpo, Math.max(20, topo - 3 * FOLGA));
  const tapadas = novas
    .filter((p) => p.tipo === 'vara' && faixa(p)[0] < h + FOLGA && topoPeca(p) < topo)
    .sort((a, b) => meio(a) - meio(b));
  const acima = Math.min(
    topo,
    ...novas.filter((p) => !tapadas.includes(p) && faixa(p)[0] >= h).map((p) => faixa(p)[0]),
  );
  tapadas.forEach((p, j) => {
    const alvo = r5(h + ((acima - h) * (j + 1)) / (tapadas.length + 1));
    const d = alvo - meio(p);
    p.esq = limita(p.esq + d);
    p.dir = limita(p.dir + d);
  });
  const nova: PecaMontagem = { tipo, esq: h, dir: h };
  novas.unshift(nova);
  return { pecas: novas, indice: 0 };
}
