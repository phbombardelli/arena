import { cubicPoint, type Cubic } from '@core/geometry/bezier';
import { DEG, add, distance, fromAngle, scale, sub, type Vec2 } from '@core/geometry/vec';
import { dubinsPaths, poseAt, samplePath, type ArcSegment, type DubinsPath, type Pose } from '@core/geometry/dubins';
import { nodesFromDubins } from '@core/model/pathFromDubins';
import type { PathNode } from '@core/model/types';
import {
  DEFAULT_RIDE,
  distanceToOutline,
  insidePolygon,
  obstacleFootprint,
  type Field,
  type RideParams,
  type RideWarning,
} from './ridePath';

/**
 * A volta entre dois saltos, como uma curva só.
 *
 * A primeira versão do assistente ligava as poses pelo caminho mais curto
 * de raio mínimo (Dubins). O resultado, na pista de verdade, foi um croqui
 * cheio de laçadas. O diagnóstico: exigir reta perpendicular de tamanho
 * fixo nas duas pontas E raio mínimo entre elas é restritivo demais.
 * Quando os dois saltos não estão bem alinhados — que é o caso quase
 * sempre —, TODAS as soluções giram mais de 330 graus. Não era escolha
 * ruim entre opções boas: não havia opção boa.
 *
 * Os croquis reais mostram outra construção: a linha é uma curva fluida
 * que atravessa o percurso e cruza cada obstáculo perpendicular. É o que
 * uma cúbica de Hermite faz por definição — sai na direção do salto
 * anterior, chega na direção do próximo, e nunca dá laçada.
 *
 * Só que a cúbica única também não basta sozinha: numa volta grande, de
 * meia-volta para trás, ela responde com um BICO, porque não consegue
 * girar tanto sem se dobrar. E é justamente aí que o arco-reta-arco
 * brilha.
 *
 * Então os dois geradores convivem e um só juiz decide: cúbica fluida
 * para as voltas mansas, arco-reta-arco para as voltas grandes. O
 * critério é o mesmo para ambos — cabe na pista, não atropela obstáculo,
 * e o ponto mais fechado ainda se galopa. Vence quem tem menos problema
 * e, no empate, a curva mais ampla.
 */

/** Quanto a curva "puxa" na direção do salto, como fração do vão. */
const TENSIONS = [0.3, 0.4, 0.5, 0.6, 0.75, 0.9, 1.1, 1.35];

export function legCurve(from: Pose, to: Pose, tension: number, tensionTo = tension): Cubic {
  const vao = distance(from.pos, to.pos);
  return {
    p0: from.pos,
    p1: add(from.pos, scale(fromAngle(from.heading), Math.max(1, vao * tension))),
    p2: sub(to.pos, scale(fromAngle(to.heading), Math.max(1, vao * tensionTo))),
    p3: to.pos,
  };
}

/**
 * Pares de tensão diferentes nas duas pontas: a volta que abre mais no
 * começo e fecha no fim, e a que faz o contrário. Sem eles o leque só
 * tinha voltas simétricas, e o armador sentia falta das outras
 * (decisão 82).
 */
const ASYMMETRIC: [number, number][] = [
  [0.4, 0.9],
  [0.9, 0.4],
  [0.5, 1.2],
  [1.2, 0.5],
  [0.6, 1.0],
  [1.0, 0.6],
];

/**
 * Menor raio de curvatura ao longo da curva, em metros.
 *
 * É a medida que diz se o cavalo consegue fazer a volta: raio pequeno
 * demais é curva que não se galopa. Calculado pela fórmula da curvatura,
 * amostrando o parâmetro — não há forma fechada para o mínimo.
 */
export function minRadiusOf(c: Cubic, amostras = 48): number {
  let menor = Infinity;
  let anterior: Vec2 | null = null;

  for (let i = 0; i <= amostras; i += 1) {
    const t = i / amostras;
    const d1 = derivative(c, t);
    const d2 = secondDerivative(c, t);

    // Retorno: a curva inverte o sentido da marcha. Acontece quando as duas
    // tangentes se opõem na mesma reta — a linha sobe e volta por cima de
    // si mesma. A curvatura ali é zero, então a fórmula daria "reta
    // perfeita" para o que é, na verdade, o pior traçado possível. Sem
    // este teste isso passava limpo por toda a checagem.
    if (anterior && anterior.x * d1.x + anterior.y * d1.y < 0) return 0;
    anterior = d1;

    const cruzado = Math.abs(d1.x * d2.y - d1.y * d2.x);
    const velocidade = Math.hypot(d1.x, d1.y);
    if (cruzado < 1e-12) continue;
    menor = Math.min(menor, (velocidade * velocidade * velocidade) / cruzado);
  }
  return menor;
}

function derivative(c: Cubic, t: number): Vec2 {
  const u = 1 - t;
  const k1 = 3 * u * u;
  const k2 = 6 * u * t;
  const k3 = 3 * t * t;
  return {
    x: k1 * (c.p1.x - c.p0.x) + k2 * (c.p2.x - c.p1.x) + k3 * (c.p3.x - c.p2.x),
    y: k1 * (c.p1.y - c.p0.y) + k2 * (c.p2.y - c.p1.y) + k3 * (c.p3.y - c.p2.y),
  };
}

function secondDerivative(c: Cubic, t: number): Vec2 {
  const u = 1 - t;
  return {
    x: 6 * u * (c.p2.x - 2 * c.p1.x + c.p0.x) + 6 * t * (c.p3.x - 2 * c.p2.x + c.p1.x),
    y: 6 * u * (c.p2.y - 2 * c.p1.y + c.p0.y) + 6 * t * (c.p3.y - 2 * c.p2.y + c.p1.y),
  };
}

export type CurveWarning = RideWarning | 'curva-fechada' | 'giro-excessivo';

export type LegShape = 'curva' | 'arco-reta-arco';

export interface CurveSolution {
  nodes: PathNode[];
  /**
   * Metros a mais de reta usados de cada lado. Negativo é reta cedida
   * para caber a curva; positivo é reta ganha para caber a curva para
   * trás. O construtor precisa saber para desenhar a reta do salto até o
   * ponto certo.
   */
  lead: { after: number; before: number };
  warnings: CurveWarning[];
  /** Menor raio da volta — o aperto real que o cavalo enfrenta. */
  minRadiusM: number;
  /** Quantas vezes a linha troca de mão. Volta boa troca zero ou uma vez. */
  inflections: number;
  /** Giro total da volta, em graus. Medida de economia. */
  turnDeg: number;
  shape: LegShape;
  /** A linha amostrada: para comparar desenhos e medir a chegada. */
  samples: Vec2[];
  /**
   * Contracurva: a volta grande começa (ou termina) torcendo para o lado
   * contrário. "Se o cavaleiro fizer isso, ele errou" (decisão 82).
   */
  counterTurn: boolean;
  /** Quanto a contracurva torce para o lado errado, em graus (0 sem ela). */
  counterDeg: number;
  /** Metros de linha já alinhada com o salto antes de chegar a ele. */
  arrivalM: number;
  /** Onde a volta gira mais: no começo, no meio ou no fim. */
  opensAt: 'inicio' | 'meio' | 'fim';
}

