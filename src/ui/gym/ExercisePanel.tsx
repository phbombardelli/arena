import type { ExerciseParams } from '@core/library/exercises';
import { useDocumentStore } from '@store/documentStore';
import { useEditorStore } from '@store/editorStore';
import { LinkRow } from '@ui/inspector/LinkRow';

const NOMES = { cavaletes: 'Cavaletes', relogio: 'Relógio', 'pe-de-galinha': 'Pé de galinha' } as const;

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
  const nome = `${NOMES[tag.kind]}${tag.kind === 'pe-de-galinha' ? (completo ? ' completo' : ' simples') : ''}`;

  return (
    <section className="object-panel">
      <h3>Ginástica</h3>
      <p className="note">
        <strong>{nome}</strong> · {objs.filter((o) => o.kind === 'obstacle').length} elementos
      </p>
      <div className="row-buttons">
        <button
          className="primary"
          onClick={() => useEditorStore.getState().setExerciseEditor({ kind: tag.kind, params, editingId: id })}
        >
          Editar ginástica
        </button>
        <button
          onClick={() => {
            apply('Apagar ginástica', (d) => {
              d.objects = d.objects.filter((o) => o.exercise?.id !== id || o.locked);
            });
            useEditorStore.getState().clearSelection();
          }}
        >
          Apagar
        </button>
      </div>
      <LinkRow ids={objs.map((o) => o.id)} />
      <p className="note dim">
        Arraste ou gire o conjunto como qualquer vinculado; "Editar" redesenha no lugar em que ele estiver. Alt + clique
        pega um elemento só.
      </p>
    </section>
  );
}
