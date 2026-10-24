import { useEffect, useState } from 'react';
import { applyTemplate, arenaScopeObjects, buildTemplate, type ArenaTemplate } from '@core/library/arenaTemplate';
import { SCHEMA_VERSION } from '@core/model/types';
import { deleteCourse, listCourses, type CourseSummary } from '@platform/courseLibrary';
import {
  deleteTemplate,
  exportTemplateFile,
  getTemplate,
  importTemplateFile,
  initTemplateStore,
  listTemplates,
  loadBuiltinTemplates,
  saveTemplate,
  TemplateStoreError,
} from '@platform/templateStore';
import { useDocumentStore } from '@store/documentStore';
import { useEditorStore } from '@store/editorStore';
import { newCourse, openCourseFromLibrary, openDocument } from '@ui/actions/documentActions';

/**
 * Salvar e abrir (B-77, decisão 88). Duas coisas distintas:
 * - PISTA: só o cenário — "Do programa", "Minhas pistas" ou um arquivo .pista.
 * - PERCURSO: pista e percurso casados — "Meus percursos" ou um arquivo .pcs.
 */

type Origem = 'programa' | 'minhas' | 'arquivo';

const data = (iso: string) => new Date(iso).toLocaleDateString('pt-BR');
const fecha = () => useEditorStore.getState().setDialog(null);

/** As listas de pistas, recarregadas quando o banco local ou o do programa chegam. */
function usePistas(versao = 0) {
  const [lista, setLista] = useState(() => listTemplates());
  const recarrega = () => setLista(listTemplates());
  // Quem salva uma pista fora daqui avisa trocando a versão.
  useEffect(() => setLista(listTemplates()), [versao]);
  useEffect(() => {
    let vivo = true;
    void Promise.all([initTemplateStore(), loadBuiltinTemplates()]).then(() => {
      if (vivo) setLista(listTemplates());
    });
    return () => {
      vivo = false;
    };
  }, []);
  return { lista, recarrega };
}

/**
 * Escolher uma pista nas três origens. `acao` é o rótulo do botão de cada
 * linha ("Usar", "Aplicar").
 */
