import { hasLinked } from '@core/commands/groupOps';
import { useDocumentStore } from '@store/documentStore';
import { linkSelection, unlinkSelection } from '@ui/actions/editActions';

/**
 * Vincular e desvincular (decisão 61). Aparece com dois ou mais objetos
 * selecionados, ou com algum já vinculado.
 */
export function LinkRow({ ids }: { ids: string[] }) {
  const doc = useDocumentStore((st) => st.doc);
  const vinculado = hasLinked(doc, ids);
  if (ids.length < 2 && !vinculado) return null;
  return (
    <div className="link-row">
      {vinculado ? (
        <>
          <span className="note dim-always" title="Alt + clique pega um elemento só, para editar">
            🔗 Movem-se juntos
          </span>
          <button className="mini neutral" onClick={unlinkSelection} title="Ctrl+Shift+G">
            Desvincular
          </button>
        </>
      ) : (
        <button className="mini neutral" onClick={linkSelection} title="Ctrl+G">
          🔗 Vincular
        </button>
      )}
    </div>
  );
}