/**
 * Quantas vezes a linha inverte a mão da curva.
 *
 * Cavaleiro que vai virar à direita não começa torcendo à esquerda. Essa
 * inversão — que a cúbica produz sozinha quando as tangentes puxam demais
 * — é exatamente o que o olho de quem monta reprova primeiro, mesmo
 * quando o raio e o comprimento estão bons. Sem esta contagem, o juiz não
 * tinha como enxergar o defeito.
 *
 * Trechos quase retos não contam: ruído de arredondamento numa reta
 * inventaria inversões que ninguém vê.
 */
export function inflectionCount(pontos: Vec2[]): number {
  const RETO = 1e-4;
  let trocas = 0;
  let sinal = 0;
  for (let i = 2; i < pontos.length; i += 1) {
    const a = sub(pontos[i - 1]!, pontos[i - 2]!);
    const b = sub(pontos[i]!, pontos[i - 1]!);
    const cruzado = a.x * b.y - a.y * b.x;
    const escala = Math.hypot(a.x, a.y) * Math.hypot(b.x, b.y);
    if (escala === 0 || Math.abs(cruzado) / escala < RETO) continue;
    const atual = Math.sign(cruzado);
    if (sinal !== 0 && atual !== sinal) trocas += 1;
    sinal = atual;
  }
  return trocas;
}

/**
 * Folga mínima entre a linha e uma ilha, um vaso ou outro obstáculo: passar
 * rente não é passar (decisão 82).
 */
export const CLEARANCE_M = 1;

const encosta = (p: Vec2, corpo: Vec2[]): boolean =>
  insidePolygon(p, corpo) || distanceToOutline(p, corpo) < CLEARANCE_M;

function checkPoints(pontos: Vec2[], field: Field, params: RideParams): RideWarning[] {
  const avisos: RideWarning[] = [];
  if (field.outline) {
    const escapou = pontos.some(
      (p) =>
        !insidePolygon(p, field.outline!) ||
        distanceToOutline(p, field.outline!) < params.railMarginM,
    );
    if (escapou) avisos.push('fora-da-pista');
  }

  const atropela = field.blockers.some((o) => {
    const corpo = obstacleFootprint(o);
    // As pontas ficam de fora: elas encostam de propósito nos saltos que a
    // volta liga, e acusá-las seria acusar o próprio salto.
    return pontos.slice(3, -3).some((p) => encosta(p, corpo));
  }) || (field.decor ?? []).some((corpo) => pontos.some((p) => encosta(p, corpo)));
  if (atropela) avisos.push('passa-por-obstaculo');

  return avisos;
}

/**
 * Maior raio que QUALQUER curva ligando duas poses pode ter.
 *
 * Entre duas direções que diferem de Δ, virar exige um arco; e o arco de
 * raio r que gira Δ tem corda 2·r·sen(Δ/2). Como a corda não pode passar
 * do vão, o raio não passa de vão / (2·sen(Δ/2)).
 *
 * O limite existe porque a medição ponto a ponto não enxerga o caso
 * degenerado: quando as duas retas quase se encostam e apontam em sentidos
 * opostos, a curva vira um ponto, a curvatura medida dá zero, e o
 * resultado era classificado como "reta perfeita" — o oposto da verdade.
 */
export function reachableRadius(from: Pose, to: Pose): number {
  const bruto = to.heading - from.heading;
  const giro = Math.abs(((((bruto + 180) % 360) + 360) % 360) - 180);
  if (giro < 1e-9) return Infinity;
  return distance(from.pos, to.pos) / (2 * Math.sin((giro * Math.PI) / 360));
}

const samplesOfCubic = (c: Cubic, n = 60): Vec2[] => {
  const out: Vec2[] = [];
  for (let i = 0; i <= n; i += 1) out.push(cubicPoint(c, i / n));
  return out;
};

/**
 * Escolhe a volta entre dois saltos.
 *
 * Gera os dois tipos de solução e julga todas pelo mesmo critério, nesta
 * ordem: menos problemas, menos troca de mão, e por fim a curva mais
 * ampla. Avaliar tudo em vez de parar na primeira que serve custa
 * microssegundos e evita dois vícios — escolher sempre a mais fechada e
 * aceitar uma linha que serpenteia.
 */
export function solveLegCurve(
  from: Pose,
  to: Pose,
  field: Field,
  params: RideParams = DEFAULT_RIDE,
): CurveSolution {
  const leads = leadsToTry(params);

  // Primeiro a linha DIRETA: sem alongar reta nenhuma. Havendo ali uma
  // volta galopável e limpa, é ela — cavaleiro não dá a volta por fora
  // quando dá para ir direto.
  const direta = avalia(leads.filter((l) => l.after <= 0 && l.before <= 0), from, to, field, params);
  const melhorDireta = escolhe(direta, params);
  const porFora = avalia(leads.filter((l) => l.after > 0 || l.before > 0), from, to, field, params);

  if (melhorDireta && serve(melhorDireta, params) && melhorDireta.turnDeg <= GIRO_MANSO) {
    // Alongar a reta sem girar mais não é volta por fora: é a MESMA volta
    // usando o espaço da pista, e ela entra no mesmo balcão. É o que deixa
    // a meia-volta subir a lateral e virar no alto, ampla, em vez de cortar
    // a pista numa reta diagonal entre dois arcos apertados (decisão 51).
    const parelhas = porFora.filter(
      (c) => serve(c, params) && c.turnDeg <= melhorDireta.turnDeg + GIRO_PARELHO,
    );
    return escolhe([melhorDireta, ...parelhas], params)!;
  }

  // Só então a curva para trás que gira MAIS, e custa reta e metros. É
  // RECURSO, não alternativa de igual para igual: comparar as duas famílias
  // no mesmo balcão fazia a volta por fora ganhar sempre que a direta
  // ficava um pouco apertada, e o croqui virava um emaranhado de laçadas.
  const melhorPorFora = escolhe(porFora, params);
  if (melhorPorFora && serve(melhorPorFora, params)) return melhorPorFora;

  // Nenhuma serve: entrega a menos ruim, com os avisos.
  return escolhe([...direta, ...porFora], params) ?? melhorDireta!;
}

