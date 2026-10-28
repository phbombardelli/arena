import { useMemo } from 'react';
import { findInterferences } from '@core/assist/interference';
import { visibleGridStep } from '@core/geometry/snap';
import { formatMeters } from '@core/scale/units';
import { metersPerPixel } from '@core/scale/viewport';
import { useDocumentStore } from '@store/documentStore';
import { useEditorStore } from '@store/editorStore';
import { Popover } from '@ui/common/Popover';
import { GridSettings } from '@ui/inspector/SheetSettings';
import { measureFrame } from '@core/model/measureFrame';
import { InterferencePanel } from '@ui/inspector/InterferencePanel';
import { t } from '@core/i18n/i18n';

/**
 * Barra de baixo: onde o cursor está e o estado das ajudas de desenho.
 *
 * Grade e avisos são botões: mostram o estado de relance e abrem os
 * ajustes num clique. A escala e a folha saíram daqui — estão no botão
 * Folha, em cima —, e a lista de atalhos virou janela própria.
 */
export function StatusBar() {
  const doc = useDocumentStore((s) => s.doc);
  const { cursorM, viewport, mode, setDialog } = useEditorStore();

  const mpp = metersPerPixel(viewport, doc.page.printScale);
  const step = doc.grid.stepM > 0 ? doc.grid.stepM : visibleGridStep(mpp, 8);
  const medida = useMemo(() => measureFrame(doc), [doc]);
  const achados = useMemo(() => (mode === 'percurso' ? findInterferences(doc) : []), [doc, mode]);

  return (
    <footer className="statusbar">
      <span className="mono coords">
        {cursorM
          ? `X ${formatMeters(cursorM.x - medida.originM.x)} m · Y ${formatMeters(cursorM.y - medida.originM.y)} m`
          : 'X — · Y —'}
      </span>
      <span className="spacer" />

      <Popover
        className="chip"
        placement="up"
        align="right"
        title={t('barra.gradeDica')}
        trigger={
          <span className={doc.grid.visible ? '' : 'off'}>
            {doc.grid.visible ? t('barra.grade', { m: formatMeters(step, step < 1 ? 2 : 0) }) : t('barra.gradeOculta')}
          </span>
        }
      >
        <GridSettings />
      </Popover>


      {mode === 'percurso' && (
        <Popover
          className={achados.length === 0 ? 'chip ok' : 'chip warn'}
          placement="up"
          align="right"
          title={t('barra.interfDica')}
          trigger={
            <span>
              {achados.length === 0
                ? t('barra.semInterf')
                : t(achados.length === 1 ? 'barra.umaInterferencia' : 'barra.nInterferencias', { n: achados.length })}
            </span>
          }
        >
          <InterferencePanel />
        </Popover>
      )}

      <button className="chip-button" onClick={() => setDialog('atalhos')} title={t('barra.atalhosDica')}>
        ? {t('barra.atalhos')}
      </button>
    </footer>
  );
}
