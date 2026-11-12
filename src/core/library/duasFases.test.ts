import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { addObject } from '@core/commands/ops';
import { placeAssistantPath } from '@core/commands/pathOps';
import { buildCourseRide, courseGates } from '@core/assist/courseRide';
import { courseDistancesAlong } from '@core/assist/obstacleDistances';
import { createObstacle } from '@core/library/obstacles';
import { syncTimingLines } from '@core/library/timing';
import { createDocument } from '@core/model/document';
import { createRectangleArena } from '@core/model/arena';
import { infoBoxLayout } from '@core/model/annotationLayout';
import type { CourseDocument, InfoBox, Obstacle, TimingLine } from '@core/model/types';
import { createInfoBox } from './annotations';
import {
  avisosDuasFases,
  divisaDe,
  extensoesDasFases,
  fasesDoPercurso,
  ligaDuasFases,
  mudaFimDaPrimeira,
  padraoSegunda,
  syncDuasFases,
} from './duasFases';

/** Doze obstáculos em zigue-zague numa pista grande, todos saltados para a direita. */
function prova(n = 12): CourseDocument {
  return produce(createDocument(), (d) => {
    d.objects.length = 0;
    addObject(d, createRectangleArena({ x: 0, y: 0 }, 200, 80));
    for (let i = 0; i < n; i += 1) {
      const o = createObstacle('vertical', { x: 15 + i * 15, y: i % 2 === 0 ? 25 : 55 }, String(i + 1));
      o.rotation = 90;
      addObject(d, o);
    }
    const quadro = createInfoBox({ x: 10, y: 10 });
    quadro.fields.find((f) => f.id === 'velocidade')!.value = '350 m/min';
    addObject(d, quadro);
  });
}

const comTracado = (doc: CourseDocument) =>
  produce(doc, (d) => {
    const ride = buildCourseRide(d)!;
    placeAssistantPath(d, ride.path);
  });

/** O que o documentStore faz depois de cada edição, no que importa aqui. */
const sincroniza = (d: CourseDocument) => {
  syncTimingLines(d);
  syncDuasFases(d);
};

const quadroDe = (doc: CourseDocument) => doc.objects.find((o): o is InfoBox => o.kind === 'infobox')!;
const valor = (box: InfoBox, id: string) => box.fields.find((f) => f.id === id)?.value;

