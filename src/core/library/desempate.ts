import { courseOrder, groupStops, phaseStops, podeContrario, tipoTrocado, type RideStop } from '@core/assist/courseRide';
import type { CourseDocument, CoursePath, Desempate, ObjectId, Obstacle, VistaProva } from '@core/model/types';
import { t } from '@core/i18n/i18n';
import { mostraDesempate, temDesempate } from './annotations';
import { aplicaTemposDesempate } from './courseTimes';
import { empurraAbaixo, infoBoxLayout } from '@core/model/annotationLayout';
import { formatDistance, pathLength } from '@core/model/path';
import type { MessageKey } from '@core/i18n/messages';

/**
 * Desempate (B-92).
 *
 * A ordem guarda os obstáculos, elemento a elemento, e não os números:
 * renumerar o percurso depois não a desfaz. Os obstáculos "Só desempate"
 * ficam fora do percurso e ganham número depois do último.
 *
 * Os avisos vêm do regulamento da FEI (28ª ed., Art. 218.2). Conferir
 * regra esportiva é o que o §44 evita; aqui é exceção pedida pelo
 * desenhador, como o limite do composto (decisão 99). Os avisos só
 * informam: nada é bloqueado.
 */

const obstaculosDe = (doc: CourseDocument): Obstacle[] =>
  doc.objects.filter((o): o is Obstacle => o.kind === 'obstacle');

/** A ordem como se digita: "1-2-5AB-6-14". */
export const ordemTexto = (stops: RideStop[]): string => stops.map((s) => s.label).join('-');

/**
 * O que muda no obstáculo no desempate (FEI 218.2.7). 'oxer' é a troca de
 * tipo: o vertical vira oxer e o oxer vira vertical (o nome ficou do tempo
 * em que só havia o primeiro caso, e é o que os arquivos guardam).
 */
export type Variacao = 'contrario' | 'oxer';

/** Os obstáculos do degrau como estão no percurso, antes do desempate. */
export const originaisDe = (doc: CourseDocument, stop: RideStop): Obstacle[] =>
  stop.elements
    .map((e) => obstaculosDe(doc).find((o) => o.id === e.id))
    .filter((o): o is Obstacle => o != null);

/** Rótulo da troca de tipo para o obstáculo do percurso. */
export const chaveDaTroca = (o: Obstacle | undefined): 'dsp.oxer' | 'dsp.vertical' =>
  o && tipoTrocado(o) === 'vertical' ? 'dsp.vertical' : 'dsp.oxer';

export const variacoesDe = (desempate: Desempate | undefined, id: ObjectId): Variacao[] => [
  ...(desempate?.contrario?.includes(id) ? (['contrario'] as const) : []),
  ...(desempate?.oxer?.includes(id) ? (['oxer'] as const) : []),
];

/** O degrau mudou no desempate: algum elemento invertido ou virado oxer. */
const degrauMudou = (desempate: Desempate | undefined, stop: RideStop): boolean =>
  stop.elements.some((e) =>
    variacoesDe(desempate, e.id).some((v) => v === 'contrario' || !desempate?.oxerPreso?.includes(e.id)),
  );

/**
 * A ordem como sai no quadro, com o que muda: "1-4-7 (inv.)-8 (oxer)".
 * As marcas são texto simples porque o PDF só tem as letras do WinAnsi:
 * seta não sai.
 */
export function ordemQuadro(doc: CourseDocument): string {
  return phaseStops(doc, 'desempate')
    .map((s) => {
      const marcas = [...new Set(s.elements.flatMap((e) => variacoesDe(doc.desempate, e.id)))];
      const original = originaisDe(doc, s)[0];
      const marcaTroca = original && tipoTrocado(original) === 'vertical' ? 'dsp.marcaVertical' : 'dsp.marcaOxer';
      const sufixo = marcas.map((m) => t(m === 'contrario' ? 'dsp.marcaContrario' : marcaTroca)).join(' ');
      return sufixo ? `${s.label} ${sufixo}` : s.label;
    })
    .join('-');
}

/**
 * Liga ou desliga uma variação num degrau. Num degrau de combinação a
 * marca vale para todos os elementos.
 */
