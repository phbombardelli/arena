import { IconFlipHorizontal, IconFlipVertical } from '@tabler/icons-react';
import { podeEspelhar } from '@core/model/transform';
import { useDocumentStore } from '@store/documentStore';
import { mirrorSelection } from '@ui/actions/editActions';
import { t } from '@core/i18n/i18n';

/**
 * Espelhar a seleção (B-96): vale para um obstáculo, uma combinação ou o
 * percurso inteiro, sempre em torno do centro do que está selecionado.
 */
export function MirrorRow({ ids }: { ids: string[] }) {
  const doc = useDocumentStore((st) => st.doc);
  const pode = doc.objects.some((o) => ids.includes(o.id) && !o.locked && podeEspelhar(o));
  if (!pode) return null;
  return (
    <div className="link-row" title={t('editar.espelharDica')}>
      <span className="note dim-always">{t('editar.espelhar')}</span>
      <button
        className="mini neutral"
        onClick={() => mirrorSelection('horizontal')}
        title={`${t('editar.espelharH')} (Shift+H)`}
        aria-label={t('editar.espelharH')}
      >
        <IconFlipVertical size={16} stroke={1.8} />
      </button>
      <button
        className="mini neutral"
        onClick={() => mirrorSelection('vertical')}
        title={`${t('editar.espelharV')} (Shift+V)`}
        aria-label={t('editar.espelharV')}
      >
        <IconFlipHorizontal size={16} stroke={1.8} />
      </button>
    </div>
  );
}