/**
 * As formas realmente DIFERENTES de fazer uma pernada.
 *
 * Existe porque a calibração mostrou que o assistente não sabe escolher:
 * ele erra 40% na distância total de uma prova real, e nenhum ajuste de
 * parâmetro conserta. Gerar boas opções, porém, ele sabe — e escolher é
 * o que o desenhador sabe fazer.
 *
 * O trabalho aqui é PODAR. A busca produz centenas de candidatos, quase
 * todos variações imperceptíveis do mesmo desenho: meio grau de giro, dez
 * centímetros de raio. Mostrar tudo seria inútil. O que se agrupa é a
 * FORMA — para que lado vira, quantas vezes troca de mão, se vai direto
 * ou por fora, e quanto gira em degraus grossos. De cada grupo sobra o
 * melhor exemplar.
 */
export function legCandidates(
  from: Pose,
  to: Pose,
  field: Field,
  params: RideParams = DEFAULT_RIDE,
  maximo = 6,
): CurveSolution[] {
  const todos = avalia(leadsToTry(params), from, to, field, params);
  if (todos.length === 0) return [];

  const melhor = [...todos].sort((a, b) => compara(a, b, params))[0]!;

  // Poda antes de agrupar. Duas regras, e as duas são sobre o que NÃO é
  // alternativa:
  //
  // Havendo caminho limpo, caminho com problema não é opção — é o mesmo
  // trajeto com um defeito.
  //
  // E um caminho que gira meia volta a mais que o melhor não é outra
  // maneira de fazer a pernada: é um desvio. Numa reta absoluta, sem essa
  // regra, a lista vinha com seis "opções", cinco delas voltas por fora
  // desnecessárias.
  //
  // E curva abaixo do raio mínimo não é opção enquanto existir uma que se
  // galope: sem esta regra, a pernada sem caminho limpo vinha com bicos de
  // 1 a 3 m de raio oferecidos como alternativa (decisão 49).
  //
  // Volta acima do teto de giro só entra quando não há outra, e então só
  // as próximas da melhor: entre dois saltos lado a lado a volta inteira é
  // a resposta, mas as de 450 graus que vinham junto não são de ninguém.
  // A mesma volta com o raio redistribuído pode passar uns graus do teto:
  // perto da melhor, o excesso de giro não é laçada, é variação (decisão 82).
  const giroBase = Math.min(...todos.filter((c) => galopavel(c, params)).map((c) => c.turnDeg), Infinity);
  for (const c of todos) {
    if (c.warnings.includes('giro-excessivo') && c.turnDeg <= giroBase + GIRO_PARELHO) {
      c.warnings = c.warnings.filter((w) => w !== 'giro-excessivo');
    }
  }
  const limpoExiste = todos.some((c) => c.warnings.length === 0);
  const galopavelExiste = todos.some((c) => galopavel(c, params));
  const dentroDoTeto = (c: CurveSolution) => !c.warnings.includes('giro-excessivo');
  const dentroExiste = todos.some(dentroDoTeto);
  const tetoGiro = melhor.turnDeg + (dentroExiste ? 180 : 45);
  let candidatos = todos.filter(
    (c) =>
      (!limpoExiste || c.warnings.length === 0) &&
      (!galopavelExiste || galopavel(c, params)) &&
      (!dentroExiste || dentroDoTeto(c)) &&
      c.turnDeg <= tetoGiro,
  );

  // As regras do armador (decisão 82). Cada uma só corta se sobrar
  // alternativa: melhor uma opção imperfeita que nenhuma.
  const seSobrar = (fica: (c: CurveSolution) => boolean) => {
    const restam = candidatos.filter(fica);
    if (restam.length > 0) candidatos = restam;
  };
  // Contracurva franca (abrir para um lado e virar para o outro) sai;
  // a leve só sai se houver opção sem nenhuma, e senão paga no custo.
  seSobrar((c) => c.counterDeg < CONTRA_FORTE_DEG);
  seSobrar((c) => !c.counterTurn);
  seSobrar((c) => significantInflections(c.samples) <= 1);
  // Por fora só se não houver volta direta, ou se girar quase o mesmo.
  const diretas = candidatos.filter((c) => c.lead.after <= 0 && c.lead.before <= 0);
  if (diretas.length > 0) {
    const giroDireto = Math.min(...diretas.map((c) => c.turnDeg));
    seSobrar((c) => (c.lead.after <= 0 && c.lead.before <= 0) || c.turnDeg <= giroDireto + POR_FORA_FOLGA_DEG);
  }
  // Chegada ao salto já alinhada, com reta de verdade.
  seSobrar((c) => c.arrivalM >= CHEGADA_MIN_M);
  if (candidatos.length === 0) return [];

  const ordenados = [...candidatos].sort((a, b) => compara(a, b, params));
  // Ligação reta entre dois saltos: não há o que escolher.
  const primeiro = ordenados[0]!;
  // A ondulação de meio grau que a cúbica faz numa reta não a faz curva.
  if (primeiro.turnDeg < RETA_DEG) return [primeiro];

  const porForma = new Map<string, CurveSolution>();
  for (const c of ordenados) {
    const chave = assinatura(c);
    if (!porForma.has(chave)) porForma.set(chave, c);
  }

  // Formas diferentes no papel podem dar o mesmo desenho: fica uma.
  const escolhidas: CurveSolution[] = [];
  for (const c of [...porForma.values()].sort((a, b) => compara(a, b, params))) {
    if (escolhidas.some((e) => sameDrawing(e, c))) continue;
    escolhidas.push(c);
    if (escolhidas.length >= maximo) break;
  }
  return escolhidas;
}

/**
 * Torção para o lado errado que já é contracurva franca: o armador recusou
 * 32° e 39° e deixou passar 8° a 18° (decisão 82).
 */
const CONTRA_FORTE_DEG = 25;
/** Giro abaixo do qual a ligação é uma reta e não tem opções (decisão 82). */
const RETA_DEG = 15;
/** Quanto a volta por fora pode girar além da direta e ainda ser opção. */
const POR_FORA_FOLGA_DEG = 20;
/** Linha alinhada com o salto antes de chegar a ele: reta mais o fim da volta. */
export const CHEGADA_MIN_M = 7;
/** Duas voltas que nunca se afastam mais que isso são o mesmo desenho. */
const MESMO_DESENHO_M = 0.75;