function PistaPicker({ acao, onPick, versao }: { acao: string; onPick: (t: ArenaTemplate) => void; versao?: number }) {
  const { lista, recarrega } = usePistas(versao);
  const [origem, setOrigem] = useState<Origem>('programa');
  const [guardarImportada, setGuardarImportada] = useState(true);
  const doPrograma = lista.filter((m) => m.builtin);
  const minhas = lista.filter((m) => !m.builtin);
  const mostradas = origem === 'programa' ? doPrograma : minhas;

  const importar = async () => {
    try {
      const t = await importTemplateFile();
      if (!t) return;
      if (guardarImportada) {
        await saveTemplate(t);
        recarrega();
      }
      onPick(t);
    } catch (err) {
      window.alert(err instanceof TemplateStoreError ? err.message : 'Falha ao ler o arquivo.');
    }
  };

  return (
    <div className="file-picker">
      <div className="file-tabs" role="tablist">
        {(
          [
            ['programa', `Do programa (${doPrograma.length})`],
            ['minhas', `Minhas pistas (${minhas.length})`],
            ['arquivo', 'Arquivo'],
          ] as [Origem, string][]
        ).map(([id, rotulo]) => (
          <button key={id} role="tab" aria-selected={origem === id} className={origem === id ? 'active' : ''} onClick={() => setOrigem(id)}>
            {rotulo}
          </button>
        ))}
      </div>

      {origem === 'arquivo' ? (
        <div className="file-upload">
          <button className="primary" onClick={() => void importar()}>
            Escolher arquivo .pista…
          </button>
          <label className="check">
            <input type="checkbox" checked={guardarImportada} onChange={(e) => setGuardarImportada(e.target.checked)} />
            Guardar também em Minhas pistas
          </label>
        </div>
      ) : mostradas.length === 0 ? (
        <p className="note">
          {origem === 'minhas'
            ? 'Nenhuma pista guardada ainda. Monte o cenário no modo Pista e use "Salvar pista…".'
            : 'O banco de pistas do programa não carregou (sem internet?).'}
        </p>
      ) : (
        <ul className="file-list">
          {mostradas.map((m) => (
            <li key={m.id}>
              <div className="file-name">
                <strong>{m.name}</strong>
                <em>
                  {m.widthM > 0 ? `${Math.round(m.widthM)} × ${Math.round(m.heightM)} m · ` : ''}
                  {data(m.savedAt)}
                </em>
              </div>
              <button
                className="primary"
                onClick={() => {
                  const t = getTemplate(m.id);
                  if (t) onPick(t);
                }}
              >
                {acao}
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
                  title="Apagar de Minhas pistas"
                  onClick={() => {
                    if (window.confirm(`Apagar "${m.name}" de Minhas pistas?`)) void deleteTemplate(m.id).then(recarrega);
                  }}
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Novo percurso: em branco ou sobre uma pista. */
export function NewCourseDialogBody({ kind = 'percurso' }: { kind?: 'percurso' | 'ginastica' }) {
  return (
    <section className="file-dialog">
      <button
        className="file-blank"
        onClick={() => {
          if (newCourse(null, kind) === 'ok') fecha();
        }}
      >
        <strong>Em branco</strong>
        <em>pista retangular padrão, para desenhar do zero</em>
      </button>
      <h3>Ou comece sobre uma pista</h3>
      <PistaPicker
        acao="Usar"
        onPick={(t) => {
          if (newCourse(t, kind) === 'ok') fecha();
        }}
      />
      <p className="note dim">
        A pista entra copiada {kind === 'ginastica' ? 'na ginástica' : 'no percurso'}: mudar a pista depois não altera este croqui.
      </p>
    </section>
  );
}

/** Abrir percurso: "Meus percursos" ou um arquivo .pcs. */
export function OpenCourseDialogBody() {
  const [lista, setLista] = useState<CourseSummary[] | null>(null);
  const recarrega = () => void listCourses().then(setLista, () => setLista([]));
  useEffect(recarrega, []);

  return (
    <section className="file-dialog">
      <h3>Meus percursos</h3>
      {lista === null ? (
        <p className="note">Carregando…</p>
      ) : lista.length === 0 ? (
        <p className="note">Nenhum percurso guardado ainda. "Salvar percurso" (Ctrl+S) guarda aqui.</p>
      ) : (
        <ul className="file-list">
          {lista.map((c) => (
            <li key={c.id}>
              <div className="file-name">
                <strong>
                  {c.name}
                  {c.kind === 'ginastica' && <span className="file-tag">Ginástica</span>}
                </strong>
                <em>
                  {c.arenaName ? `${c.arenaName} · ` : ''}
                  {c.obstacleCount} obstáculo{c.obstacleCount === 1 ? '' : 's'} · {data(c.savedAt)}
                </em>
              </div>
              <button
                className="primary"
                onClick={() =>
                  void openCourseFromLibrary(c.id).then((r) => {
                    if (r === 'ok') fecha();
                  })
                }
              >
                Abrir
              </button>
              <button
                className="mini"
                title="Apagar de Meus percursos"
                onClick={() => {
                  if (window.confirm(`Apagar "${c.name}" de Meus percursos?`)) void deleteCourse(c.id).then(recarrega);
                }}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="row-buttons">
        <button
          onClick={() =>
            void openDocument().then((r) => {
              if (r === 'ok') fecha();
            })
          }
        >
          Abrir arquivo .pcs…
        </button>
      </div>
    </section>
  );
}

/**
 * Pistas: salvar o cenário atual em "Minhas pistas" (ou em arquivo) e
 * trocar o cenário por outra pista, mantendo o percurso.
 */
export function PistasDialogBody() {
  const { doc, apply } = useDocumentStore();
  const [nome, setNome] = useState('');
  const [salvo, setSalvo] = useState<string | null>(null);
  const [versao, setVersao] = useState(0);

  const montar = () => {
    const escolhido = nome.trim() || doc.arenaSource?.name || doc.meta.venue || 'Pista sem nome';
    const template = buildTemplate(doc, escolhido, SCHEMA_VERSION);
    if (template.objects.length === 0) {
      window.alert('Não há nada no cenário para salvar.');
      return null;
    }
    return template;
  };

  const salvar = async () => {
    const t = montar();
    if (!t) return;
    try {
      await saveTemplate(t);
      setSalvo(t.name);
      setNome('');
      setVersao((v) => v + 1);
    } catch (err) {
      if (err instanceof TemplateStoreError && window.confirm(`${err.message}\n\nExportar agora em arquivo?`)) exportTemplateFile(t);
    }
  };

  const aplicar = (t: ArenaTemplate) => {
    if (
      arenaScopeObjects(doc).length > 0 &&
      !window.confirm(`Trocar o cenário atual por "${t.name}"?\n\nO percurso (obstáculos e traçado) é mantido.`)
    ) {
      return;
    }
    apply('Aplicar pista', (d) => applyTemplate(d, t));
    useEditorStore.getState().clearSelection();
    fecha();
  };

  return (
    <section className="file-dialog">
      <h3>Salvar a pista atual</h3>
      <p className="note">Só o cenário: contorno, construções, água, ornamentos e imagem de fundo.</p>
      <div className="file-save">
        <input
          type="text"
          className="full"
          value={nome}
          placeholder={doc.arenaSource?.name || doc.meta.venue || 'nome do local'}
          onChange={(e) => {
            setNome(e.target.value);
            setSalvo(null);
          }}
        />
        <div className="row-buttons">
          <button className="primary" onClick={() => void salvar()}>
            Salvar em Minhas pistas
          </button>
          <button
            onClick={() => {
              const t = montar();
              if (t) exportTemplateFile(t);
            }}
          >
            Exportar arquivo .pista
          </button>
        </div>
        {salvo && <p className="note ok-text">"{salvo}" guardada em Minhas pistas.</p>}
      </div>

      <h3>Abrir uma pista</h3>
      <p className="note">Troca só o cenário; o percurso aberto continua.</p>
      <PistaPicker acao="Aplicar" onPick={aplicar} versao={versao} />
    </section>
  );
}
