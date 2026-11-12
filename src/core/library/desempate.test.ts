import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { addObject } from '@core/commands/ops';
import { setSoDesempate } from '@core/commands/obstacleOps';
import { placeAssistantPath } from '@core/commands/pathOps';
import { buildCourseRide, comoNoDesempate, courseOrder, phaseStops } from '@core/assist/courseRide';
import { createObstacle } from '@core/library/obstacles';
import { placeTimingLine, syncTimingLines } from '@core/library/timing';
import { createDocument } from '@core/model/document';
import { createRectangleArena } from '@core/model/arena';
import type { CourseDocument, InfoBox, Obstacle } from '@core/model/types';
import { createInfoBox, fieldLabel, mostraDesempate } from './annotations';
import { infoBoxLayout } from '@core/model/annotationLayout';
import { avisosDesempate, ligaDesempateNosQuadros, lerOrdem, limpaVariacoes, marcaVariacao, ordemQuadro, ordemTexto, paginasDaFolha, proximoNumero, syncQuadroDesempate } from './desempate';

function obstaculo(numero: string, letra: '' | 'A' | 'B' | 'C', x: number, y: number, rot = 0): Obstacle {
  const o = createObstacle('vertical', { x, y }, numero);
  o.letter = letra;
  o.rotation = rot;
  return o;
}

/** Percurso de 1 a 4, com a combinação 3AB, e o 5 "Só desempate". */
function prova(): CourseDocument {
  const pecas = [
    createRectangleArena({ x: 0, y: 0 }, 80, 50),
    obstaculo('1', '', 25, 40),
    obstaculo('2', '', 60, 30, 90),
    obstaculo('3', 'A', 45, 12, 180),
    obstaculo('3', 'B', 37, 12, 180),
    obstaculo('4', '', 20, 22, 270),
    obstaculo('', '', 40, 30, 90),
  ];
  return produce(createDocument(), (d) => {
    d.objects.length = 0;
    for (const p of pecas) addObject(d, p);
    const extra = d.objects.find((o) => o.kind === 'obstacle' && o.number === '')!;
    setSoDesempate(d, extra.id, true);
  });
}

const obstaculos = (doc: CourseDocument) =>
  doc.objects.filter((o): o is Obstacle => o.kind === 'obstacle');

const comOrdem = (doc: CourseDocument, texto: string) =>
  produce(doc, (d) => {
    d.desempate = { ordem: lerOrdem(texto, obstaculos(d)).ids };
  });

describe('obstáculo Só desempate', () => {
  it('ganha o número seguinte ao último e sai do percurso', () => {
    const doc = prova();
    const extra = obstaculos(doc).find((o) => o.soDesempate)!;
    expect(extra.number).toBe('5');
    expect(courseOrder(obstaculos(doc)).map((s) => s.label)).toEqual(['1', '2', '3AB', '4']);
  });

  it('proximoNumero ignora o próprio obstáculo', () => {
    const doc = prova();
    const extra = obstaculos(doc).find((o) => o.soDesempate)!;
    expect(proximoNumero(obstaculos(doc), extra.id)).toBe('5');
  });
});

describe('ordem do desempate', () => {
  it('"3" traz a combinação inteira e "3a" só o A', () => {
    const doc = prova();
    expect(ordemTexto(phaseStops(comOrdem(doc, '1-3-5'), 'desempate'))).toBe('1-3AB-5');
    expect(ordemTexto(phaseStops(comOrdem(doc, '1, 3a 5'), 'desempate'))).toBe('1-3A-5');
  });

  it('aponta o que não existe', () => {
    expect(lerOrdem('1-9-3c-x', obstaculos(prova())).desconhecidos).toEqual(['9', '3c', 'x']);
  });

  it('renumerar o percurso não desfaz a ordem', () => {
    const doc = produce(comOrdem(prova(), '2-1'), (d) => {
      const dois = d.objects.find((o) => o.kind === 'obstacle' && o.number === '2') as Obstacle;
      dois.number = '7';
    });
    expect(ordemTexto(phaseStops(doc, 'desempate'))).toBe('7-1');
  });
});

