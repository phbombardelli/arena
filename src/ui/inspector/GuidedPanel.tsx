import { placeAssistantPath } from '@core/commands/pathOps';
import { buildFromChoices, trechosDeEscolha } from '@core/assist/guidedRide';
import { formatDistance, pathLength } from '@core/model/path';
import { useDocumentStore } from '@store/documentStore';
import { useEditorStore } from '@store/editorStore';
import { formatDecimal, t } from '@core/i18n/i18n';

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
  // Partida e chegada são sempre reta: o painel só passa pelos trechos com escolha.
  const escolhas = trechosDeEscolha(guided);
  const posicao = Math.max(0, escolhas.indexOf(guidedLeg));
  const ultima = posicao >= escolhas.length - 1;

  const aplicar = () => {
    const path = buildFromChoices(guided);
    if (path) {
      apply('Traçado por trechos', (d) => placeAssistantPath(d, path, guided.fase));
      setSelection([path.id]);
    }
    endGuided();
  };

  return (
    <section className="object-panel">
      <h3>
        {guided.fase === 'desempate' && `${t('vista.desempate')} · `}
        {t('guiado.trecho', { n: posicao + 1, total: escolhas.length })}
      </h3>
      <p className="note total-distance">
        <strong>{perna?.where}</strong>
      </p>

      {perna && perna.options.length === 1 ? (
        <p className="note">{t('guiado.umaForma')}</p>
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
                  {t('guiado.opcao', {
                    giro: o.turnDeg.toFixed(0),
                    raio: o.minRadiusM === Infinity ? t('guiado.reto') : `${formatDecimal(o.minRadiusM, 1)} m`,
                  })}
                  {o.lead.after > 0 || o.lead.before > 0 ? t('guiado.porFora') : ''}
                  {o.warnings.length > 0 ? t('guiado.aperta') : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="row-buttons">
        <button disabled={posicao === 0} onClick={() => setGuidedLeg(escolhas[posicao - 1]!)}>
          {t('guiado.anterior')}
        </button>
        <button disabled={ultima} onClick={() => setGuidedLeg(escolhas[posicao + 1]!)}>
          {t('guiado.proximo')}
        </button>
      </div>

      <p className="note">
        {t('guiado.ateAqui')} <strong>{total ? formatDistance(pathLength(total), 1) : '0'} m</strong>
      </p>

      <div className="row-buttons">
        <button onClick={aplicar}>{t('guiado.aplicar')}</button>
        <button className="danger" onClick={endGuided}>
          {t('guiado.cancelar')}
        </button>
      </div>

      <p className="note dim">
        {t('guiado.nota')}
      </p>
    </section>
  );
}
