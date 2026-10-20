import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { createArena, createDocument } from '@core/model/document';
import { createOrnament } from '@core/library/ornaments';
import type { CourseDocument } from '@core/model/types';
import { addObject, duplicateObjects } from './ops';
import { hasLinked, linkObjects, unlinkObjects, withLinked } from './groupOps';

const edit = (doc: CourseDocument, recipe: (d: CourseDocument) => void) => produce(doc, recipe);

describe('vínculo entre objetos (decisão 61)', () => {
  const base = () => {
    const pista = createArena(60, 30);
    const a = createOrnament('arvore', { x: -5, y: 2 });
    const b = createOrnament('arvore', { x: -5, y: 9 });
    const c = createOrnament('arvore', { x: 70, y: 9 });
    const doc = edit(createDocument(), (d) => [pista, a, b, c].forEach((o) => addObject(d, o)));
    return { doc, pista, a, b, c };
  };

  it('clicar em um traz todos os vinculados', () => {
    const { doc, pista, a, b, c } = base();
    const ligado = edit(doc, (d) => linkObjects(d, [pista.id, a.id, b.id]));
    expect(new Set(withLinked(ligado, [a.id]))).toEqual(new Set([a.id, pista.id, b.id]));
    expect(withLinked(ligado, [c.id])).toEqual([c.id]);
    expect(hasLinked(ligado, [b.id])).toBe(true);
  });

  it('vincular junta grupos existentes; desvincular solta o grupo inteiro', () => {
    const { doc, pista, a, b, c } = base();
    let d1 = edit(doc, (d) => linkObjects(d, [pista.id, a.id]));
    d1 = edit(d1, (d) => linkObjects(d, [b.id, a.id]));
    expect(withLinked(d1, [pista.id])).toHaveLength(3);
    d1 = edit(d1, (d) => unlinkObjects(d, [b.id]));
    expect(hasLinked(d1, [pista.id, a.id, b.id, c.id])).toBe(false);
  });

  it('a cópia fica vinculada entre si, não ao original', () => {
    const { doc, a, b } = base();
    let d1 = edit(doc, (d) => linkObjects(d, [a.id, b.id]));
    let novos: string[] = [];
    d1 = edit(d1, (d) => {
      novos = duplicateObjects(d, [a.id, b.id], { x: 1, y: 1 });
    });
    expect(new Set(withLinked(d1, [novos[0]!]))).toEqual(new Set(novos));
    expect(withLinked(d1, [a.id])).toHaveLength(2);
    expect(withLinked(d1, [a.id])).not.toContain(novos[0]);
  });
});