describe('avisos da FEI (Art. 218.2)', () => {
  const chaves = (doc: CourseDocument) => avisosDesempate(doc).map((a) => a.key);

  it('menos de seis obstáculos e sem a combinação', () => {
    expect(chaves(comOrdem(prova(), '1-2-5'))).toEqual(['dsp.avisoMinimo', 'dsp.avisoCombinacao']);
  });

  it('com a combinação, só falta o mínimo', () => {
    expect(chaves(comOrdem(prova(), '1-2-3-4-5'))).toEqual(['dsp.avisoMinimo']);
  });

  it('elemento repetido', () => {
    expect(chaves(comOrdem(prova(), '1-1-2-3-4-5'))).toContain('dsp.avisoRepetido');
  });

  it('sem ordem, nada a dizer', () => {
    expect(avisosDesempate(prova())).toEqual([]);
  });
});

describe('cruzadas e traçado do desempate', () => {
  it('a partida do desempate segue o primeiro da ordem', () => {
    let doc = comOrdem(prova(), '2-1-3-4-5');
    const dois = obstaculos(doc).find((o) => o.number === '2')!;
    const partida = placeTimingLine('start', dois, 12, undefined, 'desempate');
    doc = produce(doc, (d) => {
      addObject(d, partida);
      // A ordem muda: a partida muda de dono junto.
      d.desempate!.ordem = lerOrdem('4-1', obstaculos(d)).ids;
      syncTimingLines(d);
    });
    const linha = doc.objects.find((o) => o.kind === 'timing')!;
    const quatro = obstaculos(doc).find((o) => o.number === '4')!;
    expect(linha.kind === 'timing' && linha.anchor?.obstacleId).toBe(quatro.id);
  });

  it('o traçado do desempate não substitui o do percurso', () => {
    let doc = comOrdem(prova(), '1-2-3-4-5');
    const percurso = buildCourseRide(doc)!;
    const desempate = buildCourseRide(doc, undefined, 'desempate')!;
    doc = produce(doc, (d) => {
      placeAssistantPath(d, percurso.path);
      placeAssistantPath(d, desempate.path, 'desempate');
    });
    const tracados = doc.objects.filter((o) => o.kind === 'path');
    expect(tracados.map((p) => p.kind === 'path' && (p.fase ?? 'percurso'))).toEqual(['percurso', 'desempate']);
    expect(desempate.stops).toEqual(['1', '2', '3AB', '4', '5']);
  });
});

describe('sentido contrário e vertical que vira oxer', () => {
  const marca = (doc: CourseDocument, label: string, v: 'contrario' | 'oxer') =>
    produce(doc, (d) => {
      const stop = phaseStops(d, 'desempate').find((st) => st.label === label)!;
      marcaVariacao(d, stop, v, true);
    });

  it('o obstáculo invertido tem a seta virada só no desempate', () => {
    const doc = marca(comOrdem(prova(), '1-2-3-4-5'), '2', 'contrario');
    const dois = obstaculos(doc).find((o) => o.number === '2')!;
    expect(dois.arrow.reversed).toBe(false);
    expect(comoNoDesempate(dois, doc.desempate).arrow.reversed).toBe(true);
    const noDesempate = phaseStops(doc, 'desempate').find((st) => st.label === '2')!;
    expect(noDesempate.elements[0]!.arrow.reversed).toBe(true);
  });

  it('o vertical que vira oxer ganha a largura e a segunda vara', () => {
    const doc = marca(comOrdem(prova(), '1-2-3-4-5'), '4', 'oxer');
    const quatro = phaseStops(doc, 'desempate').find((st) => st.label === '4')!.elements[0]!;
    expect(quatro.type).toBe('oxer');
    expect(quatro.spreadM).toBeGreaterThan(0);
    expect(quatro.elements).toHaveLength(2);
    expect(obstaculos(doc).find((o) => o.number === '4')!.type).toBe('vertical');
  });

  it('contam como obstáculo a mais, junto com o Só desempate', () => {
    let doc = marca(comOrdem(prova(), '1-2-3-4-5'), '2', 'contrario');
    expect(avisosDesempate(doc).map((a) => a.key)).not.toContain('dsp.avisoExtras');
    doc = marca(doc, '4', 'oxer');
    expect(avisosDesempate(doc).find((a) => a.key === 'dsp.avisoExtras')?.params).toEqual({ n: 3 });
  });

  it('o quadro mostra as marcas em texto simples', () => {
    const doc = marca(marca(comOrdem(prova(), '1-2-3-4-5'), '2', 'contrario'), '4', 'oxer');
    expect(ordemQuadro(doc)).toBe('1-2 (inv.)-3AB-4 (oxer)-5');
  });

  it('sair da ordem tira a marca', () => {
    const doc = produce(marca(comOrdem(prova(), '1-2-3-4-5'), '2', 'contrario'), (d) => {
      d.desempate!.ordem = lerOrdem('1-3-4-5', obstaculos(d)).ids;
      limpaVariacoes(d.desempate!);
    });
    expect(doc.desempate!.contrario).toBeUndefined();
  });

  it('o traçado do desempate entra no invertido pelo outro lado', () => {
    const base = comOrdem(prova(), '1-2-3-4-5');
    const normal = buildCourseRide(base, undefined, 'desempate')!;
    const invertido = buildCourseRide(marca(base, '2', 'contrario'), undefined, 'desempate')!;
    expect(invertido.path.nodes.map((n) => n.pos)).not.toEqual(normal.path.nodes.map((n) => n.pos));
  });
});