export function marcaVariacao(doc: CourseDocument, stop: RideStop, v: Variacao, liga: boolean): void {
  if (!doc.desempate) return;
  const ids = stop.elements.map((e) => e.id);
  const atual = doc.desempate[v] ?? [];
  const nova = liga ? [...new Set([...atual, ...ids])] : atual.filter((id) => !ids.includes(id));
  if (nova.length > 0) doc.desempate[v] = nova;
  else delete doc.desempate[v];
}

/** Tira as marcas de obstáculos que saíram da ordem. */
export function limpaVariacoes(desempate: Desempate): void {
  for (const v of ['contrario', 'oxer'] as const) {
    const ficam = desempate[v]?.filter((id) => desempate.ordem.includes(id));
    if (ficam && ficam.length > 0) desempate[v] = ficam;
    else delete desempate[v];
  }
}

/**
 * Qual vara sai do oxer que vira vertical no desempate. Pesa a distância
 * marcada para aparecer no croqui (a que o armador mede no detalhe na
 * pista) e/ou travada no cadeado, para o obstáculo anterior e para o
 * seguinte, e se ela vale no desempate: o vizinho vem logo antes (ou logo
 * depois) também na ordem do desempate, os dois no sentido do percurso.
 * - só a do anterior vale: sai a de trás (a entrada fica);
 * - só a do seguinte vale: sai a da frente (a saída fica);
 * - as duas valem: ele não pode virar vertical;
 * - nenhuma: sai a de trás.
 */
export function varaQueSai(doc: CourseDocument, o: Obstacle): 'tras' | 'frente' | 'nenhuma' {
  const desempate = doc.desempate;
  const percurso = courseOrder(obstaculosDe(doc)).flatMap((s) => s.elements);
  const i = percurso.findIndex((e) => e.id === o.id);
  const ordem = desempate?.ordem ?? [];
  const j = ordem.indexOf(o.id);
  if (i < 0 || j < 0) return 'tras';
  const tracados = doc.objects.filter(
    (p): p is CoursePath => p.kind === 'path' && !p.exercise && p.fase !== 'desempate',
  );
  const marcada = (de: ObjectId, para: ObjectId) =>
    tracados.some((p) => p.obstacleDistances[`${de}>${para}`] === true || p.lockedDistances?.[`${de}>${para}`] != null);
  const invertido = (id: ObjectId) => desempate?.contrario?.includes(id) === true;
  const vale = (vizinho: Obstacle | undefined, noDesempate: ObjectId | undefined, antes: boolean) =>
    vizinho != null &&
    vizinho.id === noDesempate &&
    !invertido(vizinho.id) &&
    !invertido(o.id) &&
    (antes ? marcada(vizinho.id, o.id) : marcada(o.id, vizinho.id));
  const anterior = vale(percurso[i - 1], ordem[j - 1], true);
  const seguinte = vale(percurso[i + 1], ordem[j + 1], false);
  if (anterior && seguinte) return 'nenhuma';
  return seguinte ? 'frente' : 'tras';
}

/** Recalcula, depois de cada edição, qual vara sai dos oxers que viram vertical. */
export function syncVarasDoDesempate(doc: CourseDocument): void {
  const d = doc.desempate;
  if (!d) return;
  // Quem entrou na ordem (ou foi apagado) deixa de estar retirado.
  if (d.retirados) {
    const existe = new Set(obstaculosDe(doc).map((o) => o.id));
    const ficam = d.retirados.filter((id) => existe.has(id) && !d.ordem.includes(id));
    if (ficam.length !== d.retirados.length) {
      if (ficam.length > 0) d.retirados = ficam;
      else delete d.retirados;
    }
  }
  const frente: ObjectId[] = [];
  const presos: ObjectId[] = [];
  for (const id of d.oxer ?? []) {
    const o = obstaculosDe(doc).find((x) => x.id === id);
    if (!o || tipoTrocado(o) !== 'vertical') continue;
    const sai = varaQueSai(doc, o);
    if (sai === 'frente') frente.push(id);
    else if (sai === 'nenhuma') presos.push(id);
  }
  const igual = (a: ObjectId[] | undefined, b: ObjectId[]) => (a ?? []).join() === b.join();
  if (!igual(d.varaFrente, frente)) {
    if (frente.length > 0) d.varaFrente = frente;
    else delete d.varaFrente;
  }
  if (!igual(d.oxerPreso, presos)) {
    if (presos.length > 0) d.oxerPreso = presos;
    else delete d.oxerPreso;
  }
}

