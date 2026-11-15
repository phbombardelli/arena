import type { CourseDocument, VistaProva } from '@core/model/types';
import { pageSize } from '@core/scale/units';
import { paginasDaFolha } from './desempate';

/** Uma página da saída: uma vista do croqui ou a especificação (B-108). */
export type PaginaDaSaida = VistaProva | 'especificacao';

/** As páginas do PDF e da impressão, na ordem. */
export const paginasDaSaida = (doc: CourseDocument): PaginaDaSaida[] => [
  ...paginasDaFolha(doc),
  ...(doc.especificacao ? (['especificacao'] as const) : []),
];

/** Espaço entre as folhas empilhadas na aba Impressão, em mm. */
export const VAO_ENTRE_FOLHAS_MM = 14;

/**
 * A folha que se edita (B-107): a do desempate, quando ele tem folha
 * própria e ela está à vista; senão, a primeira.
 */
export function indiceDaFolhaAtiva(doc: CourseDocument): number {
  if (doc.desempate?.folhaAtiva !== 'desempate') return 0;
  const i = paginasDaSaida(doc).indexOf('desempate');
  return i < 0 ? 0 : i;
}

/**
 * Na aba Impressão as folhas ficam uma embaixo da outra, como numa
 * visualização de impressão. A que se edita fica no lugar de sempre (o
 * papel começa em 0,0), e as outras acima e abaixo dela, na ordem do PDF.
 */
export function folhaRectMm(doc: CourseDocument, i: number): { x: number; y: number; width: number; height: number } {
  const { widthMm, heightMm } = pageSize(doc.page);
  const passo = heightMm + VAO_ENTRE_FOLHAS_MM;
  return { x: 0, y: (i - indiceDaFolhaAtiva(doc)) * passo, width: widthMm, height: heightMm };
}

/** Todas as folhas juntas. */
export function todasAsFolhasMm(doc: CourseDocument): { x: number; y: number; width: number; height: number } {
  const n = paginasDaSaida(doc).length;
  const primeira = folhaRectMm(doc, 0);
  const ultima = folhaRectMm(doc, n - 1);
  return { x: 0, y: primeira.y, width: ultima.width, height: ultima.y + ultima.height - primeira.y };
}

/** A folha mais perto de uma altura do papel (o centro da tela). */
export function folhaEm(doc: CourseDocument, yMm: number): number {
  const n = paginasDaSaida(doc).length;
  const { heightMm } = pageSize(doc.page);
  const i = Math.floor((yMm + VAO_ENTRE_FOLHAS_MM / 2) / (heightMm + VAO_ENTRE_FOLHAS_MM)) + indiceDaFolhaAtiva(doc);
  return Math.max(0, Math.min(n - 1, i));
}
