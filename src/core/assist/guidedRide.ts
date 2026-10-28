import { distance, type Vec2 } from '@core/geometry/vec';
import { createPath } from '@core/model/path';
import type { CourseDocument, CoursePath, PathNode } from '@core/model/types';
import { legCandidates, type CurveSolution } from './legCurve';
import type { CoursePrep } from './courseRide';
import { courseGates, gateStraightNodes, joinNodes } from './courseRide';
import { DEFAULT_RIDE, type RideParams } from './ridePath';
import { t } from '@core/i18n/i18n';

/**
 * Traçado por trechos, com escolha do desenhador.
 *
 * A calibração mostrou que o assistente não sabe ESCOLHER: numa prova
 * real erra 40% na distância total, e nenhum ajuste de parâmetro
 * conserta. Mas ele sabe GERAR, e escolher é o que o desenhador sabe
 * fazer melhor que qualquer regra que eu escreva.
 *
 * Então o percurso é percorrido pernada a pernada. Onde há mais de uma
 * forma de fazer, as formas são apresentadas e alguém decide. Onde só há
 * uma — reta absoluta, por exemplo —, não há o que perguntar.
 */

export interface GuidedLeg {
  /** "partida para 1", "5AB para 6". */
  where: string;
  /** As formas distintas de fazer esta pernada, da melhor para a pior. */
  options: CurveSolution[];
  /** Qual delas está escolhida. */
  chosen: number;
}

export interface GuidedRide {
  legs: GuidedLeg[];
  /** Retas de cada obstáculo, já esticadas até onde a volta começa. */
  gateNodes: PathNode[][];
  stops: string[];
  prep: CoursePrep;
}

/** O quanto de reta cada volta escolhida usa, na ordem dos degraus. */
const leadsDe = (legs: GuidedLeg[]) =>
  legs.map((l) => ({ lead: l.options[l.chosen]?.lead ?? { after: 0, before: 0 } }));

/**
 * Refaz as retas dos saltos depois de trocar uma escolha.
 *
 * A volta escolhida pode ceder ou pedir reta, e a reta do salto tem de ir
 * até onde ela começa. Sem isto, trocar de opção deixava um buraco ou uma
 * sobra entre a reta e a curva.
 */
export function withChoice(ride: GuidedRide, legIndex: number, option: number): GuidedRide {
  const legs = ride.legs.map((l, i) => (i === legIndex ? { ...l, chosen: option } : l));
  return {
    ...ride,
    legs,
    gateNodes: ride.prep.gates.map((_, i) => gateStraightNodes(ride.prep, i, leadsDe(legs))),
  };
}

/**
 * Prepara o percurso para a escolha trecho a trecho.
 *
 * Já vem com a opção que o assistente escolheria marcada, para quem
 * quiser só confirmar tudo e seguir. Devolve `null` quando não há o que
 * traçar.
 */
export function prepareGuidedRide(
  doc: CourseDocument,
  params: RideParams = DEFAULT_RIDE,
): GuidedRide | null {
  const preparo = courseGates(doc, params);
  if (!preparo) return null;

  const { gates, entradas, saidas, retaEntrada, retaSaida, field } = preparo;

  const legs: GuidedLeg[] = [];
  for (let i = 0; i < gates.length - 1; i += 1) {
    const g = gates[i]!;
    const proximo = gates[i + 1]!;
    const where = t('ride.trecho', { de: g.label, para: proximo.label });

    // Cruzada de tempo nunca tem volta: reta, e nada a escolher.
    if (g.kind === 'timing' || proximo.kind === 'timing') {
      legs.push({ where, options: [retaComoOpcao(saidas[i]!.pos, entradas[i + 1]!.pos)], chosen: 0 });
      continue;
    }

    const opcoes = legCandidates(saidas[i]!, entradas[i + 1]!, field, {
      ...params,
      getawayM: retaSaida[i]!,
      approachM: retaEntrada[i + 1]!,
    });
    legs.push({
      where,
      options: opcoes.length > 0 ? opcoes : [retaComoOpcao(saidas[i]!.pos, entradas[i + 1]!.pos)],
      chosen: 0,
    });
  }

  // A reta de cada salto vai até onde a volta escolhida começa, então ela
  // depende das escolhas — e é recalculada a cada troca.
  return {
    legs,
    gateNodes: gates.map((_, i) => gateStraightNodes(preparo, i, leadsDe(legs))),
    stops: gates.map((g) => g.label),
    prep: preparo,
  };
}

/** A reta pronta no formato de uma volta, para as cruzadas de tempo. */
function retaComoOpcao(de: Vec2, para: Vec2): CurveSolution {
  const dx = para.x - de.x;
  const dy = para.y - de.y;
  const terco = { x: dx / 3, y: dy / 3 };
  return {
    nodes: [
      { pos: de, type: 'smooth', handleIn: null, handleOut: terco, anchor: null },
      { pos: para, type: 'smooth', handleIn: { x: -terco.x, y: -terco.y }, handleOut: null, anchor: null },
    ],
    lead: { after: 0, before: 0 },
    warnings: [],
    minRadiusM: Infinity,
    inflections: 0,
    turnDeg: 0,
    shape: 'curva',
    samples: [de, para],
    counterTurn: false,
    counterDeg: 0,
    arrivalM: distance(de, para),
    opensAt: 'meio',
  };
}

/** Monta o traçado a partir das escolhas feitas. */
export function buildFromChoices(ride: GuidedRide): CoursePath | null {
  const pedacos: PathNode[][] = [];
  ride.gateNodes.forEach((reta, i) => {
    pedacos.push(reta);
    const perna = ride.legs[i];
    if (perna) pedacos.push(perna.options[perna.chosen]?.nodes ?? []);
  });

  const nodes = joinNodes(pedacos);
  return nodes.length < 2 ? null : createPath(nodes);
}

/** Comprimento do traçado com as escolhas atuais, em metros. */
export function guidedLength(ride: GuidedRide): number {
  const path = buildFromChoices(ride);
  if (!path) return 0;
  let total = 0;
  for (let i = 1; i < path.nodes.length; i += 1) {
    total += distance(path.nodes[i - 1]!.pos, path.nodes[i]!.pos);
  }
  return total;
}
