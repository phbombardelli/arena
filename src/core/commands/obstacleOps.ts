import { toMillimeterPrecision } from '@core/geometry/snap';
import type { Vec2 } from '@core/geometry/vec';
import { acceptsLiverpool, fitElementsToType, obstacleDef } from '@core/library/obstacles';
import { proximoNumero } from '@core/library/desempate';
import { ajustaAoTopo, temMontagem, topoMontagem } from '@core/library/montagem';
import type {
  BarAppearance,
  CourseDocument,
  LiverpoolOption,
  Montagem,
  Obstacle,
  ObstacleType,
  ObjectId,
  WingsAppearance,
} from '@core/model/types';

/**
 * Operações sobre obstáculos. Tudo o que o desenhador decide — tipo,
 * número, letra, alturas, largura, direção do salto — passa por aqui.
 *
 * O programa não interpreta nada disso: não confere sequência, não valida
 * combinação, não julga altura. Só guarda e desenha o que foi decidido.
 */

function obstacleOf(doc: CourseDocument, id: ObjectId): Obstacle | null {
  const obj = doc.objects.find((o) => o.id === id);
  return obj?.kind === 'obstacle' && !obj.locked ? obj : null;
}

/** Troca o tipo preservando as alturas já digitadas. */
export function setObstacleType(doc: CourseDocument, id: ObjectId, type: ObstacleType): void {
  const obstacle = obstacleOf(doc, id);
  if (!obstacle) return;
  const def = obstacleDef(type);
  const eraSemLargura = obstacle.spreadM === null;

  // Muro e obstáculo de varas não se montam igual: troca entre eles volta
  // ao padrão; o que não se monta perde a montagem.
  if (!temMontagem(type) || (type === 'muro') !== (obstacle.type === 'muro')) delete obstacle.montagem;
  obstacle.type = type;
  obstacle.elements = fitElementsToType(obstacle.elements, type);
  // O liverpool só existe acoplado a vertical ou oxer.
  if (!acceptsLiverpool(type)) obstacle.liverpool.enabled = false;
  // A largura de salto só é reposta quando o obstáculo não tinha nenhuma:
  // um oxer já ajustado não pode voltar ao padrão ao virar tríplice.
  if (def.spreadM === null) obstacle.spreadM = null;
  else if (eraSemLargura) obstacle.spreadM = def.spreadM;
}

/** Numeração livre: o texto é do usuário, inclusive vazio (§14). */
export function setObstacleNumber(doc: CourseDocument, id: ObjectId, numero: string): void {
  const obstacle = obstacleOf(doc, id);
  if (obstacle) obstacle.number = numero.trim().slice(0, 6);
}

/**
 * Marca ou desmarca o obstáculo como "Só desempate" (B-92). Ao marcar, ele
 * ganha o número seguinte ao maior do croqui, sem letra, como nos croquis
 * de referência (14, 15, 16 depois de um percurso de 13).
 */
export function setSoDesempate(doc: CourseDocument, id: ObjectId, liga: boolean): void {
  const obstacle = obstacleOf(doc, id);
  if (!obstacle) return;
  if (!liga) {
    delete obstacle.soDesempate;
    return;
  }
  obstacle.soDesempate = true;
  obstacle.number = proximoNumero(
    doc.objects.filter((o): o is Obstacle => o.kind === 'obstacle'),
    id,
  );
  obstacle.letter = '';
}

export function setObstacleLetter(
  doc: CourseDocument,
  id: ObjectId,
  letter: Obstacle['letter'],
): void {
  const obstacle = obstacleOf(doc, id);
  if (obstacle) obstacle.letter = letter;
}

/** Altura de um elemento. `null` = não informada. */
export function setElementHeight(
  doc: CourseDocument,
  id: ObjectId,
  index: number,
  height: number | null,
): void {
  const obstacle = obstacleOf(doc, id);
  const element = obstacle?.elements[index];
  if (!element) return;
  element.height = height === null || !Number.isFinite(height) || height <= 0
    ? null
    : toMillimeterPrecision(height);
  // O topo da montagem é a altura do 1º elemento: a peça de cima acompanha.
  if (index === 0 && obstacle.montagem && element.height !== null) {
    obstacle.montagem = ajustaAoTopo(obstacle.montagem, Math.round(element.height * 100));
  }
}

/**
 * Grava a montagem do 1º plano (B-108) e, com ela, a altura do 1º
 * elemento, que é o topo da pilha. Pilha vazia volta ao padrão.
 */
export function setMontagem(doc: CourseDocument, id: ObjectId, montagem: Montagem | null): void {
  const obstacle = obstacleOf(doc, id);
  if (!obstacle) return;
  if (!montagem || montagem.pecas.length === 0) {
    delete obstacle.montagem;
    return;
  }
  obstacle.montagem = { pecas: montagem.pecas.map((p) => ({ ...p })) };
  const el = obstacle.elements[0];
  if (el) el.height = toMillimeterPrecision(topoMontagem(montagem) / 100);
}

export function addElement(doc: CourseDocument, id: ObjectId): void {
  const obstacle = obstacleOf(doc, id);
  if (obstacle && obstacle.elements.length < 6) obstacle.elements.push({ height: null });
}

