import { add, DEG, fromAngle, rotate, scale, sub, type Vec2 } from '@core/geometry/vec';
import { newId } from '@core/model/ids';
import { createPath } from '@core/model/path';
import type {
  CourseDocument,
  CoursePath,
  ExerciseKind,
  MeasureLine,
  ObjectId,
  Obstacle,
  ObstacleType,
  PathNode,
  SceneObject,
} from '@core/model/types';
import { createMeasure } from './measures';
import { createObstacle, obstacleDef } from './obstacles';

/**
 * Exercícios de ginástica (B-37, decisão 89).
 *
 * Cada exercício é gerado num sistema próprio — a âncora (o primeiro
 * elemento) perto da origem, saltado para a direita (leste) — e depois
 * posto na pista com uma posição e um giro. Todos os elementos levam a
 * mesma marca (`exercise`) e o mesmo vínculo: andam juntos, e "Editar
 * ginástica" apaga e redesenha o conjunto no mesmo lugar e direção.
 *
 * Distâncias: de vara a vara — da vara de saída de um até a vara de
 * entrada do seguinte. Em cavalete, vara no chão, X e vertical, que não
 * têm largura, isso é o mesmo que de centro a centro.
 */

export type Sentido = 'ida' | 'volta' | 'duplo' | 'sem';
export type ChaoTipo = 'cavalete' | 'plano';

export interface CavaletesParams {
  count: number;
  spacingM: number;
  type: ChaoTipo;
  cotas: boolean;
  numerar: boolean;
}

export interface RelogioParams {
  diameterM: number;
  sentido: 'horario' | 'antihorario' | 'duplo';
  type: ObstacleType;
  cotas: boolean;
}

export interface Saida {
  on: boolean;
  type: ObstacleType;
  /** De vara a vara, medida sobre a linha (curva ou reta). */
  distM: number;
  /** Quanto a linha gira até o salto: 0 = reta; negativo abre à esquerda. */
  angleDeg: number;
  sentido: Sentido;
}

export interface PeDeGalinhaParams {
  /** Completo: cavaletes, X e salto antes do central. Simples: só o final. */
  completo: boolean;
  cavaletes: { on: boolean; count: number; spacingM: number; type: ChaoTipo };
  x: { on: boolean; distM: number };
  salto: { on: boolean; type: ObstacleType; distM: number };
  central: { type: ObstacleType; distM: number; duplo: { on: boolean; type: ObstacleType; distM: number } };
  saidas: { esquerda: Saida; reta: Saida; direita: Saida };
  cotas: boolean;
  numerar: boolean;
}

export type ExerciseParams = CavaletesParams | RelogioParams | PeDeGalinhaParams;

export const DEFAULT_CAVALETES: CavaletesParams = { count: 4, spacingM: 1.4, type: 'cavalete', cotas: true, numerar: false };

export const DEFAULT_RELOGIO: RelogioParams = { diameterM: 20, sentido: 'horario', type: 'plano', cotas: true };

/** Os números do exemplo do usuário (pé de galinha completo). */
export function defaultPeDeGalinha(completo: boolean): PeDeGalinhaParams {
  const curva = (angleDeg: number): Saida => ({ on: true, type: 'vertical', distM: 23.5, angleDeg, sentido: 'ida' });
  return {
    completo,
    cavaletes: { on: true, count: 4, spacingM: 1.4, type: 'cavalete' },
    x: { on: true, distM: 2.8 },
    salto: { on: true, type: 'vertical', distM: 5.8 },
    central: { type: 'oxer', distM: 9, duplo: { on: false, type: 'oxer', distM: 7 } },
    saidas: {
      esquerda: curva(-35),
      reta: { on: true, type: 'oxer', distM: 20.5, angleDeg: 0, sentido: 'ida' },
      direita: curva(35),
    },
    cotas: true,
    numerar: false,
  };
}

/** O exercício gerado, no sistema próprio. */
export interface Generated {
  obstacles: Obstacle[];
  extras: (MeasureLine | CoursePath)[];
}