/** Marca (ou desmarca) que o obstáculo sai da pista no desempate. */
export function marcaRetirado(doc: CourseDocument, id: ObjectId, sai: boolean): void {
  if (!doc.desempate) return;
  const atual = doc.desempate.retirados ?? [];
  const nova = sai ? [...new Set([...atual, id])] : atual.filter((x) => x !== id);
  if (nova.length > 0) doc.desempate.retirados = nova;
  else delete doc.desempate.retirados;
}

export interface OrdemLida {
  ids: ObjectId[];
  /** Pedaços digitados que não correspondem a obstáculo nenhum. */
  desconhecidos: string[];
}

/**
 * Lê a ordem digitada: "1-2-5a-5b-6-14", com hífen, vírgula ou espaço.
 *
 * "5" numa combinação traz todos os elementos (5A, 5B); "5a" traz só o A,
 * e "5ab" traz A e B. Assim dá para omitir um elemento, como a FEI permite.
 */
export function lerOrdem(texto: string, obstacles: Obstacle[]): OrdemLida {
  const ids: ObjectId[] = [];
  const desconhecidos: string[] = [];
  const pedacos = texto.split(/[\s,;–—-]+/).filter((p) => p !== '');

  for (const pedaco of pedacos) {
    const m = /^(\d+)([a-dA-D]*)$/.exec(pedaco);
    const comNumero = m ? obstacles.filter((o) => parseInt(o.number, 10) === Number(m[1])) : [];
    if (!m || comNumero.length === 0) {
      desconhecidos.push(pedaco);
      continue;
    }
    const letras = m[2]!.toUpperCase();
    const achados =
      letras === ''
        ? [...comNumero].sort((a, b) => a.letter.localeCompare(b.letter))
        : [...letras].map((l) => comNumero.find((o) => o.letter === l));
    if (achados.some((o) => o == null)) {
      desconhecidos.push(pedaco);
      continue;
    }
    ids.push(...achados.map((o) => o!.id));
  }
  return { ids, desconhecidos };
}

/** Número para um obstáculo novo do desempate: o seguinte ao maior do croqui. */
export function proximoNumero(obstacles: Obstacle[], exceto?: ObjectId): string {
  const maior = obstacles
    .filter((o) => o.id !== exceto)
    .map((o) => parseInt(o.number, 10))
    .filter(Number.isFinite)
    .reduce((m, n) => Math.max(m, n), 0);
  return String(maior + 1);
}

export interface AvisoDesempate {
  key: MessageKey;
  params?: Record<string, string | number>;
}

/** O que o regulamento da FEI diria da ordem atual (Art. 218.2). */
export function avisosDesempate(doc: CourseDocument): AvisoDesempate[] {
  const ordem = doc.desempate?.ordem ?? [];
  if (ordem.length === 0) return [];
  const avisos: AvisoDesempate[] = [];
  const percurso = courseOrder(obstaculosDe(doc));
  const desempate = phaseStops(doc, 'desempate');

  // 218.2.3: no mínimo seis, e a combinação conta como um.
  if (desempate.length < 6) avisos.push({ key: 'dsp.avisoMinimo', params: { n: desempate.length } });

  // 218.2.2: se o percurso tinha combinação, o desempate também precisa ter.
  const temCombinacao = (stops: RideStop[]) => stops.some((s) => s.elements.length > 1);
  if (temCombinacao(percurso) && !temCombinacao(desempate)) avisos.push({ key: 'dsp.avisoCombinacao' });

  // 218.2.7: no máximo dois obstáculos a mais. Contam o novo, o saltado
  // no sentido contrário e o que troca de tipo (vertical ↔ oxer). A
  // combinação de dois verticais saltada ao contrário vale pelos dois
  // (218.2.7.2); outra combinação não pode ser saltada ao contrário.
  let extras = 0;
  for (const s of desempate) {
    const contrario = s.elements.some((e) => variacoesDe(doc.desempate, e.id).includes('contrario'));
    if (s.elements.length > 1 && contrario) {
      if (podeContrario(originaisDe(doc, s))) extras += 2;
      else avisos.push({ key: 'dsp.avisoContrarioComb', params: { o: s.label } });
    } else if (s.elements.some((e) => e.soDesempate) || degrauMudou(doc.desempate, s)) {
      extras += 1;
    }
  }
  if (extras > 2) avisos.push({ key: 'dsp.avisoExtras', params: { n: extras } });

  // O oxer marcado para virar vertical, com as duas distâncias valendo.
  for (const id of doc.desempate?.oxerPreso ?? []) {
    const o = obstaculosDe(doc).find((x) => x.id === id);
    if (o) avisos.push({ key: 'dsp.avisoOxerPreso', params: { o: `${o.number}${o.letter}` } });
  }

  // 218.2.4: na tríplice ou quádrupla, o elemento do meio não sai.
  const usados = new Set(ordem);
  for (const comb of percurso.filter((s) => s.elements.length >= 3)) {
    const presentes = comb.elements.filter((e) => usados.has(e.id));
    if (presentes.length === 0) continue;
    const meio = comb.elements.slice(1, -1);
    if (meio.some((e) => !usados.has(e.id))) {
      avisos.push({ key: 'dsp.avisoMeio', params: { o: comb.label } });
    }
  }

  // O mesmo elemento duas vezes é quase sempre erro de digitação.
  const repetidos = groupStops(
    ordem.filter((id, i) => ordem.indexOf(id) !== i)
      .map((id) => obstaculosDe(doc).find((o) => o.id === id))
      .filter((o): o is Obstacle => o != null),
  );
  if (repetidos.length > 0) {
    avisos.push({ key: 'dsp.avisoRepetido', params: { o: ordemTexto(repetidos) } });
  }
  return avisos;
}

