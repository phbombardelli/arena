import { useState } from 'react';
import type { FolhaDesempate } from '@core/model/types';
import { useDocumentStore } from '@store/documentStore';
import { useEditorStore } from '@store/editorStore';
import { exportCurrentPdf, printCurrent } from '@ui/actions/exportActions';
import { t } from '@core/i18n/i18n';

const OPCOES: FolhaDesempate[] = ['percurso', 'duas', 'uma'];

/**
 * O que vai para a folha quando o croqui tem desempate (B-92). A escolha
 * fica no croqui: os atalhos a reaproveitam sem perguntar.
 */
export function SaidaDialogBody() {
  const { doc, apply } = useDocumentStore();
  const { saida, setDialog } = useEditorStore();
  const [folha, setFolha] = useState<FolhaDesempate>(doc.desempate?.folha ?? 'percurso');

  const confirma = () => {
    if (doc.desempate && doc.desempate.folha !== folha) {
      apply(t('saida.pergunta'), (d) => {
        if (d.desempate) d.desempate.folha = folha;
      });
    }
    setDialog(null);
    if (saida === 'pdf') void exportCurrentPdf();
    else printCurrent();
  };

  return (
    <section>
      <p>{t('saida.pergunta')}</p>
      <div className="saida-opcoes" role="radiogroup">
        {OPCOES.map((o) => (
          <label key={o}>
            <input type="radio" name="folha" checked={folha === o} onChange={() => setFolha(o)} />
            <span>{t(`saida.${o}`)}</span>
          </label>
        ))}
      </div>
      <p className="note dim">{t('saida.nota')}</p>
      <div className="row-buttons">
        <button onClick={() => setDialog(null)}>{t('saida.cancelar')}</button>
        <button className="primary" onClick={confirma}>
          {saida === 'pdf' ? t('saida.exportar') : t('saida.imprimir')}
        </button>
      </div>
    </section>
  );
}