const meia = (type: ObstacleType): number => (obstacleDef(type).spreadM ?? 0) / 2;

/** Elemento saltado na direção `heading` (graus), com o sentido pedido. */
function elemento(type: ObstacleType, pos: Vec2, heading: number, sentido: Sentido): Obstacle {
  const o = createObstacle(type, pos, '');
  o.rotation = heading + 90;
  o.arrow = { ...o.arrow, visible: sentido !== 'sem', reversed: sentido === 'volta', both: sentido === 'duplo' };
  return o;
}

/** Cota de vara a vara entre dois elementos em linha, afastada para o lado. */
function cotaEntre(a: Obstacle, b: Obstacle, lado: number): MeasureLine {
  const xa = a.pos.x + meia(a.type);
  const xb = b.pos.x - meia(b.type);
  return createMeasure({ x: xa, y: lado }, { x: xb, y: lado });
}

/** Elementos em linha, cada um a uma distância (de vara a vara) do anterior. */
function emLinha(itens: { type: ObstacleType; distM: number; sentido?: Sentido }[], x0 = 0): Obstacle[] {
  const out: Obstacle[] = [];
  let x = x0;
  itens.forEach((it, i) => {
    if (i > 0) x += meia(itens[i - 1]!.type) + it.distM + meia(it.type);
    out.push(elemento(it.type, { x, y: 0 }, 0, it.sentido ?? 'ida'));
  });
  return out;
}

function numera(obs: Obstacle[]): void {
  obs.forEach((o, i) => {
    o.number = String(i + 1);
  });
}

export function generateCavaletes(p: CavaletesParams): Generated {
  const n = Math.max(1, Math.round(p.count));
  const obstacles = emLinha(Array.from({ length: n }, () => ({ type: p.type, distM: p.spacingM, sentido: 'sem' as const })));
  if (p.numerar) numera(obstacles);
  const lado = -(obstacleDef(p.type).faceWidthM / 2 + 1);
  const extras = p.cotas && n > 1 ? [cotaEntre(obstacles[0]!, obstacles[1]!, lado)] : [];
  return { obstacles, extras };
}

export function generateRelogio(p: RelogioParams): Generated {
  const r = p.diameterM / 2;
  // 0°, 90°, 180°, 270° a partir do alto, cada vara no sentido do raio;
  // horário: o salto aponta para a tangente que gira no sentido do relógio.
  const obstacles = [-90, 0, 90, 180].map((a) => {
    const pos = scale(fromAngle(a), r);
    const heading = p.sentido === 'antihorario' ? a - 90 : a + 90;
    return elemento(p.type, pos, heading, p.sentido === 'duplo' ? 'duplo' : 'ida');
  });
  // O diâmetro, paralelo ao eixo de cima a baixo e afastado dele: em cima
  // do eixo a cota cobriria as varas.
  const extras = p.cotas ? [createMeasure({ x: 1.5, y: -r }, { x: 1.5, y: r })] : [];
  return { obstacles, extras };
}

/** Ponto e direção a `s` metros sobre o arco que sai de `inicio` para leste e gira `angulo` em `L` metros. */
function noArco(inicio: Vec2, L: number, anguloDeg: number, s: number): { p: Vec2; heading: number } {
  const th = anguloDeg * DEG;
  if (Math.abs(th) < 1e-6) return { p: add(inicio, { x: s, y: 0 }), heading: 0 };
  const raio = L / th;
  const phi = (th * s) / L;
  return { p: add(inicio, { x: raio * Math.sin(phi), y: raio * (1 - Math.cos(phi)) }), heading: phi / DEG };
}

/**
 * Onde o salto de uma saída fica: a `distM` (de vara a vara) sobre o arco
 * que sai da vara de saída do central e gira `angleDeg`; o salto, de frente
 * para a linha. Exportado para a prévia arrastar sobre o arco.
 */