describe('prova em duas fases (B-95)', () => {
  it('a 2ª fase começa com 4 a 6 obstáculos', () => {
    expect(padraoSegunda(11)).toBe(4);
    expect(padraoSegunda(13)).toBe(4);
    expect(padraoSegunda(15)).toBe(6);
    expect(padraoSegunda(5)).toBe(2);
    expect(padraoSegunda(1)).toBe(0);
  });

  it('ligar cria a linha das fases presa à saída do último da 1ª', () => {
    const doc = produce(prova(), (d) => ligaDuasFases(d, true));
    const f = fasesDoPercurso(doc)!;
    expect(f.primeira.map((s) => s.label)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8']);
    expect(f.segunda.map((s) => s.label)).toEqual(['9', '10', '11', '12']);
    const divisa = divisaDe(doc)!;
    const oito = doc.objects.find((o): o is Obstacle => o.kind === 'obstacle' && o.number === '8')!;
    expect(divisa.anchor?.obstacleId).toBe(oito.id);
    // Do lado de saída do 8 (salto para a direita: +x).
    expect(divisa.pos.x).toBeGreaterThan(oito.pos.x + 5);
    expect(divisa.role).toBe('finish');
  });

  it('a divisa não conta como chegada do percurso', () => {
    const doc = produce(prova(), (d) => ligaDuasFases(d, true));
    const prep = courseGates(doc)!;
    const rotulos = prep.gates.map((g) => g.label);
    // Sem partida e chegada próprias: a única cruzada é a das fases, depois do 8.
    expect(rotulos.indexOf('8') + 1).toBe(rotulos.findIndex((r) => r.includes('2ª')));
    expect(rotulos[rotulos.length - 1]).toBe('12');
  });

  it('o assistente passa pela divisa, e as extensões das fases somam o traçado', () => {
    const doc = comTracado(produce(prova(), (d) => ligaDuasFases(d, true)));
    const ext = extensoesDasFases(doc)!;
    expect(ext).not.toBeNull();
    expect(ext.primeira).toBeGreaterThan(0);
    expect(ext.segunda).toBeGreaterThan(0);
    const tracado = doc.objects.find((o) => o.kind === 'path')!;
    const timings = doc.objects.filter((o): o is TimingLine => o.kind === 'timing');
    const obs = doc.objects.filter((o): o is Obstacle => o.kind === 'obstacle');
    const dists = tracado.kind === 'path' ? courseDistancesAlong(tracado, obs, timings) : [];
    const divisa = divisaDe(doc)!;
    expect(dists.some((x) => x.toId === divisa.id)).toBe(true);
    expect(dists.some((x) => x.fromId === divisa.id)).toBe(true);
  });

  it('o quadro ganha as seções 1ª e 2ª fase, com distância e tempos de cada uma', () => {
    const base = comTracado(produce(prova(), (d) => ligaDuasFases(d, true)));
    const doc = produce(base, (d) => {
      // Religar com o traçado já feito preenche as distâncias.
      ligaDuasFases(d, false);
      ligaDuasFases(d, true);
    });
    const box = quadroDe(doc);
    const l = infoBoxLayout(box);
    expect(l.secoes.map((s) => s.titulo)).toEqual(['1ª FASE', '2ª FASE']);
    expect(valor(box, 'f2Velocidade')).toBe('350 m/min');
    expect(valor(box, 'f2Distancia')).toMatch(/ m$/);
    expect(valor(box, 'f2Tempo')).toMatch(/ s$/);
    expect(valor(box, 'f2Limite')).toMatch(/ s$/);
    // Velocidade e distância da 1ª ficam na seção dela, não em cima.
    const secao1 = l.secoes[0]!.tituloYMm;
    const vel = l.cells.find((c) => c.label === 'Velocidade')!;
    expect(vel.yMm).toBeGreaterThan(secao1);
  });

  it('a extensão corrigida do percurso inteiro não vira a distância da 1ª fase', () => {
    const base = comTracado(produce(prova(), (d) => ligaDuasFases(d, true)));
    const doc = produce(base, (d) => {
      ligaDuasFases(d, false);
      quadroDe(d).distanciaCorrigidaM = 999;
      ligaDuasFases(d, true);
    });
    const ext = extensoesDasFases(doc)!;
    expect(valor(quadroDe(doc), 'distancia')).toBe(`${Math.round(ext.primeira)} m`);
    // Desligando, a corrigida volta.
    const sem = produce(doc, (d) => ligaDuasFases(d, false));
    expect(valor(quadroDe(sem), 'distancia')).toBe('999 m');
  });

  it('traçado que não cruza a linha: a 1ª fase vai até o ponto dele mais perto da linha', () => {
    // Traçado feito antes de ligar: depois, a linha é posta mais para o lado.
    const doc = produce(comTracado(prova()), (d) => {
      ligaDuasFases(d, true);
      const linha = divisaDe(d)!;
      linha.pos = { x: linha.pos.x, y: linha.pos.y + 4 };
      linha.widthM = 1;
    });
    const ext = extensoesDasFases(doc);
    expect(ext).not.toBeNull();
    expect(ext!.primeira).toBeGreaterThan(0);
    expect(ext!.segunda).toBeGreaterThan(0);
  });

  it('2ª fase em Tabela C: só o limite', () => {
    const doc = comTracado(produce(prova(), (d) => ligaDuasFases(d, true)));
    const out = produce(doc, (d) => {
      const box = quadroDe(d);
      box.fields.find((f) => f.id === 'f2Tabela')!.value = 'C';
      ligaDuasFases(d, false);
      ligaDuasFases(d, true);
      box.fields.find((f) => f.id === 'f2Tabela')!.value = 'C';
      mudaFimDaPrimeira(d, d.duasFases!.fimDaPrimeira);
    });
    const box = quadroDe(out);
    expect(valor(box, 'f2Tempo')).toBe('');
    expect(valor(box, 'f2Limite')).toMatch(/^(120|180) s$/);
  });

  it('mudar o fim da 1ª leva a divisa junto', () => {
    const doc = produce(prova(), (d) => {
      ligaDuasFases(d, true);
      const seis = d.objects.find((o): o is Obstacle => o.kind === 'obstacle' && o.number === '6')!;
      mudaFimDaPrimeira(d, seis.id);
      sincroniza(d);
    });
    const seis = doc.objects.find((o): o is Obstacle => o.kind === 'obstacle' && o.number === '6')!;
    expect(divisaDe(doc)!.anchor?.obstacleId).toBe(seis.id);
    expect(fasesDoPercurso(doc)!.segunda).toHaveLength(6);
  });

  it('desligar apaga a divisa e as seções do quadro', () => {
    const doc = produce(prova(), (d) => {
      ligaDuasFases(d, true);
      ligaDuasFases(d, false);
    });
    expect(divisaDe(doc)).toBeUndefined();
    expect(infoBoxLayout(quadroDe(doc)).secoes).toHaveLength(0);
  });

  it('avisos do Art. 222', () => {
    const ok = produce(prova(12), (d) => ligaDuasFases(d, true));
    expect(avisosDuasFases(ok).map((a) => a.chave)).toEqual([]);
    const curta = produce(prova(8), (d) => ligaDuasFases(d, true));
    const chaves = avisosDuasFases(curta).map((a) => a.chave);
    expect(chaves).toContain('df.avisoSegunda');
    expect(chaves).toContain('df.avisoTotal');
    const comDesempate = produce(ok, (d) => {
      d.desempate = { ordem: [d.objects.find((o) => o.kind === 'obstacle')!.id] };
    });
    expect(avisosDuasFases(comDesempate).map((a) => a.chave)).toContain('df.avisoDesempate');
  });

  it('a divisa sai quando a 2ª fase fica sem obstáculo', () => {
    const doc = produce(prova(), (d) => {
      ligaDuasFases(d, true);
      // Apaga do 9 ao 12.
      d.objects = d.objects.filter((o) => !(o.kind === 'obstacle' && Number(o.number) > 8));
      sincroniza(d);
    });
    expect(divisaDe(doc)).toBeUndefined();
  });
});
