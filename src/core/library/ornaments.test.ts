import { describe, expect, it } from 'vitest';
import { createOrnament, gateRotation } from './ornaments';

describe('entrada e saída da pista (B-13, B-21)', () => {
  const pista = [
    { x: 0, y: 0 },
    { x: 60, y: 0 },
    { x: 60, y: 30 },
    { x: 0, y: 30 },
  ];

  it('entrada aponta para dentro, saída para fora, perpendicular à cerca', () => {
    // Junto à cerca de cima: para dentro é para baixo (+y).
    expect(gateRotation('entrada', { x: 30, y: -1 }, pista)).toBe(90);
    expect(gateRotation('saida', { x: 30, y: -1 }, pista)).toBe(-90);
    // Junto à cerca da esquerda, mesmo do lado de dentro.
    expect(gateRotation('entrada', { x: 1, y: 15 }, pista)).toBe(0);
    expect(Math.abs(gateRotation('saida', { x: 1, y: 15 }, pista))).toBe(180);
  });

  it('nascem com o rótulo ligado; a seta comum, não', () => {
    expect(createOrnament('entrada', { x: 0, y: 0 }).showLabel).toBe(true);
    expect(createOrnament('seta', { x: 0, y: 0 }).showLabel).toBeUndefined();
  });
});
