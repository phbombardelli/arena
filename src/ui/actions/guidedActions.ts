import { prepareGuidedRide } from '@core/assist/guidedRide';
import { DEFAULT_RIDE } from '@core/assist/ridePath';
import { useDocumentStore } from '@store/documentStore';
import { useEditorStore } from '@store/editorStore';
import { t } from '@core/i18n/i18n';

/**
 * Começa o traçado por trechos.
 *
 * Convive com o assistente automático em vez de substituí-lo: quem quer a
 * linha pronta clica no outro botão e pronto; quem quer escolher, escolhe.
 * A calibração mostrou que a escolha automática erra 40% na distância de
 * uma prova real, então a escolhida à mão é a que dá para assinar.
 */
export function startGuidedRide(): void {
  const guiado = prepareGuidedRide(useDocumentStore.getState().doc, DEFAULT_RIDE);
  if (!guiado) {
    window.alert(
      t('aviso.nadaTracarGuiado'),
    );
    return;
  }
  useEditorStore.getState().startGuided(guiado);
}