/** Reamostra a linha em `n` pontos igualmente espaçados pelo comprimento. */
function resample(pontos: Vec2[], n = 24): Vec2[] {
  const acum = [0];
  for (let i = 1; i < pontos.length; i += 1) acum.push(acum[i - 1]! + distance(pontos[i - 1]!, pontos[i]!));
  const total = acum[acum.length - 1]!;
  const out: Vec2[] = [];
  let j = 1;
  for (let k = 0; k <= n; k += 1) {
    const s = (total * k) / n;
    while (j < pontos.length - 1 && acum[j]! < s) j += 1;
    const a = pontos[j - 1]!;
    const b = pontos[j]!;
    const seg = acum[j]! - acum[j - 1]!;
    const t = seg === 0 ? 0 : (s - acum[j - 1]!) / seg;
    out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  }
  return out;
}

function sameDrawing(a: CurveSolution, b: CurveSolution): boolean {
  if (Math.abs(a.lead.after - b.lead.after) > MESMO_DESENHO_M || Math.abs(a.lead.before - b.lead.before) > MESMO_DESENHO_M) {
    return false;
  }
  const ra = resample(a.samples);
  const rb = resample(b.samples);
  return ra.every((p, i) => distance(p, rb[i]!) < MESMO_DESENHO_M);
}

/**
 * Assinatura da forma. Duas voltas com a mesma assinatura são a mesma
 * ideia desenhada com meio grau de diferença.
 */
function assinatura(c: CurveSolution): string {
  // Ir por fora não entra na assinatura: o GIRO já distingue a volta
  // direta da volta por fora, e marcar as duas coisas fazia a mesma reta
  // aparecer duas vezes — uma delas com seis metros a mais e nenhuma
  // diferença de desenho.
  //
  // A faixa de raio e o lugar onde a volta abre entram desde a decisão 82:
  // sem elas, a volta intermediária (mais fechada que a ampla, menos que a
  // apertada) e a que abre no fim caíam no grupo da melhor e sumiam.
  return `${maoInicial(c.nodes)}|${c.inflections}|${Math.round(c.turnDeg / 45)}|${faixaDeRaio(c.minRadiusM)}|${c.opensAt}`;
}

function faixaDeRaio(r: number): number {
  if (r < 7.5) return 0;
  if (r < 10) return 1;
  if (r < 14) return 2;
  return 3;
}

/** Para que lado a linha vira primeiro: -1 esquerda, 1 direita, 0 reta. */
function maoInicial(nodes: PathNode[]): number {
  const pontos = nodes.map((n) => n.pos);
  for (let i = 2; i < pontos.length; i += 1) {
    const a = sub(pontos[i - 1]!, pontos[i - 2]!);
    const b = sub(pontos[i]!, pontos[i - 1]!);
    const escala = Math.hypot(a.x, a.y) * Math.hypot(b.x, b.y);
    if (escala === 0) continue;
    const cruzado = (a.x * b.y - a.y * b.x) / escala;
    if (Math.abs(cruzado) > 0.02) return Math.sign(cruzado);
  }
  return 0;
}

/** Volta que dá para galopar e não esbarra em nada. */
const serve = (c: CurveSolution, params: RideParams): boolean =>
  c.warnings.length === 0 && c.minRadiusM >= params.tightRadiusM;

/**
 * Giro até o qual a volta direta ainda é "mansa", em graus.
 *
 * A ordem de preferência do ofício é: volta direta mansa, depois curva
 * para trás, e só em último caso volta direta com giro grande. Sem este
 * degrau, uma laçada de 350 graus passava como direta — limpa e
 * galopável, portanto aceita — e o croqui enchia de rabiscos onde a volta
 * por fora teria resolvido com elegância.
 *
 * Era 200 graus. Subiu para 270 porque voltas de 200 a 270 graus são
 * desenho de percurso, não defeito — muitas vezes o percurso é pensado
 * nelas —, e com 200 o assistente trocava uma direta limpa de 240 graus
 * por uma volta por fora de 285. A laçada que este degrau barrava agora
 * é barrada pelo teto de 300 graus (decisão 49).
 */
const GIRO_MANSO = 270;

/**
 * Folga de giro para a volta alongada competir com a direta. Mais que
 * isso ela já dá uma volta a mais, e é desvio.
 */
const GIRO_PARELHO = 10;

const escolhe = (lista: CurveSolution[], params: RideParams): CurveSolution | null =>
  lista.length === 0 ? null : [...lista].sort((a, b) => compara(a, b, params))[0]!;

