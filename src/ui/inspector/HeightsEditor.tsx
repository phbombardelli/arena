import { addElement, removeElement, setElementHeight } from '@core/commands/obstacleOps';
import { courseOrder } from '@core/assist/courseRide';
import { formatHeights, obstacleLabel } from '@core/library/obstacles';
import type { Obstacle } from '@core/model/types';
import { useDocumentStore } from '@store/documentStore';
import { NumberField } from './NumberField';
import { t } from '@core/i18n/i18n';

/** Mais que isso não existe em pista: é o teto de t('alturas.acrescentar'). */
const MAX_ELEMENTOS = 6;

/**
 * Alturas de todos os obstáculos, numa configuração à parte (B-33).
 *
 * Saíram do painel do obstáculo: são preenchidas de uma vez, na ordem do
 * percurso, quando se monta a tabela de alturas — e não obstáculo a
 * obstáculo enquanto se desenha. Os sem número vêm no fim, porque ainda
 * não têm lugar na ordem.
 */
export function HeightsEditor() {
  const { doc, apply } = useDocumentStore();
  const obstaculos = doc.objects.filter((o): o is Obstacle => o.kind === 'obstacle');
  const naOrdem = courseOrder(obstaculos).flatMap((st) => st.elements);
  const semNumero = obstaculos.filter((o) => !naOrdem.includes(o));
  const lista = [...naOrdem, ...semNumero];

  if (lista.length === 0) {
    return <p className="note">{t('alturas.vazio')}</p>;
  }

  return (
    <div className="heights-editor">
      {lista.map((o) => {
        const travado = o.locked;
        return (
          <section key={o.id} className="heights-row">
            <h4>
              {obstacleLabel(o) || t('alturas.semNumero')}
              {formatHeights(o) !== '' && <span className="dim"> · {formatHeights(o)}</span>}
            </h4>
            {o.elements.length === 0 && <p className="note dim">{t('alturas.semAltura')}</p>}
            {o.elements.map((el, i) => (
              <div className="element-row" key={i}>
                <NumberField
                  label={t('alturas.elemento', { n: i + 1 })}
                  unit="m"
                  value={el.height ?? 0}
                  decimals={2}
                  step={0.05}
                  min={0}
                  disabled={travado}
                  onCommit={(v) =>
                    apply('Altura do elemento', (d) =>
                      setElementHeight(d, o.id, i, v > 0 ? v : null),
                    )
                  }
                />
                <button
                  className="mini"
                  title={t('alturas.remover')}
                  disabled={travado}
                  onClick={() => apply('Remover elemento', (d) => removeElement(d, o.id, i))}
                >
                  ×
                </button>
              </div>
            ))}
            <button
              className="mini add"
              title={t('alturas.acrescentar')}
              disabled={travado || o.elements.length >= MAX_ELEMENTOS}
              onClick={() => apply(t('alturas.acrescentar'), (d) => addElement(d, o.id))}
            >
              {t('alturas.maisElemento')}
            </button>
          </section>
        );
      })}
    </div>
  );
}
