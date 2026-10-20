import { toMillimeterPrecision } from '@core/geometry/snap';
import { scale, sub, type Vec2 } from '@core/geometry/vec';
import { createPathNode, legsFor, segmentAt, smoothedNodes } from '@core/model/path';
import { addObject } from './ops';
import type {
  CoursePath,
  CourseDocument,
  DistanceMode,
  ObjectId,
  PathNode,
} from '@core/model/types';

/**
 * Operações sobre o traçado.
 *
 * O programa nunca decide por onde o cavalo passa: cria, move e curva o
 * que o desenhador pediu, e mede o resultado (§18). Não há "traçado
 * automático" nem ajuste de curva por conta própria.
 */

function pathOf(doc: CourseDocument, id: ObjectId): CoursePath | null {
  const obj = doc.objects.find((o) => o.id === id);
  return obj?.kind === 'path' && !obj.locked ? obj : null;
}

const mm = (p: Vec2): Vec2 => ({
  x: toMillimeterPrecision(p.x),
  y: toMillimeterPrecision(p.y),
});

export function addNode(doc: CourseDocument, id: ObjectId, pos: Vec2): void {
  const path = pathOf(doc, id);
  if (!path) return;
  path.nodes.push(createPathNode(mm(pos)));
  syncLegs(path);
}

/** Insere um nó no meio de um trecho, sem alterar as pontas. */
export function insertNode(doc: CourseDocument, id: ObjectId, legIndex: number, pos: Vec2): number | null {
  const path = pathOf(doc, id);
  if (!path || legIndex < 0 || legIndex >= path.nodes.length - 1) return null;
  path.nodes.splice(legIndex + 1, 0, createPathNode(mm(pos)));
  syncLegs(path);
  return legIndex + 1;
}

export function moveNode(doc: CourseDocument, id: ObjectId, index: number, pos: Vec2): void {
  const path = pathOf(doc, id);
  const node = path?.nodes[index];
  if (!node) return;
  node.pos = mm(pos);
  node.anchor = null; // mover à mão desfaz o vínculo com o obstáculo
}

/** Um traçado precisa de dois nós; abaixo disso ele deixa de existir. */
export function removeNode(doc: CourseDocument, id: ObjectId, index: number): boolean {
  const path = pathOf(doc, id);
  if (!path || path.nodes.length <= 2) return false;
  path.nodes.splice(index, 1);
  syncLegs(path);
  return true;
}

/**
 * Move uma alça de curva. Em nó liso, a alça oposta acompanha em espelho —
 * é o que mantém a passagem suave, sem bico, quando o desenhador queria
 * uma curva contínua.
 */
export function moveHandle(
  doc: CourseDocument,
  id: ObjectId,
  index: number,
  which: 'in' | 'out',
  handle: Vec2,
): void {
  const path = pathOf(doc, id);
  const node = path?.nodes[index];
  if (!node) return;

  const valor = mm(handle);
  if (which === 'out') node.handleOut = valor;
  else node.handleIn = valor;

  if (node.type === 'smooth') {
    const oposta = which === 'out' ? 'handleIn' : 'handleOut';
    const atual = node[oposta];
    // Preserva o comprimento da alça oposta, invertendo só a direção.
    const comprimentoAtual = atual ? Math.hypot(atual.x, atual.y) : 0;
    const comprimentoNovo = Math.hypot(valor.x, valor.y);
    const fator =
      comprimentoNovo > 1e-9 && comprimentoAtual > 1e-9
        ? comprimentoAtual / comprimentoNovo
        : 1;
    // Sem arredondar: a alça espelhada é derivada, não digitada, e
    // arredondá-la quebraria a colinearidade — ou seja, deixaria um bico
    // no nó que o desenhador pediu liso.
    node[oposta] = scale(valor, -fator);
  }
}

/**
 * Alterna entre canto e liso. Ao virar liso, cria alças na direção dos
 * vizinhos, para a curva nascer parecida com o que estava desenhado.
 */
export function setNodeType(
  doc: CourseDocument,
  id: ObjectId,
  index: number,
  type: PathNode['type'],
): void {
  const path = pathOf(doc, id);
  const node = path?.nodes[index];
  if (!path || !node) return;

  node.type = type;
  if (type === 'corner') {
    node.handleIn = null;
    node.handleOut = null;
    return;
  }

  const anterior = path.nodes[index - 1];
  const proximo = path.nodes[index + 1];
  const referencia = proximo ?? anterior;
  if (!referencia) return;

  const direcao = sub(referencia.pos, node.pos);
  const comprimento = Math.hypot(direcao.x, direcao.y) / 3;
  const unit =
    comprimento > 1e-9
      ? scale(direcao, comprimento / Math.hypot(direcao.x, direcao.y) / 1)
      : { x: 0, y: 0 };
  node.handleOut = mm(unit);
  node.handleIn = mm(scale(unit, -1));
}

