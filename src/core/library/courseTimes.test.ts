import { describe, expect, it } from 'vitest';
import { createInfoBox } from './annotations';
import {
  aplicaTempos,
  calculaTempos,
  lerNumero,
  limiteTabelaC,
  tempoConcedido,
  tempoIdeal,
} from './courseTimes';
import type { InfoBox } from '@core/model/types';

const valor = (b: InfoBox, id: string) => b.fields.find((f) => f.id === id);

const quadro = (distancia: string, velocidade: string): InfoBox => {
  const b = createInfoBox({ x: 0, y: 0 });
  valor(b, 'distancia')!.value = distancia;
  valor(b, 'velocidade')!.value = velocidade;
  return b;
};

describe('contas de tempo (as do SAPH, regras da CBH)', () => {
  it('concedido arredonda para cima', () => {
    expect(tempoConcedido(412, 350)).toBe(71); // 70,63
    expect(tempoConcedido(350, 350)).toBe(60); // exato não sobe
    expect(tempoConcedido(480, 325)).toBe(89);
    expect(tempoConcedido(0, 350)).toBeNull();
    expect(tempoConcedido(400, 0)).toBeNull();
  });

  it('ideal é 95% do concedido, arredondado', () => {
    expect(tempoIdeal(412, 350)).toBe(67); // 71 × 0,95 = 67,45
    expect(tempoIdeal(480, 325)).toBe(85); // 89 × 0,95 = 84,55
  });

  it('limite é o dobro; na Tabela C, 120 s ou 180 s a partir de 600 m', () => {
    expect(calculaTempos(412, 350, { formato: 'A' }).limite).toBe(142);
    expect(limiteTabelaC(599)).toBe(120);
    expect(limiteTabelaC(600)).toBe(180);
    expect(calculaTempos(412, 350, { formato: 'C' })).toEqual({
      concedido: null,
      limite: 120,
      ideal: null,
      faixa: null,
    });
  });

  it('faixa vai do concedido para baixo, com o ideal no meio', () => {
    const r = calculaTempos(412, 350, { formato: 'faixa' });
    expect(r.ideal).toBe(67);
    expect(r.faixa).toEqual({ inf: 63, sup: 71 });
  });
});

describe('leitura dos campos', () => {
  it.each([
    ['350 m/min', 350],
    ['412 m', 412],
    ['1.234 m', 1234],
    ['1,234 m', 1234],
    ['412,5 m', 412.5],
    ['412.5', 412.5],
    ['', null],
    ['m/min', null],
  ])('%s → %s', (texto, esperado) => {
    expect(lerNumero(texto)).toBe(esperado);
  });
});

describe('aplicaTempos no quadro', () => {
  it('Tabela A escreve concedido e limite e deixa ideal e faixa desligados', () => {
    const b = quadro('412 m', '350 m/min');
    expect(aplicaTempos(b)).toBe(true);
    expect(valor(b, 'tempo')).toMatchObject({ value: '71 s', enabled: true });
    expect(valor(b, 'limite')).toMatchObject({ value: '142 s', enabled: true });
    expect(valor(b, 'ideal')!.enabled).toBe(false);
    expect(valor(b, 'faixa')!.enabled).toBe(false);
  });

  it('faixa liga ideal e faixa', () => {
    const b = quadro('412 m', '350 m/min');
    b.tempos = { formato: 'faixa' };
    aplicaTempos(b);
    expect(valor(b, 'ideal')).toMatchObject({ value: '67 s', enabled: true });
    expect(valor(b, 'faixa')).toMatchObject({ value: '63–71 s', enabled: true });
  });

  it('Tabela C desliga o concedido e não precisa de velocidade', () => {
    const b = quadro('650 m', '');
    b.tempos = { formato: 'C' };
    expect(aplicaTempos(b)).toBe(true);
    expect(valor(b, 'tempo')!.enabled).toBe(false);
    expect(valor(b, 'limite')!.value).toBe('180 s');
  });

  it('sem velocidade não mexe em nada', () => {
    const b = quadro('412 m', '');
    valor(b, 'tempo')!.value = '75 s';
    expect(aplicaTempos(b)).toBe(false);
    expect(valor(b, 'tempo')!.value).toBe('75 s');
  });

  it('quadro antigo ganha os campos que faltam depois do concedido', () => {
    const b = quadro('412 m', '350 m/min');
    b.fields = b.fields.filter((f) => f.id !== 'ideal' && f.id !== 'faixa');
    b.tempos = { formato: 'ideal' };
    aplicaTempos(b);
    const ids = b.fields.map((f) => f.id);
    expect(ids.slice(ids.indexOf('tempo'), ids.indexOf('tempo') + 2)).toEqual(['tempo', 'ideal']);
    expect(ids).not.toContain('faixa');
  });
});