export function removeElement(doc: CourseDocument, id: ObjectId, index: number): void {
  const obstacle = obstacleOf(doc, id);
  if (obstacle && obstacle.elements.length > 0) obstacle.elements.splice(index, 1);
}

export function setFaceWidth(doc: CourseDocument, id: ObjectId, widthM: number): void {
  const obstacle = obstacleOf(doc, id);
  if (obstacle && widthM > 0) obstacle.faceWidthM = toMillimeterPrecision(widthM);
}

/** `null` remove a largura de salto (o obstáculo passa a ser de uma linha). */
export function setSpread(doc: CourseDocument, id: ObjectId, spreadM: number | null): void {
  const obstacle = obstacleOf(doc, id);
  if (!obstacle) return;
  obstacle.spreadM =
    spreadM === null || !(spreadM > 0) ? null : toMillimeterPrecision(spreadM);
}

export function setArrow(
  doc: CourseDocument,
  id: ObjectId,
  patch: Partial<Obstacle['arrow']>,
): void {
  const obstacle = obstacleOf(doc, id);
  if (obstacle) obstacle.arrow = { ...obstacle.arrow, ...patch };
}

/** Inverte a direção do salto sem mexer na rotação do desenho. */
export function flipArrow(doc: CourseDocument, id: ObjectId): void {
  const obstacle = obstacleOf(doc, id);
  if (obstacle) obstacle.arrow.reversed = !obstacle.arrow.reversed;
}

export function setLabelOffset(
  doc: CourseDocument,
  id: ObjectId,
  which: 'numberLabel' | 'heightLabel',
  offsetM: Vec2,
): void {
  const obstacle = obstacleOf(doc, id);
  if (!obstacle) return;
  obstacle[which].offsetM = {
    x: toMillimeterPrecision(offsetM.x),
    y: toMillimeterPrecision(offsetM.y),
  };
  // Mexer na posição desliga o automático: a escolha passa a ser do usuário.
  obstacle[which].auto = false;
}

export function setLabelVisible(
  doc: CourseDocument,
  id: ObjectId,
  which: 'numberLabel' | 'heightLabel',
  visible: boolean,
): void {
  const obstacle = obstacleOf(doc, id);
  if (obstacle) obstacle[which].visible = visible;
}

export function setBarAppearance(
  doc: CourseDocument,
  id: ObjectId,
  patch: Partial<BarAppearance>,
): void {
  const obstacle = obstacleOf(doc, id);
  if (!obstacle) return;
  obstacle.bar = { ...obstacle.bar, ...patch };
  if (obstacle.bar.stripes < 2) obstacle.bar.stripes = 2;
  if (obstacle.bar.stripes > 24) obstacle.bar.stripes = 24;
}

/**
 * Liga/ajusta a lâmina de água. Não há opção de ângulo: ela é desenhada no
 * sistema local do obstáculo e por isso fica sempre paralela à frente.
 */
export function setLiverpool(
  doc: CourseDocument,
  id: ObjectId,
  patch: Partial<LiverpoolOption>,
): void {
  const obstacle = obstacleOf(doc, id);
  if (!obstacle) return;
  if (patch.enabled === true && !acceptsLiverpool(obstacle.type)) return;
  obstacle.liverpool = { ...obstacle.liverpool, ...patch };
  if (!(obstacle.liverpool.spreadM > 0)) obstacle.liverpool.spreadM = 1;
  if (!(obstacle.liverpool.widthM > 0)) obstacle.liverpool.widthM = 3;
}

export function setWings(
  doc: CourseDocument,
  id: ObjectId,
  patch: Partial<WingsAppearance>,
): void {
  const obstacle = obstacleOf(doc, id);
  if (!obstacle) return;
  obstacle.wings = { ...obstacle.wings, ...patch };
  if (!(obstacle.wings.widthM > 0)) obstacle.wings.widthM = 0.4;
  if (!(obstacle.wings.depthM > 0)) obstacle.wings.depthM = 0.9;
}

/** Devolve o rótulo ao posicionamento automático. */
export function resetLabel(
  doc: CourseDocument,
  id: ObjectId,
  which: 'numberLabel' | 'heightLabel',
): void {
  const obstacle = obstacleOf(doc, id);
  if (obstacle) obstacle[which].auto = true;
}

export function setObstacleNote(doc: CourseDocument, id: ObjectId, note: string): void {
  const obstacle = obstacleOf(doc, id);
  if (obstacle) obstacle.note = note;
}

/** Todos os obstáculos, na ordem em que estão no documento. */
export const allObstacles = (doc: CourseDocument): Obstacle[] =>
  doc.objects.filter((o): o is Obstacle => o.kind === 'obstacle');

/**
 * Renumera na ordem de inserção. É um utilitário explícito, nunca
 * automático: a sequência do percurso é decisão do desenhador (§14).
 */
export function renumberByInsertion(doc: CourseDocument): void {
  let n = 1;
  for (const obstacle of allObstacles(doc)) {
    if (obstacle.locked) continue;
    obstacle.number = String(n);
    obstacle.letter = '';
    n += 1;
  }
}
