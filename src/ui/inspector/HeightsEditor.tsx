import { addElement, removeElement, setElementHeight } from '@core/commands/obstacleOps';
import { courseOrder } from '@core/assist/courseRide';
import { formatHeights, obstacleLabel } from '@core/library/obstacles';
import type { Obstacle } from '@core/model/types';
import { useDocumentStore } from '@store/documentStore';
import { NumberField } from './NumberField';

/** Mais que isso não existe em pista: é o teto de "Acrescentar elemento". */
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
    return <p className="note">Ainda não há obstáculos no croqui.</p>;
  }

  return (
    <div className="heights-editor">
      {lista.map((o) => {
        const travado = o.locked;
        return (
          <section key={o.id} className="heights-row">
            <h4>
              {obstacleLabel(o) || 'sem número'}
              {formatHeights(o) !== '' && <span className="dim"> · {formatHeights(o)}</span>}
            </h4>
            {o.elements.length === 0 && <p className="note dim">Sem altura.</p>}
            {o.elements.map((el, i) => (
              <div className="element-row" key={i}>
                <NumberField
                  label={`Elemento ${i + 1}`}
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
                  title="Remover este elemento"
                  disabled={travado}
                  onClick={() => apply('Remover elemento', (d) => removeElement(d, o.id, i))}
                >
                  ×
                </button>
              </div>
            ))}
            <button
              className="mini add"
              title="Acrescentar elemento"
              disabled={travado || o.elements.length >= MAX_ELEMENTOS}
              onClick={() => apply('Acrescentar elemento', (d) => addElement(d, o.id))}
            >
              + elemento
            </button>
          </section>
        );
      })}
    </div>
  );
}
