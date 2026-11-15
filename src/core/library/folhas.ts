import { produce } from 'immer';
import type { CourseDocument, DiagramacaoDaFolha, VistaProva } from '@core/model/types';
import { isPaperAnchored } from '@core/model/transform';
import { syncArranjo } from '@core/model/sheetLayout';

/**
 * Desempate em folha própria, cada folha com a sua diagramação (B-107).
 *
 * A folha à vista mora nos campos de sempre — origem do desenho, escala,
 * arranjo e a posição de cada item de papel —, e é ela que a tela, os
 * gestos e os painéis editam, sem saber que há outra. A outra fica
 * guardada em `desempate.outraFolha`; trocar de folha troca uma pela
 * outra. O conteúdo (o que está escrito no quadro, a pista, o percurso) é
 * um só: só muda onde cada coisa fica no papel.
 */

export type FolhaDoCroqui = 'percurso' | 'desempate';

/** Os campos de um item de papel que são da folha, e não do item. */
const CAMPOS_DA_FOLHA = [
  'posMm', 'widthMm', 'heightMm', 'livre', 'reduzido', 'style', 'blocos', 'encaixe', 'visible', 'sizeMm',
] as const;

/** O desempate sai em folha própria, então há duas diagramações. */
export const temDuasFolhas = (doc: CourseDocument): boolean =>
  (doc.desempate?.ordem.length ?? 0) > 0 && doc.desempate?.folha === 'duas';

export const folhaAtiva = (doc: CourseDocument): FolhaDoCroqui =>
  temDuasFolhas(doc) && doc.desempate?.folhaAtiva === 'desempate' ? 'desempate' : 'percurso';

export const folhaDaVista = (v: VistaProva): FolhaDoCroqui => (v === 'desempate' ? 'desempate' : 'percurso');

const copia = <T,>(v: T): T => (v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T));

function captura(doc: CourseDocument): DiagramacaoDaFolha {
  const itens: DiagramacaoDaFolha['itens'] = {};
  for (const o of doc.objects) {
    if (!isPaperAnchored(o)) continue;
    const campos: Record<string, unknown> = {};
    const rec = o as unknown as Record<string, unknown>;
    for (const c of CAMPOS_DA_FOLHA) if (rec[c] !== undefined) campos[c] = copia(rec[c]);
    itens[o.id] = campos;
  }
  return {
    originMm: { ...doc.originMm },
    printScale: doc.page.printScale,
    ...(doc.page.arranjo ? { arranjo: copia(doc.page.arranjo) } : {}),
    itens,
  };
}

function aplica(doc: CourseDocument, dg: DiagramacaoDaFolha): void {
  doc.originMm = { ...dg.originMm };
  doc.page.printScale = dg.printScale;
  if (dg.arranjo) doc.page.arranjo = copia(dg.arranjo);
  else delete doc.page.arranjo;
  for (const o of doc.objects) {
    const campos = dg.itens[o.id];
    // Item que nasceu na outra folha: fica como está, nas duas.
    if (!campos || !isPaperAnchored(o)) continue;
    const rec = o as unknown as Record<string, unknown>;
    for (const c of CAMPOS_DA_FOLHA) {
      if (campos[c] !== undefined) rec[c] = copia(campos[c]);
      else if (c !== 'visible') delete rec[c];
    }
  }
}

/**
 * Põe a folha pedida à vista e guarda a outra. A do desempate, aberta pela
 * primeira vez, nasce igual à do percurso — e se rearruma sozinha, porque
 * o quadro dela só leva o bloco do desempate. A escala acompanha a do
 * percurso até o usuário mudar a do desempate.
 */
export function trocaFolha(doc: CourseDocument, para: FolhaDoCroqui): void {
  const d = doc.desempate;
  if (!d) return;
  const atual: FolhaDoCroqui = d.folhaAtiva === 'desempate' ? 'desempate' : 'percurso';
  if (atual === para) return;
  if (para === 'desempate' && !temDuasFolhas(doc)) return;
  const esta = captura(doc);
  const outra = d.outraFolha;
  if (para === 'desempate') {
    if (outra) {
      aplica(doc, outra);
      if (!outra.escalaPropria) segueEscala(doc, esta.printScale);
    }
    d.folhaAtiva = 'desempate';
  } else {
    // Saindo do desempate: a escala dele é própria se o usuário a mudou.
    if (outra?.escalaPropria || (outra && esta.printScale !== outra.printScale)) esta.escalaPropria = true;
    if (outra) aplica(doc, outra);
    delete d.folhaAtiva;
  }
  d.outraFolha = esta;
}

function segueEscala(doc: CourseDocument, escala: number): void {
  doc.page.printScale = escala;
  if (doc.page.arranjo) {
    doc.page.arranjo.preferida = escala;
    doc.page.arranjo.escala = escala;
  }
}

/**
 * Depois de cada edição: sem desempate em folha própria, volta-se à folha
 * do percurso — trocar a escolha de folhas ou apagar o desempate com a do
 * desempate à vista não pode deixar a diagramação dela no lugar da outra.
 */
export function syncFolhas(doc: CourseDocument): void {
  if (doc.desempate?.folhaAtiva === 'desempate' && !temDuasFolhas(doc)) trocaFolha(doc, 'percurso');
}

/** O documento como a folha daquela vista o mostra (para imprimir e para ver). */
export function docDaFolha(doc: CourseDocument, vista: VistaProva): CourseDocument {
  if (!temDuasFolhas(doc)) return doc;
  const quer = folhaDaVista(vista);
  if (quer === folhaAtiva(doc)) return doc;
  return produce(doc, (draft) => {
    trocaFolha(draft, quer);
    syncArranjo(draft);
  });
}
