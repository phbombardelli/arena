import { addObject, deleteObjects } from '@core/commands/ops';
import { courseOrder } from '@core/assist/courseRide';
import { placeTimingLine, TIMING_DISTANCE } from '@core/library/timing';
import type { Obstacle } from '@core/model/types';
import { useDocumentStore } from '@store/documentStore';
import { useEditorStore } from '@store/editorStore';
import { t } from '@core/i18n/i18n';

/**
 * Coloca a partida ou a chegada em relação ao percurso.
 *
 * Não se escolhe onde: escolhe-se a QUANTOS METROS do primeiro (ou do
 * último) obstáculo. O resto é consequência — a cruzada fica no eixo do
 * salto, paralela à face, com os centros coincidindo.
 *
 * Antes disso a cruzada era largada com um clique em qualquer lugar, e o
 * assistente tinha de inventar uma volta entre ela e o primeiro salto.
 * Inventava, e o croqui saía com uma laçada onde só pode haver reta.
 */
export function insertTimingLine(role: 'start' | 'finish'): void {
  const { doc, apply } = useDocumentStore.getState();
  const distancia = useEditorStore.getState().timingDistanceM;

  const stops = courseOrder(
    doc.objects.filter((o): o is Obstacle => o.kind === 'obstacle'),
  );
  if (stops.length === 0) {
    window.alert(
      t('aviso.numereUm'),
    );
    return;
  }

  const degrau = role === 'start' ? stops[0]! : stops[stops.length - 1]!;
  const referencia =
    role === 'start' ? degrau.elements[0]! : degrau.elements[degrau.elements.length - 1]!;

  const linha = placeTimingLine(role, referencia, distancia);
  const antiga = doc.objects.find((o) => o.kind === 'timing' && o.role === role);

  apply(role === 'start' ? 'Colocar partida' : 'Colocar chegada', (d) => {
    // Uma de cada: recolocar substitui, em vez de empilhar cruzadas.
    if (antiga) deleteObjects(d, [antiga.id]);
    addObject(d, linha);
  });
  useEditorStore.getState().setSelection([linha.id]);
}

export const TIMING_LIMITS = TIMING_DISTANCE;
