import type { Texto } from '../messages';

/** Barra de cima: menus, modo de trabalho, folha, zoom e língua. */
export const TOOLBAR = {
  // Seletor de língua
  'lingua.titulo': { pt: 'Língua', en: 'Language', es: 'Idioma' },

  // Barra de cima: menus
  'menu.arquivo': { pt: 'Arquivo', en: 'File', es: 'Archivo' },
  'menu.editar': { pt: 'Editar', en: 'Edit', es: 'Editar' },
  'menu.inserir': { pt: 'Inserir', en: 'Insert', es: 'Insertar' },
  'menu.exibir': { pt: 'Exibir', en: 'View', es: 'Ver' },
  'menu.ajuda': { pt: 'Ajuda', en: 'Help', es: 'Ayuda' },

  // Arquivo
  'arquivo.novoPercurso': { pt: 'Novo percurso…', en: 'New course…', es: 'Nuevo recorrido…' },
  'arquivo.novaGinastica': { pt: 'Nova ginástica…', en: 'New gridworks…', es: 'Nueva gimnasia…' },
  'arquivo.abrirPercurso': { pt: 'Abrir percurso…', en: 'Open course…', es: 'Abrir recorrido…' },
  'arquivo.salvarPercurso': { pt: 'Salvar percurso', en: 'Save course', es: 'Guardar recorrido' },
  'arquivo.salvarComoArquivo': {
    pt: 'Salvar percurso como arquivo…',
    en: 'Save course as file…',
    es: 'Guardar recorrido como archivo…',
  },
  'arquivo.abrirPista': { pt: 'Abrir pista…', en: 'Open arena…', es: 'Abrir pista…' },
  'arquivo.salvarPista': { pt: 'Salvar pista…', en: 'Save arena…', es: 'Guardar pista…' },
  'arquivo.pistaPeloMapa': { pt: 'Pista pelo mapa…', en: 'Arena from map…', es: 'Pista desde el mapa…' },
  'arquivo.exportarPdf': { pt: 'Exportar PDF…', en: 'Export PDF…', es: 'Exportar PDF…' },
  'arquivo.exportando': { pt: 'Exportando…', en: 'Exporting…', es: 'Exportando…' },
  'arquivo.imprimir': { pt: 'Imprimir…', en: 'Print…', es: 'Imprimir…' },
  'arquivo.configurarFolha': { pt: 'Configurar folha…', en: 'Sheet settings…', es: 'Configurar hoja…' },
  'arquivo.instalarApp': { pt: 'Instalar como app…', en: 'Install as app…', es: 'Instalar como app…' },
  'arquivo.falhaPdf': {
    pt: 'Não foi possível gerar o PDF. Detalhes no console.',
    en: 'Could not create the PDF. Details in the console.',
    es: 'No se pudo generar el PDF. Detalles en la consola.',
  },
  'arquivo.semTitulo': { pt: 'Sem título', en: 'Untitled', es: 'Sin título' },

  // Editar
  'editar.desfazer': { pt: 'Desfazer', en: 'Undo', es: 'Deshacer' },
  'editar.refazer': { pt: 'Refazer', en: 'Redo', es: 'Rehacer' },
  'editar.copiar': { pt: 'Copiar', en: 'Copy', es: 'Copiar' },
  'editar.colar': { pt: 'Colar', en: 'Paste', es: 'Pegar' },
  'editar.duplicar': { pt: 'Duplicar', en: 'Duplicate', es: 'Duplicar' },
  'editar.excluir': { pt: 'Excluir', en: 'Delete', es: 'Eliminar' },
  'editar.selecionarTudo': { pt: 'Selecionar tudo', en: 'Select all', es: 'Seleccionar todo' },
  'editar.trazerFrente': { pt: 'Trazer para frente', en: 'Bring forward', es: 'Traer adelante' },
  'editar.enviarTras': { pt: 'Enviar para trás', en: 'Send backward', es: 'Enviar atrás' },
  'editar.vincular': { pt: 'Vincular', en: 'Link', es: 'Vincular' },
  'editar.desvincular': { pt: 'Desvincular', en: 'Unlink', es: 'Desvincular' },

  // Inserir
  'inserir.obstaculo': { pt: 'Obstáculo', en: 'Obstacle', es: 'Obstáculo' },
  'inserir.texto': { pt: 'Texto', en: 'Text', es: 'Texto' },
  'inserir.trena': { pt: 'Trena', en: 'Measure', es: 'Cinta métrica' },
  'inserir.partida': { pt: 'Partida', en: 'Start', es: 'Partida' },
  'inserir.chegada': { pt: 'Chegada', en: 'Finish', es: 'Llegada' },
  'inserir.quadroTecnico': { pt: 'Quadro técnico', en: 'Course information box', es: 'Cuadro técnico' },
  'inserir.tabelaAlturas': { pt: 'Tabela de alturas', en: 'Heights table', es: 'Tabla de alturas' },
  'inserir.logo': { pt: 'Logo ou imagem…', en: 'Logo or image…', es: 'Logo o imagen…' },
  'inserir.escala': { pt: 'Escala', en: 'Scale', es: 'Escala' },
  'inserir.mostrarEscala': { pt: 'Mostrar escala', en: 'Show scale', es: 'Mostrar escala' },
  'inserir.ocultarEscala': { pt: 'Ocultar escala', en: 'Hide scale', es: 'Ocultar escala' },
  'inserir.imagemFundo': { pt: 'Imagem de fundo…', en: 'Background image…', es: 'Imagen de fondo…' },

  // Exibir
  'exibir.grade': { pt: 'Grade', en: 'Grid', es: 'Cuadrícula' },
  'exibir.imagemFundo': { pt: 'Imagem de fundo', en: 'Background image', es: 'Imagen de fondo' },
  'exibir.limitesFolha': { pt: 'Limites da folha', en: 'Page bounds', es: 'Límites de la hoja' },
  'exibir.avisosInterferencia': { pt: 'Avisos de interferência', en: 'Conflict warnings', es: 'Avisos de interferencia' },
  'exibir.ajustarPagina': { pt: 'Ajustar à página', en: 'Fit to page', es: 'Ajustar a la página' },
  'exibir.tamanhoReal': { pt: 'Tamanho real', en: 'Actual size', es: 'Tamaño real' },
  'exibir.aproximar': { pt: 'Aproximar', en: 'Zoom in', es: 'Acercar' },
  'exibir.afastar': { pt: 'Afastar', en: 'Zoom out', es: 'Alejar' },

  // Ajuda
  'ajuda.atalhos': { pt: 'Atalhos do teclado', en: 'Keyboard shortcuts', es: 'Atajos de teclado' },
  'ajuda.sobre': { pt: 'Sobre o Arena', en: 'About Arena', es: 'Acerca de Arena' },

  // Modo de trabalho
  'modo.grupo': { pt: 'Modo de trabalho', en: 'Work mode', es: 'Modo de trabajo' },
  'modo.pista': { pt: 'Pista', en: 'Arena', es: 'Pista' },
  'modo.percurso': { pt: 'Percurso', en: 'Course', es: 'Recorrido' },
  'modo.ginastica': { pt: 'Ginástica', en: 'Gridworks', es: 'Gimnasia' },
  'modo.pistaDica': {
    pt: 'Configurar o local: contorno, imagem de referência, árvores',
    en: 'Set up the venue: outline, reference image, trees',
    es: 'Configurar el lugar: contorno, imagen de referencia, árboles',
  },
  'modo.percursoDica': {
    pt: 'Desenhar a prova: obstáculos, traçados, partida e chegada',
    en: 'Design the competition: obstacles, track, start and finish',
    es: 'Diseñar la competencia: obstáculos, trazado, partida y llegada',
  },
  'modo.ginasticaDica': {
    pt: 'Montar ginásticas: cavaletes, pé de galinha, relógio, leque (arquivo à parte do percurso)',
    en: 'Build gridworks: cavalettis, Y shape, star, fan (a file separate from the course)',
    es: 'Armar gimnasias: cavalettis, pata de gallina, reloj, abanico (archivo aparte del recorrido)',
  },

  // Folha e zoom
  'folha.botao': { pt: 'Folha {formato} · 1:{escala}', en: 'Sheet {formato} · 1:{escala}', es: 'Hoja {formato} · 1:{escala}' },
  'folha.dicaPaisagem': {
    pt: 'Folha {formato} paisagem, escala 1:{escala}',
    en: 'Sheet {formato} landscape, scale 1:{escala}',
    es: 'Hoja {formato} horizontal, escala 1:{escala}',
  },
  'folha.dicaRetrato': {
    pt: 'Folha {formato} retrato, escala 1:{escala}',
    en: 'Sheet {formato} portrait, scale 1:{escala}',
    es: 'Hoja {formato} vertical, escala 1:{escala}',
  },
  'zoom.titulo': { pt: 'Zoom', en: 'Zoom', es: 'Zoom' },
} satisfies Record<string, Texto>;