/** Gera e julga todos os candidatos para um conjunto de alongamentos. */
function avalia(
  leads: { after: number; before: number }[],
  from: Pose,
  to: Pose,
  field: Field,
  params: RideParams,
): CurveSolution[] {
  const candidatos: CurveSolution[] = [];

  const julga = (
    lead: { after: number; before: number },
    nodes: PathNode[],
    pontos: Vec2[],
    minRadiusM: number,
    shape: LegShape,
  ) => {
    const warnings: CurveWarning[] = [...checkPoints(pontos, field, params)];
    // A reta esticada (curva para trás) também não pode atravessar ilha ou
    // vaso — ela é parte do traçado, só não é parte da curva (decisão 74).
    if (!warnings.includes('passa-por-obstaculo') && retaAtropelaDecor(lead, from, to, field)) {
      warnings.push('passa-por-obstaculo');
    }
    if (minRadiusM < params.tightRadiusM) warnings.push('curva-fechada');
    const turnDeg = turnOfPoints(pontos);
    // A cúbica não passava pelo teto de giro, só o arco-reta-arco: uma
    // laçada desenhada como cúbica entrava limpa.
    if (turnDeg > params.maxTurnDeg) warnings.push('giro-excessivo');
    const giros = signedTurns(pontos);
    candidatos.push({
      nodes,
      lead,
      warnings,
      minRadiusM,
      inflections: inflectionCount(pontos),
      turnDeg,
      shape,
      samples: pontos,
      counterTurn: counterTurnDeg(giros) >= CONTRA_MIN_DEG,
      counterDeg: counterTurnDeg(giros),
      arrivalM: Math.max(0, params.approachM + lead.before) + alignedTail(pontos),
      opensAt: whereItOpens(giros),
    });
  };

  for (const lead of leads) {
    // Positivo afasta do obstáculo: a saída avança e a chegada recua.
    const saida = slide(from, lead.after);
    const chegada = slide(to, -lead.before);
    const teto = reachableRadius(saida, chegada);

    for (const tension of TENSIONS) {
      const curve = legCurve(saida, chegada, tension);
      const raio = Math.min(minRadiusOf(curve), teto);
      julga(lead, curveNodes(curve), samplesOfCubic(curve), raio, 'curva');
    }
    for (const [t1, t2] of ASYMMETRIC) {
      const curve = legCurve(saida, chegada, t1, t2);
      const raio = Math.min(minRadiusOf(curve), teto);
      julga(lead, curveNodes(curve), samplesOfCubic(curve), raio, 'curva');
    }

    // Desvio de ilha ou vaso (decisão 74): passa ao lado do corpo que
    // está no caminho, por um ponto de passagem — pela esquerda e pela
    // direita. As voltas acima seguem a corda e não teriam como contorná-lo.
    for (const wp of pontosDeDesvio(saida, chegada, field)) {
      for (const tension of TENSIONS) {
        const c1 = legCurve(saida, wp, tension);
        const c2 = legCurve(wp, chegada, tension);
        const nodes: PathNode[] = [
          { pos: c1.p0, type: 'smooth', handleIn: null, handleOut: sub(c1.p1, c1.p0), anchor: null },
          { pos: wp.pos, type: 'smooth', handleIn: sub(c1.p2, wp.pos), handleOut: sub(c2.p1, wp.pos), anchor: null },
          { pos: c2.p3, type: 'smooth', handleIn: sub(c2.p2, c2.p3), handleOut: null, anchor: null },
        ];
        const pontos = [...samplesOfCubic(c1), ...samplesOfCubic(c2).slice(1)];
        julga(lead, nodes, pontos, Math.min(minRadiusOf(c1), minRadiusOf(c2)), 'curva');
      }
    }

    // Arco-reta-arco: indispensável nas voltas grandes, onde a cúbica bica.
    for (const raio of radiiForLeg(params)) {
      // Acima do teto de giro a volta NÃO é descartada: é julgada e sai
      // marcada. Descartar aqui deixava, entre dois saltos lado a lado no
      // mesmo sentido — onde a única volta galopável gira 360 graus —,
      // apenas o bico de 0,1 m como resposta.
      for (const path of dubinsPaths(saida, chegada, raio)) {
        julga(lead, nodesFromDubins(path), samplePath(path, 0.5), Math.min(raio, teto), 'arco-reta-arco');

        // A mesma rota, arredondada: concorre como curva contínua. É o que
        // dá à volta grande a forma do croqui — ampla, sem reta cortando
        // no meio e sem quebra onde a reta vira arco (decisão 51).
        const redonda = roundDubins(path);
        julga(lead, redonda.nodes, redonda.pontos, Math.min(redonda.minRadiusM, teto), 'curva');
      }
    }

    // Volta grande assimétrica: a primeira metade num raio e a segunda
    // noutro — abre mais no começo e fecha no fim, ou o contrário. Sem
    // ela, toda meia-volta saía simétrica (decisão 82).
    for (const [r1, r2] of asymmetricRadii(params)) {
      const v = twoRadiusTurn(saida, chegada, r1, r2);
      if (v) julga(lead, v.nodes, v.pontos, Math.min(v.minRadiusM, teto), 'curva');
    }
  }
  return candidatos;
}

function leadsToTry(params: RideParams): { after: number; before: number }[] {
  const piso = (base: number) => -Math.max(0, base - MIN_STRAIGHT_M);
  const cede = (base: number) => [0, -2, -4, -6].filter((v) => v >= piso(base));
  const alonga = [6, 12, 20, 30];

  const out: { after: number; before: number }[] = [];

  // Ceder reta: as combinações dos dois lados, que são poucas e baratas.
  for (const after of cede(params.getawayM)) {
    for (const before of cede(params.approachM)) out.push({ after, before });
  }

  // Alongar: só de UM lado por vez, mais alguns simétricos. Alongar os
  // dois lados em medidas diferentes quase nunca ajuda e multiplicava o
  // custo da busca — o percurso inteiro levava um segundo e meio.
  for (const v of alonga) {
    out.push({ after: v, before: 0 });
    out.push({ after: 0, before: v });
  }
  out.push({ after: 12, before: 12 }, { after: 20, before: 20 });

  // Do mais econômico ao mais largo: mexer na reta é concessão, e só se
  // faz a que for necessária.
  out.sort(
    (a, b) =>
      Math.abs(a.after) + Math.abs(a.before) - (Math.abs(b.after) + Math.abs(b.before)),
  );
  return out.length > 0 ? out : [{ after: 0, before: 0 }];
}

/**
 * Quanto a linha gira ao todo, somando as viradas, em graus.
 *
 * Serve de medida de ECONOMIA e vale para as duas formas de volta, o que
 * é o ponto: uma curva mansa gira 60 graus, uma laçada gira 330, e uma
 * curva para trás legítima gira 270 — mas só ganha quando nada menor
 * passa nas exigências. É assim que a laçada some sem que a curva para
 * trás seja proibida junto.
 */
export function turnOfPoints(pontos: Vec2[]): number {
  let total = 0;
  for (let i = 2; i < pontos.length; i += 1) {
    const a = sub(pontos[i - 1]!, pontos[i - 2]!);
    const b = sub(pontos[i]!, pontos[i - 1]!);
    const escala = Math.hypot(a.x, a.y) * Math.hypot(b.x, b.y);
    if (escala === 0) continue;
    const cruzado = (a.x * b.y - a.y * b.x) / escala;
    const alinhado = (a.x * b.x + a.y * b.y) / escala;
    total += Math.abs(Math.atan2(cruzado, alinhado)) / DEG;
  }
  return total;
}

/** Giro com sinal a cada passo da linha (graus) e o comprimento do passo. */
interface Giro {
  deg: number;
  len: number;
}

export function signedTurns(pontos: Vec2[]): Giro[] {
  const out: Giro[] = [];
  for (let i = 2; i < pontos.length; i += 1) {
    const a = sub(pontos[i - 1]!, pontos[i - 2]!);
    const b = sub(pontos[i]!, pontos[i - 1]!);
    const escala = Math.hypot(a.x, a.y) * Math.hypot(b.x, b.y);
    const len = Math.hypot(b.x, b.y);
    if (escala === 0) {
      out.push({ deg: 0, len });
      continue;
    }
    const cruzado = (a.x * b.y - a.y * b.x) / escala;
    const alinhado = (a.x * b.x + a.y * b.y) / escala;
    out.push({ deg: Math.atan2(cruzado, alinhado) / DEG, len });
  }
  return out;
}