export function saidaPose(saidaDe: Vec2, s: Saida): { pos: Vec2; heading: number; entrada: Vec2 } {
  const fim = noArco(saidaDe, s.distM, s.angleDeg, s.distM);
  return { pos: add(fim.p, scale(fromAngle(fim.heading), meia(s.type))), heading: fim.heading, entrada: fim.p };
}

/** A linha tracejada de uma saída, do centro do central ao centro do salto. */
function linhaDaSaida(centro: Vec2, saidaDe: Vec2, s: Saida, destino: Vec2): CoursePath {
  const nodes: PathNode[] = [];
  const no = (pos: Vec2, hin: Vec2 | null, hout: Vec2 | null): PathNode => ({
    pos,
    type: 'smooth',
    handleIn: hin,
    handleOut: hout,
    anchor: null,
  });
  nodes.push(no(centro, null, null));
  // Arco em pedaços de até 45°, cada um como cúbica de arco.
  const partes = Math.max(1, Math.ceil(Math.abs(s.angleDeg) / 45));
  const passos = Array.from({ length: partes + 1 }, (_, i) => noArco(saidaDe, s.distM, s.angleDeg, (s.distM * i) / partes));
  const alca = (s.distM / partes) * (Math.abs(s.angleDeg) < 1e-6 ? 1 / 3 : (4 / 3) * Math.tan((s.angleDeg * DEG) / partes / 4) / ((s.angleDeg * DEG) / partes));
  passos.forEach((q, i) => {
    const t = fromAngle(q.heading);
    nodes.push(no(q.p, i > 0 ? scale(t, -alca) : null, i < partes ? scale(t, alca) : null));
  });
  nodes.push(no(destino, null, null));
  const path = createPath(nodes);
  path.style = { dash: 'dotted', strokeMm: 0.25, color: '#333333' };
  path.distanceMode = 'nenhum';
  // O rótulo da distância vai no meio da linha da saída (só a parte curva).
  path.label = { text: `${formatoMetros(s.distM)}`, s: sub(saidaDe, centro).x + s.distM / 2 };
  return path;
}

const formatoMetros = (m: number) => `${m.toFixed(m % 1 === 0 ? 0 : 2).replace('.', ',')} m`;

export function generatePeDeGalinha(p: PeDeGalinhaParams): Generated {
  const cadeia: { type: ObstacleType; distM: number; sentido?: Sentido }[] = [];
  if (p.completo && p.cavaletes.on) {
    for (let i = 0; i < Math.max(1, Math.round(p.cavaletes.count)); i += 1) {
      cadeia.push({ type: p.cavaletes.type, distM: p.cavaletes.spacingM, sentido: 'sem' });
    }
  }
  if (p.completo && p.x.on) cadeia.push({ type: 'x', distM: p.x.distM });
  if (p.completo && p.salto.on) cadeia.push({ type: p.salto.type, distM: p.salto.distM });
  cadeia.push({ type: p.central.type, distM: p.central.distM });
  if (p.central.duplo.on) cadeia.push({ type: p.central.duplo.type, distM: p.central.duplo.distM });

  const linha = emLinha(cadeia);
  const central = linha[linha.length - 1]!;
  const saidaDe = { x: central.pos.x + meia(central.type), y: 0 };

  const extras: (MeasureLine | CoursePath)[] = [];
  const saidas: Obstacle[] = [];
  for (const s of [p.saidas.esquerda, p.saidas.reta, p.saidas.direita]) {
    if (!s.on) continue;
    const pose = saidaPose(saidaDe, s);
    const o = elemento(s.type, pose.pos, pose.heading, s.sentido);
    saidas.push(o);
    if (p.cotas) extras.push(linhaDaSaida(central.pos, saidaDe, s, pose.pos));
  }

  if (p.cotas) {
    // Cotas da cadeia reta: uma para os cavaletes (o espaçamento), uma por intervalo depois deles.
    const larg = Math.max(...linha.map((o) => o.faceWidthM)) / 2 + 1;
    const nCav = p.completo && p.cavaletes.on ? Math.max(1, Math.round(p.cavaletes.count)) : 0;
    for (let i = 1; i < linha.length; i += 1) {
      if (i < nCav && i > 1) continue;
      extras.push(cotaEntre(linha[i - 1]!, linha[i]!, -larg));
    }
  }
  const obstacles = [...linha, ...saidas];
  if (p.numerar) numera(obstacles.filter((o) => o.type !== 'cavalete' && o.type !== 'plano'));
  return { obstacles, extras };
}

