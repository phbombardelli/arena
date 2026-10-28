import { describe, expect, it } from 'vitest';
import { createObstacle } from '@core/library/obstacles';
import { createHeightTable, createInfoBox } from '@core/library/annotations';
import type { Obstacle } from './types';
import { getBounds } from './transform';
import { heightRows, heightTableLayout, infoBoxLayout } from './annotationLayout';

const obstaculo = (numero: string, letra: '' | 'A' | 'B' = '', alturas: number[] = [1.2]): Obstacle => {
  const o = createObstacle('vertical', { x: 0, y: 0 }, numero);
  o.letter = letra;
  o.elements = alturas.map((h) => ({ height: h }));
  return o;
};

describe('quadro técnico', () => {
  it('cresce com o número de campos ligados, não com o total', () => {
    const box = createInfoBox({ x: 0, y: 0 });
    const cheio = infoBoxLayout(box).heightMm;

    box.fields[0]!.enabled = false;
    box.fields[1]!.enabled = false;
    box.fields[2]!.enabled = false;
    expect(infoBoxLayout(box).heightMm).toBeLessThan(cheio);
    const ligados = box.fields.filter((f) => f.enabled).length;
    expect(infoBoxLayout(box).cells).toHaveLength(ligados);
  });

  it('em duas colunas fica mais baixo e as células se dividem', () => {
    const box = createInfoBox({ x: 0, y: 0 });
    const uma = infoBoxLayout(box);
    box.columns = 2;
    const duas = infoBoxLayout(box);

    expect(duas.heightMm).toBeLessThan(uma.heightMm);
    // Mesma quantidade de campos, em células mais estreitas.
    expect(duas.cells).toHaveLength(uma.cells.length);
    expect(duas.cells[0]!.widthMm).toBeCloseTo(uma.cells[0]!.widthMm / 2, 9);
  });

  it('preenche por coluna, como o croqui impresso', () => {
    const box = createInfoBox({ x: 0, y: 0 });
    box.columns = 2;
    const l = infoBoxLayout(box);
    const porColuna = Math.ceil(box.fields.filter((f) => f.enabled).length / 2);

    // O primeiro campo da segunda coluna sobe para o topo, não continua
    // descendo — é a diferença entre ler em bloco e ler em zigue-zague.
    expect(l.cells[porColuna]!.yMm).toBeCloseTo(l.cells[0]!.yMm, 9);
    expect(l.cells[porColuna]!.xMm).toBeGreaterThan(l.cells[0]!.xMm);
  });

  it('a largura pedida é a largura desenhada', () => {
    const box = createInfoBox({ x: 0, y: 0 });
    box.widthMm = 120;
    expect(infoBoxLayout(box).widthMm).toBe(120);
  });

  it('a envoltória de seleção usa o mesmo leiaute do desenho', () => {
    const box = createInfoBox({ x: 20, y: 30 });
    const l = infoBoxLayout(box);
    const b = getBounds(box, 250);
    // 1 mm de papel a 1:250 são 0,25 m no terreno.
    expect((b.max.x - b.min.x) * 1000 / 250).toBeCloseTo(l.widthMm, 6);
    expect((b.max.y - b.min.y) * 1000 / 250).toBeCloseTo(l.heightMm, 6);
  });
});

describe('tabela de alturas', () => {
  it('lê os obstáculos na ordem da numeração', () => {
    const linhas = heightRows([
      obstaculo('3'),
      obstaculo('1'),
      obstaculo('2', 'B'),
      obstaculo('2', 'A'),
    ]);
    expect(linhas.map((r) => r.label)).toEqual(['1', '2A', '2B', '3']);
  });

  it('deixa de fora o obstáculo sem número', () => {
    expect(heightRows([obstaculo('1'), obstaculo('')]).map((r) => r.label)).toEqual(['1']);
  });

  it('mostra a altura que o obstáculo tem, não uma cópia', () => {
    const o = obstaculo('1', '', [1.3]);
    expect(heightRows([o])[0]!.heights).toContain('1,30');
    o.elements = [{ height: 1.45 }];
    // Sem estado próprio: mudou o obstáculo, mudou a linha.
    expect(heightRows([o])[0]!.heights).toContain('1,45');
  });

  it('cresce uma linha por obstáculo, mais o cabeçalho', () => {
    const t = createHeightTable({ x: 0, y: 0 });
    const vazia = heightTableLayout(t, []).heightMm;
    const comDois = heightTableLayout(t, [obstaculo('1'), obstaculo('2')]).heightMm;
    expect(comDois - vazia).toBeCloseTo(t.style.rowHeightMm * 2, 9);
  });

  it('as colunas opcionais entram e saem da largura', () => {
    const t = createHeightTable({ x: 0, y: 0 });
    const semNota = heightTableLayout(t, []).widthMm;
    t.showNote = true;
    expect(heightTableLayout(t, []).widthMm).toBeGreaterThan(semNota);
    t.showSpread = false;
    expect(heightTableLayout(t, []).columns.map((c) => c.titulo)).toEqual([
      'Nº',
      'Altura',
      'Observação',
    ]);
  });

  it('as colunas não se sobrepõem', () => {
    const t = createHeightTable({ x: 0, y: 0 });
    t.showNote = true;
    const cols = heightTableLayout(t, []).columns;
    for (let i = 1; i < cols.length; i += 1) {
      expect(cols[i]!.xMm).toBeGreaterThanOrEqual(cols[i - 1]!.xMm + cols[i - 1]!.widthMm - 1e-9);
    }
  });

  it('a envoltória de seleção acompanha as linhas impressas', () => {
    const t = createHeightTable({ x: 0, y: 0 });
    const obstaculos = [obstaculo('1'), obstaculo('2'), obstaculo('3')];
    const vazia = getBounds(t, 250, []);
    const cheia = getBounds(t, 250, obstaculos);
    expect(cheia.max.y - cheia.min.y).toBeGreaterThan(vazia.max.y - vazia.min.y);
  });
});
