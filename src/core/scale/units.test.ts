import { describe, expect, it } from 'vitest';
import {
  fitScale,
  metersToPaper,
  mmPerMeter,
  nextStandardScale,
  pageSize,
  paperToMeters,
  usableArea,
  formatMeters,
} from './units';
import type { PageSetup } from './units';

const a3landscape: PageSetup = {
  format: 'A3',
  widthMm: 297,
  heightMm: 420,
  orientation: 'landscape',
  marginsMm: { top: 10, right: 10, bottom: 10, left: 10 },
  printScale: 250,
  scaleLabel: { visible: true, corner: 'inferior-direito', bar: true },
};

describe('conversão metro ↔ papel', () => {
  it('1:250 põe 1 m em 4 mm', () => {
    expect(mmPerMeter(250)).toBe(4);
    expect(metersToPaper(1, 250)).toBe(4);
    expect(metersToPaper(80, 250)).toBe(320);
  });

  it('1:100 põe 1 m em 10 mm', () => {
    expect(metersToPaper(1, 100)).toBe(10);
  });

  it('é reversível sem perda perceptível', () => {
    for (const scale of [50, 125, 250, 333, 1000]) {
      for (const m of [0, 0.5, 17.4, 80, 430]) {
        expect(paperToMeters(metersToPaper(m, scale), scale)).toBeCloseTo(m, 10);
      }
    }
  });
});

describe('escalas padrão', () => {
  it('arredonda para a escala redonda imediatamente superior', () => {
    expect(nextStandardScale(237)).toBe(250);
    expect(nextStandardScale(250)).toBe(250);
    expect(nextStandardScale(251)).toBe(300);
    // A lista começa em 1:250 (B-71): nada abaixo disso é proposto.
    expect(nextStandardScale(1)).toBe(250);
  });

  it('fitScale escolhe escala em que a pista realmente cabe', () => {
    const usable = usableArea(a3landscape);
    const scale = fitScale(80, 40, usable.widthMm, usable.heightMm);
    expect(metersToPaper(80, scale)).toBeLessThanOrEqual(usable.widthMm);
    expect(metersToPaper(40, scale)).toBeLessThanOrEqual(usable.heightMm);
  });
});

describe('página', () => {
  it('paisagem troca largura e altura', () => {
    expect(pageSize(a3landscape)).toEqual({ widthMm: 420, heightMm: 297 });
    expect(pageSize({ ...a3landscape, orientation: 'portrait' })).toEqual({
      widthMm: 297,
      heightMm: 420,
    });
  });

  it('área útil desconta as margens', () => {
    expect(usableArea(a3landscape)).toEqual({
      xMm: 10,
      yMm: 10,
      widthMm: 400,
      heightMm: 277,
    });
  });
});

describe('formatação', () => {
  it('usa vírgula decimal', () => {
    expect(formatMeters(27.8)).toBe('27,80');
    expect(formatMeters(5, 0)).toBe('5');
  });
});
