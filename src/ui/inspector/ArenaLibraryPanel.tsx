import { useEffect, useState } from 'react';
import { applyTemplate, arenaScopeObjects, buildTemplate } from '@core/library/arenaTemplate';
import { SCHEMA_VERSION } from '@core/model/types';
import {
  deleteTemplate,
  exportTemplateFile,
  getTemplate,
  importTemplateFile,
  listTemplates,
  loadBuiltinTemplates,
  saveTemplate,
  TemplateStoreError,
} from '@platform/templateStore';
import { useDocumentStore } from '@store/documentStore';
import { useEditorStore } from '@store/editorStore';

/**
 * Repositório de pistas: guarda o cenário de um local para reusar em
 * outras provas, sem redesenhar contorno, imagem e árvores toda vez.
 */
export function ArenaLibraryPanel() {
  const { doc, apply } = useDocumentStore();
  const { clearSelection } = useEditorStore();
  const [modelos, setModelos] = useState(() => listTemplates());
  const [nome, setNome] = useState('');

  const recarregar = () => setModelos(listTemplates());

  // O banco de pistas do programa chega pela rede, uma vez.
  useEffect(() => {
    let vivo = true;
    void loadBuiltinTemplates().then(() => {
      if (vivo) setModelos(listTemplates());
    });
    return () => {
      vivo = false;
    };
  }, []);

  const guardar = () => {
    const escolhido = nome.trim() || doc.meta.venue || 'Pista sem nome';
    const template = buildTemplate(doc, escolhido, SCHEMA_VERSION);
    if (template.objects.length === 0) {
      window.alert('Não há nada no cenário para guardar.');
      return;
    }
    try {
      saveTemplate(template);
      setNome('');
      recarregar();
    } catch (err) {
      if (err instanceof TemplateStoreError) {
        // Oferece a saída em arquivo em vez de só reclamar da cota.
        if (window.confirm(`${err.message}\n\nExportar agora em arquivo?`)) {
          exportTemplateFile(template);
        }
        return;
      }
      throw err;
    }
  };

  const aplicar = (id: string, rotulo: string) => {
    const template = getTemplate(id);
    if (!template) return;
    if (
      arenaScopeObjects(doc).length > 0 &&
      !window.confirm(`Substituir o cenário atual por "${rotulo}"?\n\nO percurso é preservado.`)
    ) {
      return;
    }
    apply('Aplicar pista', (d) => applyTemplate(d, template));
    clearSelection();
  };

  const importar = async () => {
    try {
      const template = await importTemplateFile();
      if (!template) return;
      saveTemplate(template);
      recarregar();
    } catch (err) {
      window.alert(err instanceof TemplateStoreError ? err.message : 'Falha ao importar.');
    }
  };

  return (
    <section>
      <h3>Guardar o cenário atual</h3>

      <div className="template-save">
        <input
          type="text"
          className="full"
          value={nome}
          placeholder={doc.meta.venue || 'nome do local'}
          onChange={(e) => setNome(e.target.value)}
        />
        <div className="row-buttons">
          <button onClick={guardar} title="Guarda o cenário atual para reusar em outras provas">
            Guardar esta pista
          </button>
        </div>
      </div>

      {modelos.length === 0 ? (
        <p className="note dim">Nenhuma pista guardada ainda.</p>
      ) : (
        <ul className="template-list">
          {modelos.map((m) => (
            <li key={m.id}>
              <button
                className="template-name"
                title={`${m.objectCount} objetos · ${m.sizeKB} kB · guardada em ${new Date(m.savedAt).toLocaleDateString('pt-BR')}`}
                onClick={() => aplicar(m.id, m.name)}
              >
                {m.name}
                {m.builtin && <em> · do programa</em>}
                {m.widthM > 0 && (
                  <em>
                    {' '}
                    {Math.round(m.widthM)}×{Math.round(m.heightM)} m
                  </em>
                )}
              </button>
              <button
                className="mini"
                title="Exportar em arquivo .pista"
                onClick={() => {
                  const t = getTemplate(m.id);
                  if (t) exportTemplateFile(t);
                }}
              >
                ↓
              </button>
              {!m.builtin && (
              <button
                className="mini"
                title="Remover do repositório"
                onClick={() => {
                  if (window.confirm(`Remover "${m.name}" do repositório?`)) {
                    deleteTemplate(m.id);
                    recarregar();
                  }
                }}
              >
                ×
              </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="row-buttons">
        <button onClick={() => void importar()} title="Ler um arquivo .pista">
          Importar arquivo
        </button>
      </div>
      <p className="note dim">
        As pistas "do programa" vêm com o Percurso, para todos. As suas ficam
        neste navegador; para levar a outro computador, exporte em arquivo.
      </p>
    </section>
  );
}