export function generateExercise(kind: ExerciseKind, params: ExerciseParams): Generated {
  if (kind === 'cavaletes') return generateCavaletes(params as CavaletesParams);
  if (kind === 'relogio') return generateRelogio(params as RelogioParams);
  return generatePeDeGalinha(params as PeDeGalinhaParams);
}

/* ------------------------------------------------- pôr na pista e editar */

/** Leva um ponto do sistema do exercício para a pista. */
const naPista = (p: Vec2, origem: Vec2, giro: number) => add(origem, rotate(p, giro));

function colocar(obj: SceneObject, origem: Vec2, giro: number): void {
  if (obj.kind === 'obstacle') {
    obj.pos = naPista(obj.pos, origem, giro);
    obj.rotation = obj.rotation + giro;
  } else if (obj.kind === 'measure') {
    obj.a = naPista(obj.a, origem, giro);
    obj.b = naPista(obj.b, origem, giro);
  } else if (obj.kind === 'path') {
    for (const n of obj.nodes) {
      n.pos = naPista(n.pos, origem, giro);
      if (n.handleIn) n.handleIn = rotate(n.handleIn, giro);
      if (n.handleOut) n.handleOut = rotate(n.handleOut, giro);
    }
  }
}

/**
 * Põe o exercício na pista: gera, posiciona e marca. Devolve os ids. A
 * âncora (o primeiro elemento) guarda a pose que tinha no sistema do
 * exercício, para a edição saber reconstruir a posição e o giro.
 */
export function placeExercise(
  doc: CourseDocument,
  kind: ExerciseKind,
  params: ExerciseParams,
  origem: Vec2,
  giro: number,
  id: string = newId('exe'),
): ObjectId[] {
  const g = generateExercise(kind, params);
  const grupo = newId('grp');
  const ancora = g.obstacles[0];
  const objs: SceneObject[] = [...g.obstacles, ...g.extras];
  for (const o of objs) {
    o.exercise = { id, kind, params };
    o.group = grupo;
  }
  if (ancora) ancora.exercise = { id, kind, params, anchor: { pos: { ...ancora.pos }, rotation: ancora.rotation } };
  for (const o of objs) colocar(o, origem, giro);
  const ids: ObjectId[] = [];
  for (const o of objs) {
    doc.objects.push({ ...o, z: doc.objects.filter((x) => x.layer === o.layer).length });
    ids.push(o.id);
  }
  return ids;
}

/** Onde e com que giro o exercício está hoje, pela âncora. */
export function exercisePlacement(doc: CourseDocument, id: string): { origem: Vec2; giro: number } | null {
  const ancora = doc.objects.find((o) => o.exercise?.id === id && o.exercise.anchor);
  if (!ancora || ancora.kind !== 'obstacle' || !ancora.exercise?.anchor) return null;
  const { pos, rotation } = ancora.exercise.anchor;
  const giro = ancora.rotation - rotation;
  return { origem: sub(ancora.pos, rotate(pos, giro)), giro };
}

/** Redesenha o exercício com outros parâmetros, no mesmo lugar e direção. */
export function updateExercise(doc: CourseDocument, id: string, params: ExerciseParams): ObjectId[] {
  const lugar = exercisePlacement(doc, id);
  const tipo = doc.objects.find((o) => o.exercise?.id === id)?.exercise?.kind;
  if (!lugar || !tipo) return [];
  doc.objects = doc.objects.filter((o) => o.exercise?.id !== id);
  return placeExercise(doc, tipo, params, lugar.origem, lugar.giro, id);
}
