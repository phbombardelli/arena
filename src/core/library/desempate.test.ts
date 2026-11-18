import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { addObject } from '@core/commands/ops';
import { setSoDesempate } from '@core/commands/obstacleOps';
import { placeAssistantPath } from '@core/commands/pathOps';
import { buildCourseRide, comoNoDesempate, courseGates, courseOrder, phaseStops } from '@core/assist/courseRide';
import { createObstacle } from '@core/library/obstacles';
import { placeTimingLine, syncTimingLines } from '@core/library/timing';
import { createDocument } from '@core/model/document';
import { createPath, createPathNode } from '@core/model/path';
import { findInterferences } from '@core/assist/interference';
import { createRectangleArena } from '@core/model/arena';
import type { CourseDocument, CoursePath, InfoBox, Obstacle } from '@core/model/types';
import { createInfoBox, fieldLabel, mostraDesempate } from './annotations';
import { infoBoxLayout } from '@core/model/annotationLayout';
import { avisosDesempate, marcaRetirado, syncVarasDoDesempate, varaQueSai, ligaDesempateNosQuadros, lerOrdem, limpaVariacoes, marcaVariacao, ordemQuadro, ordemTexto, paginasDaFolha, proximoNumero, syncQuadroDesempate } from './desempate';

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

  it('o oxer que vira vertical perde a vara de trás só no desempate', () => {
    const base = produce(comOrdem(prova(), '1-2-3-4-5'), (d) => {
      const quatro = d.objects.find((o) => o.kind === 'obstacle' && o.number === '4') as Obstacle;
      quatro.type = 'oxer';
      quatro.spreadM = 1.2;
      quatro.elements = [...quatro.elements, { ...quatro.elements[0]! }];
    });
    const doc = marca(base, '4', 'oxer');
    const quatro = phaseStops(doc, 'desempate').find((st) => st.label === '4')!.elements[0]!;
    expect(quatro.type).toBe('vertical');
    expect(quatro.elements).toHaveLength(1);
    expect(obstaculos(doc).find((o) => o.number === '4')!.type).toBe('oxer');
    expect(ordemQuadro(doc)).toBe('1-2-3AB-4 (vertical)-5');
  });

  it('a distância marcada para o seguinte, valendo no desempate, tira a vara da frente', () => {
    // 2 vira oxer no percurso; distância 2>3A marcada; no desempate o 3 vem logo depois do 2.
    const base = produce(comOrdem(prova(), '1-2-3-4'), (d) => {
      const dois = d.objects.find((o) => o.kind === 'obstacle' && o.number === '2') as Obstacle;
      dois.type = 'oxer';
      dois.spreadM = 1.2;
      dois.elements = [...dois.elements, { ...dois.elements[0]! }];
      const tresA = d.objects.find((o) => o.kind === 'obstacle' && o.number === '3' && o.letter === 'A')!;
      const p = createPath([createPathNode({ x: 10, y: 40 }), createPathNode({ x: 70, y: 30 })]);
      p.obstacleDistances[`${dois.id}>${tresA.id}`] = true;
      addObject(d, p);
    });
    const marcado = produce(base, (d) => {
      const stop = phaseStops(d, 'desempate').find((st) => st.label === '2')!;
      marcaVariacao(d, stop, 'oxer', true);
      syncVarasDoDesempate(d);
    });
    const dois = obstaculos(marcado).find((o) => o.number === '2')!;
    expect(varaQueSai(marcado, dois)).toBe('frente');
    const noDesempate = phaseStops(marcado, 'desempate').find((st) => st.label === '2')!.elements[0]!;
    expect(noDesempate.type).toBe('vertical');
    expect(noDesempate.pos).not.toEqual(dois.pos);

    // Com a do anterior (1>2) também marcada, ele não vira vertical.
    const preso = produce(marcado, (d) => {
      const um = d.objects.find((o) => o.kind === 'obstacle' && o.number === '1')!;
      const p = d.objects.find((o) => o.kind === 'path') as CoursePath;
      p.obstacleDistances[`${um.id}>${dois.id}`] = true;
      syncVarasDoDesempate(d);
    });
    expect(varaQueSai(preso, dois)).toBe('nenhuma');
    expect(phaseStops(preso, 'desempate').find((st) => st.label === '2')!.elements[0]!.type).toBe('oxer');
    expect(avisosDesempate(preso).map((a) => a.key)).toContain('dsp.avisoOxerPreso');

    // Fora de sequência no desempate, a distância não vale: sai a de trás.
    const foraDeSequencia = produce(marcado, (d) => {
      d.desempate!.ordem = lerOrdem('2-1-3-4', obstaculos(d)).ids;
      syncVarasDoDesempate(d);
    });
    expect(varaQueSai(foraDeSequencia, dois)).toBe('tras');
  });

  it('a combinação de dois verticais ao contrário conta como os dois a mais', () => {
    const doc = marca(comOrdem(prova(), '1-2-3-4'), '3AB', 'contrario');
    expect(avisosDesempate(doc).map((a) => a.key)).not.toContain('dsp.avisoExtras');
    const comNovo = marca(comOrdem(prova(), '1-2-3-4-5'), '3AB', 'contrario');
    expect(avisosDesempate(comNovo).find((a) => a.key === 'dsp.avisoExtras')?.params).toEqual({ n: 3 });
  });

  it('outra combinação não pode ser saltada ao contrário', () => {
    const base = produce(comOrdem(prova(), '1-2-3-4'), (d) => {
      const b = d.objects.find((o) => o.kind === 'obstacle' && o.number === '3' && o.letter === 'B') as Obstacle;
      b.type = 'oxer';
    });
    const doc = marca(base, '3AB', 'contrario');
    expect(avisosDesempate(doc).map((a) => a.key)).toContain('dsp.avisoContrarioComb');
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

describe('obstáculo que sai da pista no desempate', () => {
  it('entrar na ordem tira a marca', () => {
    const doc = produce(comOrdem(prova(), '1-3-4'), (d) => {
      const dois = d.objects.find((o) => o.kind === 'obstacle' && o.number === '2')!;
      marcaRetirado(d, dois.id, true);
      syncVarasDoDesempate(d);
    });
    expect(doc.desempate!.retirados).toHaveLength(1);
    const depois = produce(doc, (d) => {
      d.desempate!.ordem = lerOrdem('1-2-3-4', obstaculos(d)).ids;
      syncVarasDoDesempate(d);
    });
    expect(depois.desempate!.retirados).toBeUndefined();
  });

  it('o traçado do desempate pode passar por onde ele estava', () => {
    const base = comOrdem(prova(), '1-3-4');
    const dois = obstaculos(base).find((o) => o.number === '2')!;
    const passaPorCima = (doc: CourseDocument) =>
      produce(doc, (d) => {
        const p = createPath([
          createPathNode({ x: dois.pos.x - 6, y: dois.pos.y }),
          createPathNode({ x: dois.pos.x + 6, y: dois.pos.y }),
        ]);
        p.fase = 'desempate';
        addObject(d, p);
      });
    const armado = findInterferences(passaPorCima(base)).filter((i) => i.ids.includes(dois.id));
    const retirado = findInterferences(
      passaPorCima(produce(base, (d) => marcaRetirado(d, dois.id, true))),
    ).filter((i) => i.ids.includes(dois.id) && i.kind === 'tracado-cruza-obstaculo');
    expect(retirado).toHaveLength(0);
    void armado;
    // O assistente do desempate deixa de desviar dele; o do percurso, não.
    const marcado = produce(base, (d) => marcaRetirado(d, dois.id, true));
    const barreiras = (fase: 'percurso' | 'desempate') =>
      courseGates(marcado, undefined, fase)!.field.blockers.map((o) => o.id);
    expect(barreiras('desempate')).not.toContain(dois.id);
    expect(barreiras('percurso')).toContain(dois.id);
  });
});
