import type { ExerciseParams } from '@core/library/exercises';
import type { ExerciseKind } from '@core/model/types';
import { useDocumentStore } from '@store/documentStore';
import { useEditorStore } from '@store/editorStore';
import { LinkRow } from '@ui/inspector/LinkRow';
import { t } from '@core/i18n/i18n';
import type { MessageKey } from '@core/i18n/messages';

const NOMES: Record<ExerciseKind, MessageKey> = {
  cavaletes: 'rail.cavaletes',
  relogio: 'rail.relogio',
  'pe-de-galinha': 'rail.peDeGalinha',
  leque: 'rail.leque',
};

/**
 * Exercício de ginástica selecionado (B-37): reabrir o configurador com os
 * valores de agora, ou apagar o conjunto. Mover e girar é como qualquer
 * vinculado — o "Editar" redesenha onde ele estiver.
 */
export function ExercisePanel({ id }: { id: string }) {
  const { doc, apply } = useDocumentStore();
  const objs = doc.objects.filter((o) => o.exercise?.id === id);
  const tag = objs[0]?.exercise;
  if (!tag) return null;
  const params = tag.params as ExerciseParams;
  const completo = tag.kind === 'pe-de-galinha' && (params as { completo?: boolean }).completo;
  const nome = `${t(NOMES[tag.kind])}${tag.kind === 'pe-de-galinha' ? t(completo ? 'ginp.completo' : 'ginp.simples') : ''}`;

  return (
    <section className="object-panel">
      <h3>{t('ginp.titulo')}</h3>
      <p className="note">
        <strong>{nome}</strong> · {t('ginp.nElementos', { n: objs.filter((o) => o.kind === 'obstacle').length })}
      </p>
      <div className="row-buttons">
        <button
          className="primary"
          onClick={() => useEditorStore.getState().setExerciseEditor({ kind: tag.kind, params, editingId: id })}
        >
          {t('ginp.editar')}
        </button>
        <button
          onClick={() => {
            apply('Apagar ginástica', (d) => {
              d.objects = d.objects.filter((o) => o.exercise?.id !== id || o.locked);
            });
            useEditorStore.getState().clearSelection();
          }}
        >
          {t('ginp.apagar')}
        </button>
      </div>
      <LinkRow ids={objs.map((o) => o.id)} />
      <p className="note dim">
        {t('ginp.nota')}
      </p>
    </section>
  );
}