/**
 * Suaviza o traçado inteiro: os nós continuam onde estão, mas ganham
 * tangentes coerentes com os vizinhos, virando uma curva contínua.
 *
 * É o que transforma a poligonal de cliques na linha de percurso que o
 * desenhador tinha em mente.
 */
export function smoothPath(doc: CourseDocument, id: ObjectId, tension = 1): void {
  const path = pathOf(doc, id);
  if (!path) return;
  path.nodes = smoothedNodes(path.nodes, tension);
}

/** Volta tudo a canto: retas entre os nós, sem nenhuma curva. */
export function sharpenPath(doc: CourseDocument, id: ObjectId): void {
  const path = pathOf(doc, id);
  if (!path) return;
  for (const node of path.nodes) {
    node.type = 'corner';
    node.handleIn = null;
    node.handleOut = null;
  }
}

/**
 * Liga ou desliga, no croqui, as distâncias entre obstáculos escolhidas.
 * `visivel` em cada chave "idDe>idPara" (decisão 54).
 */
export function setObstacleDistances(
  doc: CourseDocument,
  id: ObjectId,
  chaves: string[],
  visivel: boolean,
): void {
  const path = pathOf(doc, id);
  if (!path) return;
  const atual = { ...(path.obstacleDistances ?? {}) };
  for (const k of chaves) {
    if (visivel) atual[k] = true;
    else delete atual[k];
  }
  path.obstacleDistances = atual;
}

export function setDistanceMode(doc: CourseDocument, id: ObjectId, mode: DistanceMode): void {
  const path = pathOf(doc, id);
  if (path) path.distanceMode = mode;
}

export function setTotalLabel(
  doc: CourseDocument,
  id: ObjectId,
  patch: Partial<CoursePath['totalLabel']>,
): void {
  const path = pathOf(doc, id);
  if (!path) return;
  path.totalLabel = { ...path.totalLabel, ...patch };
  if (path.totalLabel.decimals < 0) path.totalLabel.decimals = 0;
  if (path.totalLabel.decimals > 3) path.totalLabel.decimals = 3;
}

/** Endireita o trecho, removendo as alças das duas pontas. */
export function straightenLeg(doc: CourseDocument, id: ObjectId, legIndex: number): void {
  const path = pathOf(doc, id);
  const a = path?.nodes[legIndex];
  const b = path?.nodes[legIndex + 1];
  if (!a || !b) return;
  a.handleOut = null;
  b.handleIn = null;
  if (a.type === 'smooth') a.handleIn = null;
  if (b.type === 'smooth') b.handleOut = null;
}

export function setPathStyle(
  doc: CourseDocument,
  id: ObjectId,
  patch: Partial<CoursePath['style']>,
): void {
  const path = pathOf(doc, id);
  if (!path) return;
  path.style = { ...path.style, ...patch };
  if (!(path.style.strokeMm > 0)) path.style.strokeMm = 0.4;
}

export function setLegLabel(
  doc: CourseDocument,
  id: ObjectId,
  legIndex: number,
  patch: Partial<CoursePath['legs'][number]['label']>,
): void {
  const path = pathOf(doc, id);
  const leg = path?.legs[legIndex];
  if (!leg) return;
  leg.label = { ...leg.label, ...patch };
  if (leg.label.decimals < 0) leg.label.decimals = 0;
  if (leg.label.decimals > 3) leg.label.decimals = 3;
}

/** Liga/desliga o rótulo de todos os trechos de uma vez. */
export function setAllLegLabels(doc: CourseDocument, id: ObjectId, visible: boolean): void {
  const path = pathOf(doc, id);
  if (!path) return;
  for (const leg of path.legs) leg.label.visible = visible;
}

/**
 * Mantém a lista de trechos coerente com a de nós. Preserva os rótulos já
 * ajustados pelo desenhador nos trechos que continuam existindo.
 */
function syncLegs(path: CoursePath): void {
  const novos = legsFor(path.nodes.length);
  path.legs = novos.map((leg, i) => (path.legs[i] ? { ...leg, label: path.legs[i]!.label } : leg));
}

