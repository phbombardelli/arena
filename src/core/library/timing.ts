import { add, fromAngle, scale, type Vec2 } from '@core/geometry/vec';
import { newId } from '@core/model/ids';
import { courseOrder } from '@core/assist/courseRide';
import type { CourseDocument, Obstacle, TimingLine, WingsAppearance } from '@core/model/types';
import { localizeDefault, t } from '@core/i18n/i18n';

/**
 * Linhas de partida e chegada.
 *
 * São entidade própria, não obstáculo: não têm altura, não entram na
 * tabela de alturas e não recebem número de percurso. Compartilham o
 * sistema local do obstáculo (X ao longo da linha, salto/passagem para
 * −Y) para que paraflancos e seta se comportem igual.
 */

export const TIMING_ROLES = [
  {
    role: 'start' as const,
    get label() {
      return t('tim.partida');
    },
  },
  {
    role: 'finish' as const,
    get label() {
      return t('tim.chegada');
    },
  },
];

const defaultWings = (): WingsAppearance => ({
  style: 'paraflanco',
  widthM: 0.4,
  depthM: 0.8,
  color: '#2e7d32',
});

export function createTimingLine(
  role: 'start' | 'finish',
  pos: Vec2,
  label?: string,
): TimingLine {
  return {
    id: newId('tim'),
    kind: 'timing',
    layer: 'obstacles',
    locked: false,
    visible: true,
    scope: 'percurso',
    z: 0,
    role,
    anchor: null,
    pos,
    rotation: 0,
    widthM: 8,
    label: label ?? t(role === 'start' ? 'tim.partida' : 'tim.chegada'),
    labelVisible: true,
    wings: defaultWings(),
    // Vermelha, como nos croquis: distingue a cronometragem do percurso.
    arrow: { visible: true, reversed: false, lengthMm: 7 },
    style: { dash: 'dotted', strokeMm: 0.35, color: '#d32020' },
  };
}

/** Rótulo da linha como sai no croqui: o padrão segue a língua da tela. */
export const timingLabel = (line: TimingLine): string =>
  localizeDefault(line.label, line.role === 'start' ? 'tim.partida' : 'tim.chegada');

/** Extensão local, em metros — a base da envoltória e da seta. */
export function timingExtent(line: TimingLine): {
  halfWidthM: number;
  frontM: number;
  backM: number;
} {
  const meia = line.wings.style === 'paraflanco' ? line.wings.depthM / 2 : 0.3;
  return { halfWidthM: line.widthM / 2, frontM: -meia, backM: meia };
}

export const allTimingLines = (doc: CourseDocument): TimingLine[] =>
  doc.objects.filter((o): o is TimingLine => o.kind === 'timing');

/** Já existe uma linha desse papel? Serve para o aviso, não para bloquear. */
export const hasTimingRole = (doc: CourseDocument, role: 'start' | 'finish'): boolean =>
  allTimingLines(doc).some((l) => l.role === role);

/** Limites da distância da cruzada à vara que ela serve, em metros. */
export const TIMING_DISTANCE = { min: 6, max: 15, padrao: 12, passo: 0.1 };

/**
 * Meia largura do SALTO, em metros — só as varas, sem paraflanco.
 *
 * A distância da cronometragem se mede da partida até a VARA DE ENTRADA,
 * e da VARA DE SAÍDA até a chegada. Num vertical dá no mesmo; num oxer de
 * 1,60 m de largura a diferença é de 80 cm de cada lado, que é muito para
 * um número que sai impresso no quadro técnico.
 */
const meiaVara = (obstacle: Obstacle): number => (obstacle.spreadM ?? 0) / 2;

export const clampTimingDistance = (metros: number): number =>
  Math.min(TIMING_DISTANCE.max, Math.max(TIMING_DISTANCE.min, metros));

/**
 * Coloca a cruzada de tempo em relação ao obstáculo que ela serve.
 *
 * A partida fica ATRÁS do primeiro obstáculo e a chegada À FRENTE do
 * último, sempre no eixo do salto, paralelas à face e com os centros
 * coincidindo. Assim a cruzada e o obstáculo ficam unidos por uma reta
 * perpendicular às duas — e nunca existe volta entre a partida e o
 * primeiro salto, nem entre o último e a chegada.
 *
 * Isso não é conveniência de desenho: é como a cronometragem funciona. O
 * cavalo cruza a partida já apontado para o primeiro obstáculo. Enquanto
 * a cruzada podia ser largada em qualquer lugar, o assistente tinha de
 * inventar uma volta ali, e inventava — foi assim que apareceram voltas
 * entre a partida e o 1.
 */
