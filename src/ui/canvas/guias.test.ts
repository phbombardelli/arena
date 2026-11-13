import { describe, expect, it } from 'vitest';
import { encaixa } from './guias';

describe('guias da folha', () => {
  it('perto de um alvo, gruda nele e mostra a linha', () => {
    const r = encaixa([10, 30, 50], [51.2, 100], 2);
    expect(r.ajuste).toBeCloseTo(1.2, 5);
    expect(r.linhas).toEqual([51.2]);
  });
  it('longe de tudo, não mexe e não mostra linha', () => {
    const r = encaixa([10, 30, 50], [60, 100], 2);
    expect(r.ajuste).toBe(0);
    expect(r.linhas).toEqual([]);
  });
  it('alinhando duas bordas ao mesmo tempo, mostra as duas', () => {
    const r = encaixa([10, 30, 50], [10.5, 50.5], 2);
    expect(r.linhas.sort()).toEqual([10.5, 50.5]);
  });
});