/** Abaixo disso a torção para o lado contrário é ruído de desenho. */
const CONTRA_MIN_DEG = 3;
/** Volta a partir da qual torcer para o outro lado é contracurva. */
const CONTRA_VOLTA_DEG = 90;

/**
 * A volta gira muito para um lado e, em algum trecho, torce para o outro.
 * É diferente do S entre dois saltos deslocados, em que as duas mãos se
 * equilibram e o giro líquido é pequeno: aqui o giro líquido é grande e
 * a torção contrária é desvio (decisão 82).
 */
function counterTurnDeg(giros: Giro[]): number {
  let pos = 0;
  let neg = 0;
  for (const g of giros) {
    if (g.deg > 0) pos += g.deg;
    else neg -= g.deg;
  }
  return Math.abs(pos - neg) >= CONTRA_VOLTA_DEG ? Math.min(pos, neg) : 0;
}

/**
 * Onde a volta é mais aberta: compara quantos metros a linha leva para
 * fazer a primeira metade do giro e a segunda. Metade que leva mais
 * metros é a parte aberta.
 */
function whereItOpens(giros: Giro[]): 'inicio' | 'meio' | 'fim' {
  const tudo = giros.reduce((t, g) => t + Math.abs(g.deg), 0);
  if (tudo < 15) return 'meio';
  // Só a parte que gira: as retas das pontas não são da volta.
  const vira = giros.filter((g) => Math.abs(g.deg) > 0.05);
  let acum = 0;
  let l1 = 0;
  let l2 = 0;
  for (const g of vira) {
    if (acum < tudo / 2) l1 += g.len;
    else l2 += g.len;
    acum += Math.abs(g.deg);
  }
  if (l1 > l2 * ABRE_RAZAO) return 'inicio';
  if (l2 > l1 * ABRE_RAZAO) return 'fim';
  return 'meio';
}

/**
 * Trocas de mão que contam: torções de pelo menos {@link CONTRA_MIN_DEG}.
 * A junção de dois arcos arredondados troca de mão por frações de grau, e
 * isso não é a linha serpenteando.
 */
export function significantInflections(pontos: Vec2[]): number {
  const corridas: number[] = [];
  for (const g of signedTurns(pontos)) {
    if (Math.abs(g.deg) < 1e-6) continue;
    const ultima = corridas.length - 1;
    if (ultima >= 0 && Math.sign(corridas[ultima]!) === Math.sign(g.deg)) corridas[ultima]! += g.deg;
    else corridas.push(g.deg);
  }
  const fortes = corridas.filter((c) => Math.abs(c) >= CONTRA_MIN_DEG);
  let trocas = 0;
  for (let i = 1; i < fortes.length; i += 1) if (Math.sign(fortes[i]!) !== Math.sign(fortes[i - 1]!)) trocas += 1;
  return trocas;
}

/** Uma metade da volta é "mais aberta" quando leva 30% mais metros. */
const ABRE_RAZAO = 1.3;

/**
 * Quantos metros do fim da volta já vêm na direção do salto (até 10° de
 * diferença): somados à reta de aproximação, dizem se o cavalo chega
 * alinhado ou ainda virando.
 */
function alignedTail(pontos: Vec2[]): number {
  const n = pontos.length;
  if (n < 2) return 0;
  const final = sub(pontos[n - 1]!, pontos[n - 2]!);
  const rumo = Math.atan2(final.y, final.x);
  let metros = 0;
  for (let i = n - 1; i > 0; i -= 1) {
    const d = sub(pontos[i]!, pontos[i - 1]!);
    let dif = Math.abs(Math.atan2(d.y, d.x) - rumo);
    if (dif > Math.PI) dif = 2 * Math.PI - dif;
    if (dif > 10 * DEG) break;
    metros += Math.hypot(d.x, d.y);
  }
  return metros;
}

const MIN_STRAIGHT_M = 3;

/** Desliza a pose ao longo da própria direção. Sinal já vem do chamador. */
const slide = (pose: Pose, metros: number): Pose => ({
  pos: add(pose.pos, scale(fromAngle(pose.heading), metros)),
  heading: pose.heading,
});

/**
 * Raios de arco a tentar, do mais amplo ao de aperto.
 *
 * Não há teto ligado ao vão: quem barra a laçada é o limite de giro, e
 * limitar o raio pelo vão só tirava da mesa a curva ampla que resolvia
 * uma virada de 70 graus em 11 m — justamente a boa.
 *
 * Começa acima do preferido, em uma vez e meia: a volta grande do croqui
 * real usa o espaço que tem, com 11 a 17 m de raio, e começar no
 * preferido deixava só voltas apertadas com uma reta cortando no meio
 * (decisão 51). Onde a volta larga não cabe, a pista a recusa.
 */
function radiiForLeg(params: RideParams): number[] {
  const raios: number[] = [params.radiusM * 1.5, params.radiusM * 1.25];
  for (let r = params.radiusM; r > params.tightRadiusM; r *= 0.85) raios.push(r);
  raios.push(params.tightRadiusM);
  return raios;
}

const galopavel = (c: CurveSolution, params: RideParams) => c.minRadiusM >= params.tightRadiusM;

/** Pares de raios (primeira metade, segunda metade) da volta assimétrica. */
function asymmetricRadii(params: RideParams): [number, number][] {
  const amplo = params.radiusM * 1.2;
  const medio = params.radiusM * 0.85;
  const fechado = params.tightRadiusM * 1.15;
  return [
    [amplo, fechado],
    [fechado, amplo],
    [amplo, medio],
    [medio, amplo],
  ];
}

const giroDe = (path: DubinsPath): number =>
  path.segments.reduce((t, seg) => t + (seg.kind === 'arco' ? seg.sweep : 0), 0);

/** A rota de Dubins que menos gira entre duas poses (o teto o juiz marca). */
function menosGira(de: Pose, para: Pose, raio: number): DubinsPath | null {
  const rotas = dubinsPaths(de, para, raio);
  return rotas.length === 0 ? null : rotas.sort((a, b) => giroDe(a) - giroDe(b))[0]!;
}

/** Um arco só, como rota: começa na pose, gira `sweep` graus para `hand`. */
function arcPath(de: Pose, raio: number, sweep: number, hand: ArcSegment['hand']): DubinsPath {
  const turn = hand === 'direita' ? 1 : -1;
  const center = add(de.pos, scale(fromAngle(de.heading + turn * 90), raio));
  const startAngle = de.heading - turn * 90;
  const endAngle = startAngle + turn * sweep;
  const length = raio * sweep * DEG;
  return {
    word: hand === 'direita' ? 'D' : 'E',
    segments: [{ kind: 'arco', center, radius: raio, startAngle, endAngle, hand, sweep, length }],
    length,
    radius: raio,
  };
}

