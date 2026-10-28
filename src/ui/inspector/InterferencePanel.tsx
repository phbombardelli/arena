import { useMemo } from 'react';
import { findInterferences } from '@core/assist/interference';
import { useDocumentStore } from '@store/documentStore';
import { useEditorStore } from '@store/editorStore';
import { t } from '@core/i18n/i18n';

/**
 * Lista de interferências.
 *
 * O marcador no desenho diz ONDE; esta lista diz O QUÊ. Clicar seleciona
 * os objetos envolvidos, que é o passo seguinte natural: quem viu o
 * problema quer mexer na peça.
 *
 * Não impede nada nem propõe conserto. O §44 proíbe validação esportiva,
 * e mesmo o que é geometria pura pode ser intencional — obstáculo de
 * decoração encostado no alambrado, por exemplo.
 */
export function InterferencePanel() {
  const doc = useDocumentStore((s) => s.doc);
  const { showInterference, toggleInterference, setSelection } = useEditorStore();
  const achados = useMemo(() => findInterferences(doc), [doc]);

  return (
    <section>
      <h3>{t('interf.titulo')}</h3>

      <label className="check">
        <input type="checkbox" checked={showInterference} onChange={toggleInterference} />
        {t('interf.marcar')}
      </label>

      {achados.length === 0 ? (
        <p className="note">{t('interf.limpo')}</p>
      ) : (
        <ul className="issue-list">
          {achados.map((achado, i) => (
            <li key={i}>
              <button onClick={() => setSelection(achado.ids)} title={t('interf.selecionar')}>
                {achado.message}
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="note dim">
        {t('interf.nota')}
      </p>
    </section>
  );
}
