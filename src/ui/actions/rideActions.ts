import { placeAssistantPath } from '@core/commands/pathOps';
import { buildCourseRide } from '@core/assist/courseRide';
import { DEFAULT_RIDE, type RideParams } from '@core/assist/ridePath';
import type { CurveWarning } from '@core/assist/legCurve';
import { formatDistance, pathLength } from '@core/model/path';
import { useDocumentStore } from '@store/documentStore';
import { useEditorStore } from '@store/editorStore';
import { t } from '@core/i18n/i18n';
import type { MessageKey } from '@core/i18n/messages';

const MOTIVO: Record<CurveWarning, MessageKey> = {
  'fora-da-pista': 'ride.foraDaPista',
  'passa-por-obstaculo': 'ride.passaPorObstaculo',
  'curva-fechada': 'ride.curvaFechada',
  'giro-excessivo': 'ride.giroExcessivo',
};

/**
 * Traça o percurso inteiro pela numeração já lançada.
 *
 * O resultado é um traçado comum, editável nó a nó — o assistente é ponto
 * de partida, não caixa-preta. Quando alguma volta não fecha, ela é
 * desenhada assim mesmo e o problema é dito: o desenhador precisa ver
 * ONDE está o aperto para decidir o que mudar na pista.
 */
export function traceCourse(params: RideParams = DEFAULT_RIDE): void {
  const { doc, apply } = useDocumentStore.getState();
  const resultado = buildCourseRide(doc, params);

  if (!resultado) {
    window.alert(
      t('ride.nadaTracar'),
    );
    return;
  }

  apply('Assistente de traçado', (d) => placeAssistantPath(d, resultado.path));
  useEditorStore.getState().setSelection([resultado.path.id]);

  // Curva para trás é decisão visível: o desenhador tem que saber que ali
  // a linha sai e volta de propósito, e não por defeito do assistente.
  const porFora = resultado.legs.filter((l) => l.lead.after > 0 || l.lead.before > 0);
  if (porFora.length > 0 && resultado.problems.length === 0) {
    const lista = porFora.map((l) => `  ${l.where}`).join('\n');
    window.alert(
      [
        t('ride.desenhado', { ordem: resultado.stops.join(' - ') }),
        `${formatDistance(pathLength(resultado.path))} m`,
        '',
        t('ride.porFora'),
        lista,
      ].join('\n'),
    );
    return;
  }

  if (resultado.problems.length > 0) {
    const lista = resultado.problems
      .map((p) => `  ${p.where}: ${t(MOTIVO[p.warning])}`)
      .join('\n');
    window.alert(
      `${t('ride.desenhado', { ordem: resultado.stops.join(' - ') })}\n` +
        `${formatDistance(pathLength(resultado.path))} m\n\n` +
        `${t('ride.naoFecham')}\n${lista}\n\n` +
        t('ride.assimMesmo'),
    );
  }
}