/**
 * Volta assimétrica: o primeiro arco da volta-base é refeito noutro raio
 * (mais aberto ou mais fechado) e, de onde ele termina, a rota de menor
 * giro no segundo raio leva ao salto. Assim a volta abre mais no começo e
 * fecha no fim, ou o contrário, sem trocar de mão.
 */
function twoRadiusTurn(
  de: Pose,
  para: Pose,
  r1: number,
  r2: number,
): { nodes: PathNode[]; pontos: Vec2[]; minRadiusM: number } | null {
  const base = menosGira(de, para, (r1 + r2) / 2);
  // Só para voltas de verdade: numa virada mansa a cúbica assimétrica já
  // cobre, e aqui sobraria rabisco.
  const primeiro = base?.segments[0];
  if (!base || giroDe(base) < 120 || primeiro?.kind !== 'arco') return null;
  const h1 = arcPath(de, r1, primeiro.sweep, primeiro.hand);
  const fim = poseAt(h1, h1.length);
  const h2 = menosGira(fim, para, r2);
  if (!h2) return null;
  const a = roundDubins(h1);
  const b = roundDubins(h2);
  const juntaA = a.nodes[a.nodes.length - 1]!;
  const juntaB = b.nodes[0]!;
  const nodes: PathNode[] = [
    ...a.nodes.slice(0, -1),
    { ...juntaA, handleOut: juntaB.handleOut },
    ...b.nodes.slice(1),
  ];
  return { nodes, pontos: [...a.pontos, ...b.pontos.slice(1)], minRadiusM: Math.min(a.minRadiusM, b.minRadiusM) };
}

/**
 * A ordem do juiz.
 *
 * Primeiro separa quem dá para galopar de quem não dá: raio abaixo do
 * piso não é volta, é bico, e não pode ganhar de nenhuma volta de verdade
 * — nem de uma que encoste na cerca ou passe rente a um obstáculo, que ao
 * menos mostra ao desenhador um caminho possível e o problema a resolver.
 * Era essa a ordem que deixava passar o bico de 0,1 m (decisão 49).
 *
 * Depois, o que é impedimento de fato: sair da pista, atropelar obstáculo
 * ou girar além do teto. Entre as ingalopáveis vale o menor aperto.
 *
 * Entre as galopáveis vence o menor CUSTO, que soma o giro total da volta
 * com uma taxa por troca de mão. É a medida de economia, e é ela que
 * separa a laçada da curva para trás: as duas giram muito, mas a laçada
 * aparece onde havia opção mansa, e a curva para trás só aparece quando
 * não havia nenhuma. Comparar giro resolve as duas de uma vez, sem
 * precisar proibir volta grande — proibir era o que quebrava o traçado
 * entre saltos colados, onde a volta grande é a única saída.
 *
 * A taxa da inflexão vale 90 graus de curva: cavaleiro que vai virar à
 * direita não começa torcendo à esquerda, e o desvio custa caro no olho
 * de quem monta mesmo quando o raio está bom.
 *
 * A reta mexida entra por último. Só se cede ou se alonga reta quando
 * isso compra alguma coisa.
 *
 * O custo é comparado em degraus de 5 graus, e não no valor cru. Sem
 * isso, meio grau de diferença decidia antes da amplitude e TODA volta
 * caía no raio de aperto: uma curva de raio 6 gira um tiquinho menos que
 * a mesma curva de raio 11, e ganhava por isso. Empate em degrau devolve
 * a decisão a quem deve tê-la — a curva mais ampla.
 *
 * Duas taxas de REDONDEZA entram no custo (decisão 50), porque só giro e
 * raio deixavam passar voltas que se leem como esquina:
 *
 * - O arco-reta-arco paga uma taxa fixa pela quebra: a curvatura salta de
 *   zero, na reta, ao máximo, no arco, de uma vez. A curva contínua cresce
 *   e diminui aos poucos, que é como o cavalo vira galopando. Sem a taxa,
 *   dois graus a mais de giro bastavam para a curva contínua de raio 19,7
 *   perder para um arco de 11 entre retas.
 * - Todo aperto abaixo do raio preferido paga em proporção: 30 graus por
 *   raio preferido inteiro de diferença (a 5,5 m, metade de 11, paga 30).
 *   É o que impede um arco no raio mínimo de ganhar de uma curva ampla só
 *   por girar três graus menos.
 *
 * O arco-reta-arco continua ganhando onde é insubstituível — voltas por
 * fora, meias-voltas —, porque ali a curva contínua bica e sai do páreo.
 */
const TAXA_INFLEXAO = 90;
const TAXA_QUEBRA = 20;
const TAXA_APERTO = 30;
/**
 * Meio grau por metro de reta ALONGADA. Sem ela, no empate de custo o
 * desempate pelo raio levava toda volta ao maior raio que coubesse, e a
 * linha encostava na cerca por nada. Com ela a volta larga só ganha
 * quando compra redondeza de verdade: a meia-volta de 210 graus que troca
 * dois arcos apertados e uma reta diagonal por uma volta ampla paga 6
 * graus pelos 12 m e ainda vence por 8 (decisão 51).
 */
const TAXA_ALONGA = 0.5;
const DEGRAU_CUSTO = 5;
/** Graus de custo por grau de contracurva. */
const TAXA_CONTRA = 3;
/** Graus de custo por metro que falta de chegada alinhada. */
const TAXA_CHEGADA = 6;

function compara(a: CurveSolution, b: CurveSolution, params: RideParams): number {
  const ga = galopavel(a, params);
  const gb = galopavel(b, params);
  if (ga !== gb) return ga ? -1 : 1;

  const duros = (c: CurveSolution) => c.warnings.filter((w) => w !== 'curva-fechada').length;
  if (duros(a) !== duros(b)) return duros(a) - duros(b);

  const mexeu = (c: CurveSolution) => Math.abs(c.lead.after) + Math.abs(c.lead.before);
  if (!ga) return b.minRadiusM - a.minRadiusM || mexeu(a) - mexeu(b);

  const custo = (c: CurveSolution) => {
    const quebra = c.shape === 'arco-reta-arco' ? TAXA_QUEBRA : 0;
    const aperto = TAXA_APERTO * Math.max(0, params.radiusM / c.minRadiusM - 1);
    const alonga = TAXA_ALONGA * (Math.max(0, c.lead.after) + Math.max(0, c.lead.before));
    // Contracurva custa como mais uma troca de mão; chegar sem reta custa
    // por metro que falta (decisão 82).
    const contra = TAXA_CONTRA * c.counterDeg;
    const chegada = TAXA_CHEGADA * Math.max(0, CHEGADA_MIN_M - c.arrivalM);
    return Math.round(
      (c.turnDeg + c.inflections * TAXA_INFLEXAO + quebra + aperto + alonga + contra + chegada) / DEGRAU_CUSTO,
    );
  };
  return custo(a) - custo(b) || b.minRadiusM - a.minRadiusM || mexeu(a) - mexeu(b);
}

