import { useMemo } from 'react';
import { findInterferences } from '@core/assist/interference';
import { visibleGridStep } from '@core/geometry/snap';
import { formatMeters } from '@core/scale/units';
import { metersPerPixel } from '@core/scale/viewport';
import { useDocumentStore } from '@store/documentStore';
import { useEditorStore } from '@store/editorStore';
import { Popover } from '@ui/common/Popover';
import { GridSettings } from '@ui/inspector/SheetSettings';
import { InterferencePanel } from '@ui/inspector/InterferencePanel';

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
  const achados = useMemo(() => (mode === 'percurso' ? findInterferences(doc) : []), [doc, mode]);

  return (
    <footer className="statusbar">
      <span className="mono coords">
        {cursorM
          ? `X ${formatMeters(cursorM.x)} m · Y ${formatMeters(cursorM.y)} m`
          : 'X — · Y —'}
      </span>
      <span className="spacer" />

      <Popover
        className="chip"
        placement="up"
        align="right"
        title="Grade: só na tela, não sai na folha"
        trigger={
          <span className={doc.grid.visible ? '' : 'off'}>
            Grade {doc.grid.visible ? `${formatMeters(step, step < 1 ? 2 : 0)} m` : 'oculta'}
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
          title="Obstáculos atravessados ou sobrepostos"
          trigger={
            <span>
              {achados.length === 0
                ? 'Sem interferências'
                : `${achados.length} ${achados.length === 1 ? 'interferência' : 'interferências'}`}
            </span>
          }
        >
          <InterferencePanel />
        </Popover>
      )}

      <button className="chip-button" onClick={() => setDialog('atalhos')} title="Atalhos do teclado (?)">
        ? Atalhos
      </button>
    </footer>
  );
}
