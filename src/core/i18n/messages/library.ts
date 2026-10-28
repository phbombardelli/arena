import type { Texto } from '../messages';

/** Nomes da biblioteca: obstáculos, ornamentos, construções, linhas e quadro técnico. */
export const LIBRARY = {
  'obst.vertical': { pt: 'Vertical', en: 'Vertical', es: 'Vertical' },
  'obst.verticalDica': {
    pt: 'Uma única linha de varas, sem largura.',
    en: 'A single line of poles, no spread.',
    es: 'Una sola línea de barras, sin espesor.',
  },
  'obst.oxer': { pt: 'Oxer', en: 'Oxer', es: 'Oxer' },
  'obst.oxerDica': {
    pt: 'Duas linhas de varas, com largura entre elas.',
    en: 'Two lines of poles, with a spread between them.',
    es: 'Dos líneas de barras, con espesor entre ellas.',
  },
  'obst.triplice': { pt: 'Tríplice', en: 'Triple bar', es: 'Triple barra' },
  'obst.tripliceDica': {
    pt: 'Três linhas em altura crescente.',
    en: 'Three lines of increasing height.',
    es: 'Tres líneas de altura creciente.',
  },
  'obst.muro': { pt: 'Muro', en: 'Wall', es: 'Muro' },
  'obst.muroDica': { pt: 'Bloco maciço.', en: 'Solid block.', es: 'Bloque macizo.' },
  'obst.plano': { pt: 'Vara no chão', en: 'Ground pole', es: 'Barra en el piso' },
  'obst.planoDica': { pt: 'Uma vara deitada no chão.', en: 'A pole lying on the ground.', es: 'Una barra apoyada en el piso.' },
  'obst.x': { pt: 'X', en: 'Cross pole', es: 'Cruzado' },
  'obst.xDica': {
    pt: 'Duas varas cruzadas, com suporte nas pontas.',
    en: 'Two crossed poles, supported at the ends.',
    es: 'Dos barras cruzadas, con soporte en las puntas.',
  },
  'obst.cavalete': { pt: 'Cavalete', en: 'Cavaletti', es: 'Cavaletti' },
  'obst.cavaleteDica': {
    pt: 'Vara no chão apoiada num X em cada ponta.',
    en: 'A ground pole resting on a cross at each end.',
    es: 'Barra en el piso apoyada en una cruz en cada punta.',
  },

  'orn.cone': { pt: 'Cone', en: 'Cone', es: 'Cono' },
  'orn.arvore': { pt: 'Árvore', en: 'Tree', es: 'Árbol' },
  'orn.arbusto': { pt: 'Arbusto', en: 'Shrub', es: 'Arbusto' },
  'orn.vaso': { pt: 'Vaso', en: 'Planter', es: 'Maceta' },
  'orn.cerca': { pt: 'Cerca', en: 'Fence panel', es: 'Cerca' },
  'orn.cronometro': { pt: 'Cronômetro', en: 'Timing booth', es: 'Cabina de cronometraje' },
  'orn.seta': { pt: 'Seta', en: 'Arrow', es: 'Flecha' },
  'orn.entrada': { pt: 'Entrada', en: 'In-gate', es: 'Entrada' },
  'orn.saida': { pt: 'Saída', en: 'Out-gate', es: 'Salida de pista' },
  'orn.entradaPlano': { pt: 'ENTRADA', en: 'IN', es: 'ENTRADA' },
  'orn.saidaPlano': { pt: 'SAÍDA', en: 'OUT', es: 'SALIDA' },

  'estr.arquibancada': { pt: 'Arquibancada', en: 'Grandstand', es: 'Tribuna' },
  'estr.concreto': { pt: 'Concreto', en: 'Concrete', es: 'Concreto' },
  'estr.edificacao': { pt: 'Edificação', en: 'Building', es: 'Edificio' },
  'estr.ilha': { pt: 'Ilha', en: 'Island', es: 'Isla' },
  'estr.rio': { pt: 'Rio', en: 'Water jump', es: 'Salto de agua' },
  'estr.lago': { pt: "Massa d'água", en: 'Pond or stream', es: 'Laguna o arroyo' },
  'estr.outra': { pt: 'Construção', en: 'Structure', es: 'Construcción' },

  'tim.partida': { pt: 'Partida', en: 'Start', es: 'Partida' },
  'tim.chegada': { pt: 'Chegada', en: 'Finish', es: 'Llegada' },

  'texto.padrao': { pt: 'Texto', en: 'Text', es: 'Texto' },

  'quadro.prova': { pt: 'Prova', en: 'Competition', es: 'Competencia' },
  'quadro.tabela': { pt: 'Tabela', en: 'Table', es: 'Tabla' },
  'quadro.artigo': { pt: 'Artigo', en: 'Article', es: 'Artículo' },
  'quadro.altura': { pt: 'Altura', en: 'Height', es: 'Altura' },
  'quadro.velocidade': { pt: 'Velocidade', en: 'Speed', es: 'Velocidad' },
  'quadro.distancia': { pt: 'Distância', en: 'Length', es: 'Longitud' },
  'quadro.tempo': { pt: 'Tempo concedido', en: 'Time allowed', es: 'Tiempo acordado' },
  'quadro.limite': { pt: 'Tempo limite', en: 'Time limit', es: 'Tiempo límite' },
  'quadro.obstaculos': { pt: 'Obstáculos', en: 'Obstacles', es: 'Obstáculos' },
  'quadro.esforcos': { pt: 'Esforços', en: 'Efforts', es: 'Esfuerzos' },
  'tabela.numero': { pt: 'Nº', en: 'No.', es: 'N.º' },
  'tabela.altura': { pt: 'Altura', en: 'Height', es: 'Altura' },
  'tabela.largura': { pt: 'Largura', en: 'Spread', es: 'Espesor' },
  'tabela.observacao': { pt: 'Observação', en: 'Notes', es: 'Observaciones' },

  'quadro.desenhador': { pt: 'Desenhador', en: 'Course designer', es: 'Diseñador de pista' },
} satisfies Record<string, Texto>;