/**
 * Cúbica entre duas poses com as alças de um arco de círculo.
 *
 * Para um arco de ângulo θ e corda c, a Bézier que melhor o imita tem
 * alças de (4/3)·tan(θ/4)·R, com R = c / (2·sen(θ/2)). Sem giro, cai no
 * terço da corda, que é a reta. Assim cada pedaço é quase um arco quando
 * pode ser, e uma transição suave quando junta reta e arco.
 */
function arcLikeCubic(a: Pose, b: Pose): Cubic {
  const corda = distance(a.pos, b.pos);
  const giro = Math.abs(((((b.heading - a.heading) % 360) + 540) % 360) - 180) * DEG;
  const alca =
    giro < 1e-3
      ? corda / 3
      : (4 / 3) * Math.tan(giro / 4) * (corda / (2 * Math.sin(giro / 2)));
  return {
    p0: a.pos,
    p1: add(a.pos, scale(fromAngle(a.heading), alca)),
    p2: sub(b.pos, scale(fromAngle(b.heading), alca)),
    p3: b.pos,
  };
}

/**
 * O arco-reta-arco arredondado.
 *
 * Tira poses ao longo da rota — uma a cada 60 graus de giro, no mínimo
 * duas partes — e liga cada par por uma cúbica de arco. A rota é a mesma;
 * o que muda é a curvatura, que deixa de saltar de zero ao máximo na
 * junta da reta com o arco. É o salto que o olho lê como esquina
 * (decisão 50).
 */
export function roundDubins(path: DubinsPath): { nodes: PathNode[]; pontos: Vec2[]; minRadiusM: number } {
  const giro = path.segments.reduce((t, seg) => t + (seg.kind === 'arco' ? seg.sweep : 0), 0);
  const partes = Math.max(2, Math.ceil(giro / 60));
  const poses = Array.from({ length: partes + 1 }, (_, i) => poseAt(path, (path.length * i) / partes));
  const cubicas = poses.slice(1).map((b, i) => arcLikeCubic(poses[i]!, b));

  const nodes: PathNode[] = poses.map((p, i) => ({
    pos: p.pos,
    type: 'smooth',
    handleIn: i > 0 ? sub(cubicas[i - 1]!.p2, p.pos) : null,
    handleOut: i < cubicas.length ? sub(cubicas[i]!.p1, p.pos) : null,
    anchor: null,
  }));
  const pontos = cubicas.flatMap((c, i) => samplesOfCubic(c, 30).slice(i === 0 ? 0 : 1));
  const minRadiusM = Math.min(...cubicas.map((c) => minRadiusOf(c)));
  return { nodes, pontos, minRadiusM };
}

/** A curva em nós do traçado: dois nós, alças na direção dos saltos. */
export function curveNodes(c: Cubic): PathNode[] {
  return [
    { pos: c.p0, type: 'smooth', handleIn: null, handleOut: sub(c.p1, c.p0), anchor: null },
    { pos: c.p3, type: 'smooth', handleIn: sub(c.p2, c.p3), handleOut: null, anchor: null },
  ];
}

/** A reta entre a pose do salto e o começo/fim da curva passa por ilha ou vaso? */
function retaAtropelaDecor(
  lead: { after: number; before: number },
  from: Pose,
  to: Pose,
  field: Field,
): boolean {
  const corpos = field.decor ?? [];
  if (corpos.length === 0) return false;
  const amostra = (a: Vec2, b: Vec2): Vec2[] => {
    const n = Math.max(2, Math.ceil(distance(a, b) / 0.5));
    return Array.from({ length: n + 1 }, (_, i) => ({ x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n }));
  };
  const pontos = [
    ...(lead.after > 0 ? amostra(from.pos, slide(from, lead.after).pos) : []),
    ...(lead.before > 0 ? amostra(slide(to, -lead.before).pos, to.pos) : []),
  ];
  return corpos.some((c) => pontos.some((p) => insidePolygon(p, c)));
}

/** Folga entre o traçado e a borda da ilha ou do vaso que ele contorna. */
const FOLGA_DECOR_M = 2;

/**
 * Pontos de passagem para contornar os corpos decorativos que ficam no
 * caminho da corda: um de cada lado, além da borda do corpo, com a
 * direção da corda — a volta passa ao lado e segue.
 */
function pontosDeDesvio(de: Pose, para: Pose, field: Field): Pose[] {
  const corpos = field.decor ?? [];
  if (corpos.length === 0) return [];
  const corda = sub(para.pos, de.pos);
  const len = Math.hypot(corda.x, corda.y);
  if (len < 1) return [];
  const u = { x: corda.x / len, y: corda.y / len };
  const n = { x: -u.y, y: u.x };
  const rumo = (Math.atan2(u.y, u.x) * 180) / Math.PI;
  const out: Pose[] = [];
  for (const c of corpos) {
    const ao = c.map((p) => ({ t: (p.x - de.pos.x) * u.x + (p.y - de.pos.y) * u.y, l: (p.x - de.pos.x) * n.x + (p.y - de.pos.y) * n.y }));
    const tMin = Math.min(...ao.map((q) => q.t));
    const tMax = Math.max(...ao.map((q) => q.t));
    const lMin = Math.min(...ao.map((q) => q.l));
    const lMax = Math.max(...ao.map((q) => q.l));
    // Só o que está entre as duas pontas e atravessa a corda.
    if (tMax < 0 || tMin > len || lMin > 0 || lMax < 0) continue;
    const t = (tMin + tMax) / 2;
    for (const l of [lMax + FOLGA_DECOR_M, lMin - FOLGA_DECOR_M]) {
      out.push({ pos: { x: de.pos.x + u.x * t + n.x * l, y: de.pos.y + u.y * t + n.y * l }, heading: rumo });
    }
  }
  return out;
}