/**
 * As páginas da folha, cada uma com a sua vista. Sem desempate, a folha
 * de sempre; com ele, o que o desenhador escolheu ao exportar — e, sem
 * escolha ainda, só o percurso, que é o que se divulga.
 */
export function paginasDaFolha(doc: CourseDocument): VistaProva[] {
  if ((doc.desempate?.ordem.length ?? 0) === 0) return ['ambos'];
  switch (doc.desempate?.folha ?? 'percurso') {
    case 'duas':
      return ['percurso', 'desempate'];
    case 'uma':
      return ['ambos'];
    default:
      return ['percurso'];
  }
}

/**
 * A ordem no quadro técnico acompanha o desenho (B-92). Ela não é digitada:
 * vem da ordem do desempate e das marcas, então reescrevê-la nunca apaga
 * trabalho do desenhador. Distância e tempos continuam só quando pedidos.
 */
export function syncQuadroDesempate(doc: CourseDocument): void {
  let texto: string | null = null;
  const tracado = doc.objects.find((o) => o.kind === 'path' && o.fase === 'desempate');
  for (const o of doc.objects) {
    if (o.kind !== 'infobox') continue;
    const campo = o.fields.find((f) => f.id === 'dspOrdem' && f.enabled);
    if (!campo) continue;
    texto ??= ordemQuadro(doc);
    if (campo.value !== texto) campo.value = texto;
    // A distância chega quando o traçado do desempate é desenhado; depois
    // disso é do desenhador, que pode corrigi-la na pista.
    const dist = o.fields.find((f) => f.id === 'dspDistancia' && f.enabled);
    if (dist && dist.value.trim() === '' && tracado?.kind === 'path' && pathLength(tracado) > 0) {
      dist.value = `${formatDistance(pathLength(tracado), 0)} m`;
      aplicaTemposDesempate(o);
    }
  }
}

/**
 * Prova que acaba de ganhar desempate: o quadro técnico já mostra o bloco
 * dele, com a velocidade do percurso para começar (o desenhador troca se
 * for outra). A ordem e a distância vêm de `syncQuadroDesempate`.
 */
export function ligaDesempateNosQuadros(doc: CourseDocument): void {
  for (const b of doc.objects) {
    if (b.kind !== 'infobox' || temDesempate(b)) continue;
    const antes = infoBoxLayout(b).heightMm;
    mostraDesempate(b, true);
    const vel = b.fields.find((f) => f.id === 'dspVelocidade');
    if (vel && vel.value.trim() === '') vel.value = b.fields.find((f) => f.id === 'velocidade')?.value ?? '';
    aplicaTemposDesempate(b);
    empurraAbaixo(doc, b, antes, infoBoxLayout(b).heightMm);
  }
}
