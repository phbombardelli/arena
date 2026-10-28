import type { Vec2 } from '@core/geometry/vec';
import { newId } from '@core/model/ids';
import type { InfoBox, InfoBoxField, HeightTable, TextLabel } from '@core/model/types';
import { localizeDefault, t } from '@core/i18n/i18n';
import type { MessageKey } from '@core/i18n/messages';

/**
 * Anotações da folha: texto livre, quadro técnico e tabela de alturas.
 *
 * Duas decisões vêm do próprio modelo e valem repetir aqui, porque
 * explicam o porquê de dois sistemas de coordenadas convivendo:
 *
 * - O TEXTO livre mora em metros do terreno. Ele nomeia coisas da pista
 *   ("entrada", "aquecimento") e tem que acompanhar o desenho quando a
 *   escala muda.
 * - O QUADRO e a TABELA moram em milímetros de papel. Eles são da folha,
 *   não do terreno: mudar a escala do croqui não pode encolher a letra do
 *   quadro técnico nem tirá-lo do canto onde foi posto.
 */

export function createTextLabel(pos: Vec2, text = t('texto.padrao')): TextLabel {
  return {
    id: newId('txt'),
    kind: 'text',
    layer: 'annotations',
    locked: false,
    visible: true,
    scope: 'percurso',
    z: 0,
    pos,
    text,
    sizeMm: 3.5,
    align: 'start',
    rotation: 0,
    color: '#23282d',
    bold: false,
  };
}

const campo = (id: string, label: string, value = '', enabled = true): InfoBoxField => ({
  id,
  label,
  value,
  enabled,
});

/**
 * Campos do quadro técnico, na ordem em que os croquis os imprimem.
 *
 * Vêm dos planos oficiais (CBH e FEI): prova, tabela e artigo, altura,
 * velocidade, distância, tempo concedido e limite, número de obstáculos e
 * de esforços, e o desenhador. Nem toda prova usa todos — por isso cada
 * campo tem `enabled`, e desligar é mais rápido que digitar.
 *
 * A lista é um PONTO DE PARTIDA, não uma regra: o §44 proíbe validação
 * esportiva, então o programa não confere nada disso. Quem manda é quem
 * assina o croqui.
 */
const CAMPOS: [id: string, key: MessageKey, valor?: string, enabled?: boolean][] = [
  ['prova', 'quadro.prova'],
  ['tabela', 'quadro.tabela'],
  ['artigo', 'quadro.artigo'],
  ['altura', 'quadro.altura'],
  ['velocidade', 'quadro.velocidade', '350 m/min'],
  ['distancia', 'quadro.distancia'],
  ['tempo', 'quadro.tempo'],
  // Tempo ideal e faixa só valem nas provas que os usam (B-25).
  ['ideal', 'quadro.ideal', '', false],
  ['faixa', 'quadro.faixa', '', false],
  ['limite', 'quadro.limite'],
  ['obstaculos', 'quadro.obstaculos'],
  ['esforcos', 'quadro.esforcos'],
  ['desenhador', 'quadro.desenhador'],
];

/** Os campos padrão, com o título na língua atual. */
export const camposPadrao = (): InfoBoxField[] => CAMPOS.map(([id, key, valor, enabled]) => campo(id, t(key), valor, enabled));

/**
 * Título de um campo como sai na folha: o padrão segue a língua da tela;
 * o que o usuário reescreveu fica como está.
 */
export function fieldLabel(f: InfoBoxField): string {
  const key = CAMPOS.find(([id]) => id === f.id)?.[1];
  return key ? localizeDefault(f.label, key) : f.label;
}

export function createInfoBox(posMm: Vec2): InfoBox {
  return {
    id: newId('inf'),
    kind: 'infobox',
    layer: 'annotations',
    locked: false,
    visible: true,
    scope: 'percurso',
    z: 0,
    posMm,
    widthMm: 78,
    columns: 1,
    fields: camposPadrao(),
    style: { sizeMm: 3, borderMm: 0.3 },
  };
}

export function createHeightTable(posMm: Vec2): HeightTable {
  return {
    id: newId('alt'),
    kind: 'heighttable',
    layer: 'annotations',
    locked: false,
    visible: true,
    scope: 'percurso',
    z: 0,
    posMm,
    elementColumns: 2,
    showSpread: true,
    showNote: false,
    style: { sizeMm: 2.6, rowHeightMm: 5 },
  };
}