describe('páginas da folha', () => {
  it('sem desempate, a folha de sempre; com ele, a escolha', () => {
    expect(paginasDaFolha(prova())).toEqual(['ambos']);
    const doc = comOrdem(prova(), '1-2-3-4-5');
    expect(paginasDaFolha(doc)).toEqual(['percurso']);
    const duas = produce(doc, (d) => { d.desempate!.folha = 'duas'; });
    expect(paginasDaFolha(duas)).toEqual(['percurso', 'desempate']);
    const uma = produce(doc, (d) => { d.desempate!.folha = 'uma'; });
    expect(paginasDaFolha(uma)).toEqual(['ambos']);
  });
});

describe('quadro técnico do desempate', () => {
  const comQuadro = (doc: CourseDocument) =>
    produce(doc, (d) => {
      const q = createInfoBox({ x: 0, y: 0 });
      mostraDesempate(q, true);
      d.objects.push(q);
    });
  const quadro = (doc: CourseDocument) => doc.objects.find((o) => o.kind === 'infobox') as InfoBox;

  it('a ordem acompanha o desenho, com as marcas', () => {
    let doc = comQuadro(comOrdem(prova(), '1-2-3-4-5'));
    doc = produce(doc, (d) => {
      const dois = phaseStops(d, 'desempate').find((st) => st.label === '2')!;
      marcaVariacao(d, dois, 'contrario', true);
      syncQuadroDesempate(d);
    });
    expect(quadro(doc).fields.find((f) => f.id === 'dspOrdem')!.value).toBe('1-2 (inv.)-3AB-4-5');
  });

  it('o bloco sai separado, embaixo; com páginas separadas, cada uma leva o seu', () => {
    const q = quadro(comQuadro(prova()));
    const tudo = infoBoxLayout(q);
    expect(tudo.secoes).toHaveLength(1);
    const ultimoPrincipal = tudo.cells.find((c) => c.label === fieldLabel(q.fields.find((f) => f.id === 'desenhador')!))!;
    const primeiroDsp = tudo.cells.find((c) => c.label === fieldLabel(q.fields.find((f) => f.id === 'dspOrdem')!))!;
    expect(primeiroDsp.yMm).toBeGreaterThan(ultimoPrincipal.yMm);
    const so = infoBoxLayout(q, 'desempate');
    expect(so.cells).toHaveLength(6); // a prova e os cinco do desempate
    expect(so.heightMm).toBeLessThan(tudo.heightMm);
    // Na página do percurso, quando o desempate tem a sua, o bloco não vai.
    const percurso = infoBoxLayout(q, 'percurso');
    expect(percurso.secoes).toHaveLength(0);
    expect(percurso.cells.some((c) => c.label === primeiroDsp.label)).toBe(false);
  });
});

describe('quadro técnico ao ganhar desempate', () => {
  it('liga o bloco, com a velocidade do percurso, e a ordem vem do desenho', () => {
    let doc = produce(prova(), (d) => {
      addObject(d, createInfoBox({ x: 0, y: 0 }));
    });
    doc = produce(comOrdem(doc, '1-3-5'), (d) => {
      ligaDesempateNosQuadros(d);
      syncQuadroDesempate(d);
    });
    const q = doc.objects.find((o): o is InfoBox => o.kind === 'infobox')!;
    const campo = (id: string) => q.fields.find((f) => f.id === id)!;
    expect(campo('dspOrdem').enabled).toBe(true);
    expect(campo('dspOrdem').value).toBe('1-3AB-5');
    expect(campo('dspVelocidade').value).toBe(campo('velocidade').value);
  });
});
