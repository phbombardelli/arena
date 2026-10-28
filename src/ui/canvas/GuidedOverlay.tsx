import { buildFromChoices } from '@core/assist/guidedRide';
import { createPath, pathD } from '@core/model/path';
import type { Vec2 } from '@core/geometry/vec';
import { mmPerMeter } from '@core/scale/units';
import { useDocumentStore } from '@store/documentStore';
import { useEditorStore } from '@store/editorStore';
import { t } from '@core/i18n/i18n';

/**
 * O traçado por trechos, enquanto se escolhe.
 *
 * Três camadas, e a hierarquia é o ponto: o traçado inteiro em cinza
 * pálido dá o contexto, as opções da pernada em foco aparecem finas para
 * comparar, e a escolhida vem forte. Assim se decide olhando a linha, que
 * é como o desenhador pensa — e não lendo uma lista de números.
 *
 * Vive no overlay: é rascunho, não sai no papel, e some ao aplicar.
 */
export function GuidedOverlay({ zoom }: { zoom: number }) {
  const doc = useDocumentStore((s) => s.doc);
  const { guided, guidedLeg, chooseGuidedOption } = useEditorStore();
  if (!guided) return null;

  const k = mmPerMeter(doc.page.printScale);
  const toPaper = (p: Vec2): Vec2 => ({
    x: doc.originMm.x + p.x * k,
    y: doc.originMm.y + p.y * k,
  });
  const mm = (px: number) => px / zoom;

  const inteiro = buildFromChoices(guided);
  const perna = guided.legs[guidedLeg];

  return (
    <g data-part="guided">
      {inteiro && (
        <path
          d={pathD(inteiro, toPaper)}
          fill="none"
          stroke="#9aa0a6"
          strokeWidth={mm(1.6)}
          strokeDasharray={`${mm(7)} ${mm(5)}`}
          pointerEvents="none"
        />
      )}

      {perna?.options.map((opcao, i) => {
        const escolhida = i === perna.chosen;
        return (
          <path
            key={i}
            d={pathD(createPath(opcao.nodes), toPaper)}
            fill="none"
            stroke={escolhida ? '#B8975A' : '#7D8BA1'}
            strokeWidth={mm(escolhida ? 3 : 1.6)}
            strokeOpacity={escolhida ? 1 : 0.7}
            strokeDasharray={escolhida ? undefined : `${mm(4)} ${mm(4)}`}
            style={{ cursor: 'pointer' }}
            onPointerDown={(e) => {
              e.stopPropagation();
              chooseGuidedOption(i);
            }}
          >
            <title>
              {t('guiado.opcaoTitulo', { n: i + 1, giro: opcao.turnDeg.toFixed(0) })}
            </title>
          </path>
        );
      })}
    </g>
  );
}