export function placeTimingLine(
  role: 'start' | 'finish',
  obstacle: Obstacle,
  distanceM: number,
  label?: string,
): TimingLine {
  const linha = createTimingLine(role, obstacle.pos, label);
  linha.anchor = { obstacleId: obstacle.id, distanceM: clampTimingDistance(distanceM) };
  alinha(linha, obstacle);
  return linha;
}

/** Põe a cruzada no lugar que o vínculo manda. */
function alinha(linha: TimingLine, obstacle: Obstacle): void {
  if (!linha.anchor) return;
  const heading = obstacle.rotation + (obstacle.arrow.reversed ? 90 : -90);
  const daVara = meiaVara(obstacle) + clampTimingDistance(linha.anchor.distanceM);
  const sentido = linha.role === 'start' ? -daVara : daVara;

  linha.pos = add(obstacle.pos, scale(fromAngle(heading), sentido));
  linha.rotation = obstacle.rotation;
  // A seta acompanha o salto: quem passa pela cruzada vai na mesma direção.
  linha.arrow.reversed = obstacle.arrow.reversed;
}

/**
 * O obstáculo a que a cruzada pertence: o primeiro do percurso para a
 * partida, o último para a chegada. Numa combinação, o elemento por onde
 * se entra ou por onde se sai.
 */
function donoDe(role: 'start' | 'finish', doc: CourseDocument): Obstacle | null {
  const stops = courseOrder(
    doc.objects.filter((o): o is Obstacle => o.kind === 'obstacle'),
  );
  if (stops.length === 0) return null;
  const degrau = role === 'start' ? stops[0]! : stops[stops.length - 1]!;
  return role === 'start'
    ? degrau.elements[0]!
    : degrau.elements[degrau.elements.length - 1]!;
}

/**
 * Recoloca toda cruzada a partir do obstáculo que ela serve.
 *
 * Chamada depois de QUALQUER alteração do documento, e não em cada comando
 * que move obstáculo. É a diferença entre garantir uma invariante e
 * lembrar de mantê-la em oito lugares: mover, girar, colar, desfazer,
 * aplicar modelo de pista — todos passam por aqui sem saber disso.
 *
 * Cruzada SEM vínculo é adotada: a partida pertence ao primeiro obstáculo
 * e a chegada ao último, sempre, então não há o que adivinhar. Isso
 * conserta sozinho o croqui feito antes de a cruzada aprender a seguir, e
 * evita a armadilha de uma linha que parece igual às outras e não anda —
 * foi exatamente o que aconteceu na prova real. A distância adotada é a
 * que a linha já tinha, trazida para dentro dos limites.
 *
 * Cruzada de percurso sem obstáculo numerado fica solta, porque aí não há
 * a quem pertencer.
 */
export function syncTimingLines(doc: CourseDocument): void {
  for (const obj of doc.objects) {
    if (obj.kind !== 'timing') continue;

    const vinculado = obj.anchor
      ? doc.objects.find((o) => o.id === obj.anchor!.obstacleId)
      : undefined;
    const dono = vinculado?.kind === 'obstacle' ? vinculado : donoDe(obj.role, doc);

    if (!dono) {
      obj.anchor = null;
      continue;
    }
    obj.anchor = {
      obstacleId: dono.id,
      distanceM: clampTimingDistance(obj.anchor?.distanceM ?? distanciaAtual(obj, dono)),
    };
    alinha(obj, dono);
  }
}

/** Distância da linha à vara, deduzida de onde ela está hoje. */
function distanciaAtual(linha: TimingLine, obstacle: Obstacle): number {
  const heading = obstacle.rotation + (obstacle.arrow.reversed ? 90 : -90);
  const eixo = fromAngle(heading);
  const dx = linha.pos.x - obstacle.pos.x;
  const dy = linha.pos.y - obstacle.pos.y;
  const aoLongo = Math.abs(dx * eixo.x + dy * eixo.y);
  return aoLongo - meiaVara(obstacle);
}