/**
 * Põe no croqui o traçado de um assistente, SUBSTITUINDO o que um
 * assistente gerou antes (B-04): rodar duas vezes não empilha linhas. O
 * traçado novo herda a apresentação do anterior — estilo, modo de
 * distância e distâncias escolhidas —, que é trabalho do desenhador e não
 * do assistente. Traçado à mão fica intocado. Tudo num passo só de
 * desfazer, porque quem chama já está dentro de um `apply`.
 */
export function placeAssistantPath(doc: CourseDocument, path: CoursePath): void {
  const anterior = doc.objects.find(
    (o): o is CoursePath => o.kind === 'path' && o.assistant === true,
  );
  const novo: CoursePath = { ...path, assistant: true };
  if (anterior) {
    novo.style = { ...anterior.style };
    novo.distanceMode = anterior.distanceMode;
    novo.totalLabel = { ...anterior.totalLabel };
    novo.obstacleDistances = { ...anterior.obstacleDistances };
  }
  doc.objects = doc.objects.filter((o) => !(o.kind === 'path' && o.assistant === true));
  addObject(doc, novo);
}

/** Ponto do meio (t = 0,5) da cúbica de um trecho — é por ele que se curva. */
export function legHalfPoint(path: CoursePath, leg: number): Vec2 | null {
  const c = segmentAt(path, leg);
  if (!c) return null;
  return {
    x: (c.p0.x + 3 * c.p1.x + 3 * c.p2.x + c.p3.x) / 8,
    y: (c.p0.y + 3 * c.p1.y + 3 * c.p2.y + c.p3.y) / 8,
  };
}

/** Alça mais curta que isso some na prática e deixaria o nó com bico. */
const ALCA_MIN_M = 0.5;

/**
 * Curva um trecho arrastando o meio dele (B-28): o ponto do meio da curva
 * vai para `alvo`. É a alça única do editor de referência, sem ferramenta
 * nova — vale para traçado à mão, por trechos ou automático.
 *
 * Na cúbica, o meio é (P0 + P3)/2 + 3/8·(h0 + h3), com h0 a alça de saída
 * do primeiro nó e h3 a de entrada do segundo. Então basta repartir
 * D = 8/3·(alvo − meio da corda) entre as duas alças:
 *
 * - nó preso a obstáculo mantém a DIREÇÃO da alça — o traçado continua
 *   cruzando o obstáculo a 90° — e só muda o comprimento;
 * - nó livre aceita qualquer direção.
 *
 * Com os dois nós presos e as duas direções paralelas (dois saltos em
 * linha), não há como curvar sem tirar o 90°: o trecho fica reto, como
 * deve.
 */
export function bendLeg(doc: CourseDocument, id: ObjectId, leg: number, alvo: Vec2): void {
  const path = pathOf(doc, id);
  const a = path?.nodes[leg];
  const b = path?.nodes[leg + 1];
  if (!path || path.locked || !a || !b) return;

  const meio = { x: (a.pos.x + b.pos.x) / 2, y: (a.pos.y + b.pos.y) / 2 };
  const D = scale(sub(alvo, meio), 8 / 3);
  const dir = (h: Vec2 | null) => {
    const n = h ? Math.hypot(h.x, h.y) : 0;
    return h && n > 1e-9 ? { x: h.x / n, y: h.y / n } : null;
  };
  const u0 = a.anchor ? dir(a.handleOut) : null;
  const u3 = b.anchor ? dir(b.handleIn) : null;

  let h0: Vec2;
  let h3: Vec2;
  if (u0 && u3) {
    const det = u0.x * u3.y - u0.y * u3.x;
    if (Math.abs(det) < 0.05) return;
    const ca = (D.x * u3.y - D.y * u3.x) / det;
    const cb = (u0.x * D.y - u0.y * D.x) / det;
    h0 = scale(u0, Math.max(ALCA_MIN_M, ca));
    h3 = scale(u3, Math.max(ALCA_MIN_M, cb));
  } else if (u0) {
    h0 = scale(u0, Math.max(ALCA_MIN_M, (D.x * u0.x + D.y * u0.y) / 2));
    h3 = sub(D, h0);
  } else if (u3) {
    h3 = scale(u3, Math.max(ALCA_MIN_M, (D.x * u3.x + D.y * u3.y) / 2));
    h0 = sub(D, h3);
  } else {
    h0 = scale(D, 0.5);
    h3 = scale(D, 0.5);
  }

  moveHandle(doc, id, leg, 'out', h0);
  moveHandle(doc, id, leg + 1, 'in', h3);
}
