import type { CourseDocument, ObjectId } from '@core/model/types';
import { anotacaoMm, DESENHO_ID, desenhoNaFolhaMm, type RectMm } from '@core/model/document';
import { usableArea } from '@core/scale/units';

/**
 * Guias de alinhamento da folha: arrastando ou redimensionando um quadro,
 * um logo ou o bloco da pista, a borda ou o meio dele "gruda" na borda ou
 * no meio de outro item, das margens ou do centro da folha — e uma linha
 * tracejada mostra com quem alinhou. Tudo em mm de papel.
 */
export interface Guias {
  x: number[];
  y: number[];
}

export interface Alvos {
  x: number[];
  y: number[];
}

/** Bordas e meios de tudo o que está na folha, menos o que se está mexendo. */
export function alvosDaFolha(doc: CourseDocument, mexendo: ReadonlySet<ObjectId>): Alvos {
  const xs: number[] = [];
  const ys: number[] = [];
  const poe = (r: RectMm) => {
    xs.push(r.xMm, r.xMm + r.widthMm / 2, r.xMm + r.widthMm);
    ys.push(r.yMm, r.yMm + r.heightMm / 2, r.yMm + r.heightMm);
  };
  for (const o of doc.objects) {
    if (mexendo.has(o.id) || !o.visible) continue;
    const r = anotacaoMm(doc, o);
    if (r) poe(r);
  }
  if (!mexendo.has(DESENHO_ID)) {
    const d = desenhoNaFolhaMm(doc);
    if (d) poe(d);
  }
  const u = usableArea(doc.page);
  poe({ xMm: u.xMm, yMm: u.yMm, widthMm: u.widthMm, heightMm: u.heightMm });
  return { x: xs, y: ys };
}

/**
 * O menor ajuste que encosta um dos `valores` (bordas e meio de quem se
 * mexe) num dos `alvos`, se for menor que `tol`; e as linhas que ficam
 * alinhadas depois do ajuste.
 */
export function encaixa(valores: number[], alvos: number[], tol: number): { ajuste: number; linhas: number[] } {
  let ajuste = 0;
  let melhor = tol;
  for (const v of valores) {
    for (const a of alvos) {
      const d = a - v;
      if (Math.abs(d) < Math.abs(melhor)) {
        melhor = d;
        ajuste = d;
      }
    }
  }
  if (Math.abs(melhor) >= tol) return { ajuste: 0, linhas: [] };
  const linhas = new Set<number>();
  for (const v of valores) {
    for (const a of alvos) if (Math.abs(v + ajuste - a) < 0.05) linhas.add(Math.round(a * 100) / 100);
  }
  return { ajuste, linhas: [...linhas] };
}

/** Bordas e meio de um retângulo, num eixo. */
export const bordasX = (r: RectMm): number[] => [r.xMm, r.xMm + r.widthMm / 2, r.xMm + r.widthMm];
export const bordasY = (r: RectMm): number[] => [r.yMm, r.yMm + r.heightMm / 2, r.yMm + r.heightMm];

/** Junta retângulos (a seleção arrastada como um bloco só). */
export function uniao(rs: RectMm[]): RectMm | null {
  if (rs.length === 0) return null;
  const x0 = Math.min(...rs.map((r) => r.xMm));
  const y0 = Math.min(...rs.map((r) => r.yMm));
  const x1 = Math.max(...rs.map((r) => r.xMm + r.widthMm));
  const y1 = Math.max(...rs.map((r) => r.yMm + r.heightMm));
  return { xMm: x0, yMm: y0, widthMm: x1 - x0, heightMm: y1 - y0 };
}
