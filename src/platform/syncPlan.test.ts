import { describe, expect, it } from 'vitest';
import { planSync } from './syncPlan';

const t = (h: number) => `2026-10-24T${String(h).padStart(2, '0')}:00:00.000Z`;

describe('sincronização com a nuvem (B-78)', () => {
  it('só de um lado vai para o outro', () => {
    expect(planSync([{ id: 'a', savedAt: t(1) }], [], {})).toEqual([{ faz: 'enviar', id: 'a' }]);
    expect(planSync([], [{ id: 'b', savedAt: t(1), apagado: false }], {})).toEqual([{ faz: 'baixar', id: 'b' }]);
    expect(planSync([], [{ id: 'c', savedAt: t(1), apagado: true }], {})).toEqual([]);
  });

  it('o mais novo vale; iguais não fazem nada', () => {
    const l = [{ id: 'a', savedAt: t(2) }];
    expect(planSync(l, [{ id: 'a', savedAt: t(3), apagado: false }], { a: t(2) })).toEqual([{ faz: 'baixar', id: 'a' }]);
    expect(planSync(l, [{ id: 'a', savedAt: t(1), apagado: false }], { a: t(1) })).toEqual([{ faz: 'enviar', id: 'a' }]);
    expect(planSync(l, [{ id: 'a', savedAt: t(2), apagado: false }], { a: t(2) })).toEqual([]);
  });

  it('editado nos dois aparelhos: o mais antigo vira cópia', () => {
    // Sincronizado às 1h; aqui mudou às 2h, na nuvem às 3h.
    expect(planSync([{ id: 'a', savedAt: t(2) }], [{ id: 'a', savedAt: t(3), apagado: false }], { a: t(1) })).toEqual([
      { faz: 'copiar-local-e-baixar', id: 'a' },
    ]);
    expect(planSync([{ id: 'a', savedAt: t(3) }], [{ id: 'a', savedAt: t(2), apagado: false }], { a: t(1) })).toEqual([
      { faz: 'copiar-remota-e-enviar', id: 'a' },
    ]);
  });

  it('apagado na nuvem: apaga aqui, a não ser que tenha mudado aqui depois', () => {
    const r = [{ id: 'a', savedAt: t(3), apagado: true }];
    expect(planSync([{ id: 'a', savedAt: t(1) }], r, { a: t(1) })).toEqual([{ faz: 'apagar-local', id: 'a' }]);
    expect(planSync([{ id: 'a', savedAt: t(4) }], r, { a: t(1) })).toEqual([{ faz: 'enviar', id: 'a' }]);
  });
});
