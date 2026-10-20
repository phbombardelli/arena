import { placeAssistantPath } from '@core/commands/pathOps';
import { buildFromChoices } from '@core/assist/guidedRide';
import { formatDistance, pathLength } from '@core/model/path';
import { useDocumentStore } from '@store/documentStore';
import { useEditorStore } from '@store/editorStore';

/**
 * Escolha do traçado, pernada a pernada.
 *
 * Cada opção mostra o giro, o raio mais fechado e o comprimento — os três
 * números que dizem se a volta se galopa. Mas a decisão se toma olhando a
 * LINHA no desenho, e é por isso que clicar aqui e clicar na linha fazem
 * a mesma coisa.
 */
export function GuidedPanel() {
  const { apply } = useDocumentStore();
  const { guided, guidedLeg, setGuidedLeg, chooseGuidedOption, endGuided, setSelection } =
    useEditorStore();
  if (!guided) return null;

  const perna = guided.legs[guidedLeg];
  const total = buildFromChoices(guided);
  const ultima = guidedLeg >= guided.legs.length - 1;

  const aplicar = () => {
    const path = buildFromChoices(guided);
    if (path) {
      apply('Traçado por trechos', (d) => placeAssistantPath(d, path));
      setSelection([path.id]);
    }
    endGuided();
  };

  return (
    <section className="object-panel">
      <h3>
        Trecho {guidedLeg + 1} de {guided.legs.length}
      </h3>
      <p className="note total-distance">
        <strong>{perna?.where}</strong>
      </p>

      {perna && perna.options.length === 1 ? (
        <p className="note">Só há uma forma de fazer esta pernada.</p>
      ) : (
        <ul className="option-list">
          {perna?.options.map((o, i) => (
            <li key={i}>
              <button
                className={i === perna.chosen ? 'active' : ''}
                onClick={() => chooseGuidedOption(i)}
              >
                <span className="option-mark">{i === perna.chosen ? '●' : '○'}</span>
                <span>
                  giro {o.turnDeg.toFixed(0)}° · raio{' '}
                  {o.minRadiusM === Infinity ? 'reto' : `${o.minRadiusM.toFixed(1)} m`}
                  {o.lead.after > 0 || o.lead.before > 0 ? ' · por fora' : ''}
                  {o.warnings.length > 0 ? ' · aperta' : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="row-buttons">
        <button disabled={guidedLeg === 0} onClick={() => setGuidedLeg(guidedLeg - 1)}>
          ← Anterior
        </button>
        <button disabled={ultima} onClick={() => setGuidedLeg(guidedLeg + 1)}>
          Próximo →
        </button>
      </div>

      <p className="note">
        Traçado até aqui: <strong>{total ? formatDistance(pathLength(total), 1) : '0'} m</strong>
      </p>

      <div className="row-buttons">
        <button onClick={aplicar}>Aplicar traçado</button>
        <button className="danger" onClick={endGuided}>
          Cancelar
        </button>
      </div>

      <p className="note dim">
        Clicar na linha do desenho escolhe também. A opção forte é a
        escolhida; as finas são as outras formas de fazer.
      </p>
    </section>
  );
}
