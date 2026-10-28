import type { InfoBox, InfoBoxField, TemposDoQuadro } from '@core/model/types';
import { t } from '@core/i18n/i18n';

/**
 * Tempos do quadro técnico, calculados da distância e da velocidade.
 *
 * As contas são as do SAPH, cuja calculadora foi conferida em prova:
 *
 * - Tempo concedido: distância ÷ velocidade, em segundos, arredondado
 *   PARA CIMA (412 m a 350 m/min = 70,6 s → 71 s).
 * - Tempo limite: o dobro do concedido. Na Tabela C não há concedido, e o
 *   limite é 180 s a partir de 600 m, 120 s abaixo disso.
 * - Tempo ideal: 95% do concedido, arredondado (regra da CBH).
 * - Faixa de tempo (Art. 220.3): vai do concedido para baixo, o dobro da
 *   distância entre o concedido e o ideal — o ideal fica no meio.
 *
 * O cálculo só escreve nos campos; o §44 continua valendo: quem assina o
 * croqui pode reescrever qualquer número depois.
 */

export type FormatoTempo = TemposDoQuadro['formato'];

export const FORMATOS_TEMPO: FormatoTempo[] = ['A', 'ideal', 'faixa', 'C'];

export interface Tempos {
  concedido: number | null;
  limite: number | null;
  ideal: number | null;
  faixa: { inf: number; sup: number } | null;
}

/** Tempo concedido em segundos; null sem distância ou velocidade. */
export function tempoConcedido(distM: number, velMMin: number): number | null {
  if (!(distM > 0) || !(velMMin > 0)) return null;
  return Math.ceil((distM / velMMin) * 60);
}

export function tempoIdeal(distM: number, velMMin: number): number | null {
  const conc = tempoConcedido(distM, velMMin);
  return conc == null ? null : Math.round(conc * 0.95);
}

export const limiteTabelaC = (distM: number): number | null =>
  distM > 0 ? (distM >= 600 ? 180 : 120) : null;

export function calculaTempos(
  distM: number,
  velMMin: number,
  { formato }: TemposDoQuadro,
): Tempos {
  if (formato === 'C') {
    return { concedido: null, limite: limiteTabelaC(distM), ideal: null, faixa: null };
  }
  const concedido = tempoConcedido(distM, velMMin);
  const ideal = formato === 'A' ? null : tempoIdeal(distM, velMMin);
  return {
    concedido,
    limite: concedido == null ? null : concedido * 2,
    ideal,
    faixa:
      formato === 'faixa' && concedido != null && ideal != null
        ? { inf: concedido - 2 * (concedido - ideal), sup: concedido }
        : null,
  };
}

/**
 * Número de um campo digitado: "350 m/min", "412 m", "1.234 m", "412,5".
 *
 * Ponto ou vírgula seguidos de exatamente três dígitos são milhar; o
 * resto é decimal. Assim "1.234" e "1,234" dão mil e tanto, e "412,5" dá
 * quatrocentos e doze e meio.
 */
export function lerNumero(texto: string): number | null {
  const m = texto.match(/\d[\d.,]*/);
  if (!m) return null;
  const limpo = m[0]
    .replace(/[.,]$/, '')
    .replace(/[.,](?=\d{3}(?!\d))/g, '')
    .replace(',', '.');
  const n = Number(limpo);
  return Number.isFinite(n) ? n : null;
}

export const segundos = (s: number): string => `${s} s`;

/** Campos de tempo, na ordem em que entram no quadro. */
const IDS_TEMPO = ['tempo', 'ideal', 'faixa', 'limite'] as const;

const ROTULO = {
  tempo: 'quadro.tempo',
  ideal: 'quadro.ideal',
  faixa: 'quadro.faixa',
  limite: 'quadro.limite',
} as const;

/**
 * Escreve os tempos no quadro a partir dos campos Distância e Velocidade.
 *
 * Liga os campos que o formato usa e desliga os que ele não usa — a
 * Tabela C não tem concedido, a Tabela A não tem ideal. Quadro de croqui
 * antigo, sem os campos novos, ganha os que faltam logo depois do tempo
 * concedido. Sem distância ou velocidade legíveis, não mexe em nada:
 * apagar o que o desenhador digitou seria pior que deixar como está.
 *
 * Devolve se conseguiu calcular.
 */
export function aplicaTempos(box: InfoBox): boolean {
  const cfg = box.tempos ?? { formato: 'A' };
  const dist = lerNumero(box.fields.find((f) => f.id === 'distancia')?.value ?? '');
  const vel = lerNumero(box.fields.find((f) => f.id === 'velocidade')?.value ?? '');
  if (dist == null || dist <= 0) return false;
  if (cfg.formato !== 'C' && (vel == null || vel <= 0)) return false;

  const tempos = calculaTempos(dist, vel ?? 0, cfg);
  const valores: Record<(typeof IDS_TEMPO)[number], string | null> = {
    tempo: tempos.concedido == null ? null : segundos(tempos.concedido),
    ideal: tempos.ideal == null ? null : segundos(tempos.ideal),
    faixa: tempos.faixa == null ? null : `${tempos.faixa.inf}–${segundos(tempos.faixa.sup)}`,
    limite: tempos.limite == null ? null : segundos(tempos.limite),
  };

  for (const id of IDS_TEMPO) {
    const valor = valores[id];
    let campo = box.fields.find((f) => f.id === id);
    if (!campo) {
      if (valor == null) continue;
      campo = novoCampo(id);
      box.fields.splice(posicaoPara(box.fields, id), 0, campo);
    }
    campo.enabled = valor != null;
    if (valor != null) campo.value = valor;
  }
  return true;
}

function novoCampo(id: (typeof IDS_TEMPO)[number]): InfoBoxField {
  return { id, label: t(ROTULO[id]), value: '', enabled: true };
}

/** Logo depois do campo de tempo anterior que exista; sem nenhum, no fim. */
function posicaoPara(fields: InfoBoxField[], id: (typeof IDS_TEMPO)[number]): number {
  const antes = IDS_TEMPO.slice(0, IDS_TEMPO.indexOf(id)).reverse();
  for (const a of antes) {
    const i = fields.findIndex((f) => f.id === a);
    if (i >= 0) return i + 1;
  }
  const limite = fields.findIndex((f) => f.id === 'limite');
  return limite >= 0 ? limite : fields.length;
}
