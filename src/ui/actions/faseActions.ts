import type { Fase } from '@core/assist/courseRide';
import type { CourseDocument } from '@core/model/types';
import { useDocumentStore } from '@store/documentStore';
import { useEditorStore } from '@store/editorStore';

/**
 * Em que fase se está trabalhando (decisão 109).
 *
 * A vista da barra de baixo é o modo de trabalho: na vista Desempate, o
 * painel da prova, o assistente de traçado e a partida e a chegada são os
 * do desempate. Nas outras (Percurso e Ambos), são os do percurso.
 */
export function faseDe(vista: string, mode: string, doc: CourseDocument): Fase {
  return vista === 'desempate' && mode === 'percurso' && doc.kind !== 'ginastica' ? 'desempate' : 'percurso';
}

export function faseAtual(): Fase {
  const { vista, mode } = useEditorStore.getState();
  return faseDe(vista, mode, useDocumentStore.getState().doc);
}

export function useFaseAtual(): Fase {
  const vista = useEditorStore((s) => s.vista);
  const mode = useEditorStore((s) => s.mode);
  const doc = useDocumentStore((s) => s.doc);
  return faseDe(vista, mode, doc);
}
