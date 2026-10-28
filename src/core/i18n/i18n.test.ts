import { afterEach, describe, expect, it } from 'vitest';
import { formatMeters } from '@core/scale/units';
import { formatDecimal, getLang, onLangChange, setLang, t } from './i18n';
import { MESSAGES } from './messages';

afterEach(() => setLang('pt'));

describe('catálogo', () => {
  const marcas = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

  it('toda chave tem texto nas três línguas', () => {
    for (const [chave, texto] of Object.entries(MESSAGES)) {
      for (const lang of ['pt', 'en', 'es'] as const) {
        expect(texto[lang].trim(), `${chave}.${lang}`).not.toBe('');
      }
    }
  });

  it('as três línguas usam os mesmos valores {nome}', () => {
    for (const [chave, texto] of Object.entries(MESSAGES)) {
      expect(marcas(texto.en), chave).toEqual(marcas(texto.pt));
      expect(marcas(texto.es), chave).toEqual(marcas(texto.pt));
    }
  });
});

describe('t', () => {
  it('começa em português', () => {
    expect(getLang()).toBe('pt');
    expect(t('menu.arquivo')).toBe('Arquivo');
  });

  it('segue a língua escolhida', () => {
    setLang('en');
    expect(t('modo.pista')).toBe('Arena');
    setLang('es');
    expect(t('arquivo.salvarPercurso')).toBe('Guardar recorrido');
  });

  it('preenche os valores', () => {
    setLang('en');
    expect(t('folha.botao', { formato: 'A4', escala: '600' })).toBe('Sheet A4 · 1:600');
  });

  it('avisa quem escuta só quando a língua muda', () => {
    let vezes = 0;
    const desliga = onLangChange(() => vezes++);
    setLang('es');
    setLang('es');
    desliga();
    setLang('en');
    expect(vezes).toBe(1);
  });
});

describe('números', () => {
  it('vírgula em português e espanhol, ponto em inglês', () => {
    expect(formatDecimal(3.5, 2)).toBe('3,50');
    setLang('es');
    expect(formatMeters(27.8)).toBe('27,80');
    setLang('en');
    expect(formatMeters(27.8)).toBe('27.80');
  });
});
