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
import { formatDate, t } from '@core/i18n/i18n';
import { newCourse, newKindOnSameArena, openCourseFromLibrary, openDocument, type DocKind } from '@ui/actions/documentActions';

/**
 * Salvar e abrir (B-77, decisão 88). Duas coisas distintas:
 * - PISTA: só o cenário — "Do programa", "Minhas pistas" ou um arquivo .pista.
 * - PERCURSO: pista e percurso casados — "Meus percursos" ou um arquivo .pcs.
 */

type Origem = 'programa' | 'minhas' | 'arquivo';

const data = (iso: string) => formatDate(new Date(iso));
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
function PistaPicker({ acao, onPick, versao }: { acao: string; onPick: (tpl: ArenaTemplate) => void; versao?: number }) {
  const { lista, recarrega } = usePistas(versao);
  const [origem, setOrigem] = useState<Origem>('programa');
  const [guardarImportada, setGuardarImportada] = useState(true);
  const doPrograma = lista.filter((m) => m.builtin);
  const minhas = lista.filter((m) => !m.builtin);
  const mostradas = origem === 'programa' ? doPrograma : minhas;

  const importar = async () => {
    try {
      const tpl = await importTemplateFile();
      if (!tpl) return;
      if (guardarImportada) {
        await saveTemplate(tpl);
        recarrega();
      }
      onPick(tpl);
    } catch (err) {
      window.alert(err instanceof TemplateStoreError ? err.message : t('arq.falhaLer'));
    }
  };

  return (
    <div className="file-picker">
      <div className="file-tabs" role="tablist">
        {(
          [
            ['programa', t('arq.doPrograma', { n: doPrograma.length })],
            ['minhas', t('arq.minhasN', { n: minhas.length })],
            ['arquivo', t('arq.arquivo')],
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
            {t('arq.escolherPista')}
          </button>
          <label className="check">
            <input type="checkbox" checked={guardarImportada} onChange={(e) => setGuardarImportada(e.target.checked)} />
            {t('arq.guardarTambem')}
          </label>
        </div>
      ) : mostradas.length === 0 ? (
        <p className="note">
          {origem === 'minhas'
            ? t('arq.nenhumaPista')
            : t('arq.bancoFalhou')}
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
                  const tpl = getTemplate(m.id);
                  if (tpl) onPick(tpl);
                }}
              >
                {acao}
              </button>
              <button
                className="mini"
                title={t('arq.exportarPista')}
                onClick={() => {
                  const tpl = getTemplate(m.id);
                  if (tpl) exportTemplateFile(tpl);
                }}
              >
                ↓
              </button>
              {!m.builtin && (
                <button
                  className="mini"
                  title={t('arq.apagarPista')}
                  onClick={() => {
                    if (window.confirm(t('arq.confirmaApagarPista', { nome: m.name }))) void deleteTemplate(m.id).then(recarrega);
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
        <strong>{t('arq.emBranco')}</strong>
        <em>{t('arq.emBrancoDica')}</em>
      </button>
      <h3>{t('arq.ouComece')}</h3>
      <PistaPicker
        acao={t('arq.usar')}
        onPick={(tpl) => {
          if (newCourse(tpl, kind) === 'ok') fecha();
        }}
      />
      <p className="note dim">
        {t(kind === 'ginastica' ? 'arq.copiadaGin' : 'arq.copiadaPerc')}
      </p>
    </section>
  );
}

/**
 * A aba do outro tipo foi clicada com um croqui já desenhado (B-86, opção
 * b): percurso e ginástica são arquivos separados, então aqui se escolhe
 * de onde vem o novo.
 */
export function OtherKindDialogBody({ kind }: { kind: DocKind }) {
  const [lista, setLista] = useState<CourseSummary[] | null>(null);
  useEffect(() => {
    void listCourses().then(
      (todos) => setLista(todos.filter((c) => (c.kind === 'ginastica' ? 'ginastica' : 'percurso') === kind)),
      () => setLista([]),
    );
  }, [kind]);

  return (
    <section className="file-dialog">
      <p className="note">
        {t(kind === 'ginastica' ? 'arq.separadosPerc' : 'arq.separadosGin')}
        {useDocumentStore.getState().dirty ? ' ' + t('arq.salveAntes') : ''}
      </p>
      <button
        className="file-blank"
        onClick={() => {
          if (newKindOnSameArena(kind) === 'ok') fecha();
        }}
      >
        <strong>{t(kind === 'ginastica' ? 'arq.novaGinMesma' : 'arq.novoPercMesma')}</strong>
        <em>{t(kind === 'ginastica' ? 'arq.mesmaDoPerc' : 'arq.mesmaDaGin')}</em>
      </button>
      <h3>{t(kind === 'ginastica' ? 'arq.ouAbraGin' : 'arq.ouAbraPerc')}</h3>
      {lista === null ? (
        <p className="note">{t('arq.carregando')}</p>
      ) : lista.length === 0 ? (
        <p className="note dim">{t(kind === 'ginastica' ? 'arq.nenhumaGin' : 'arq.nenhumPerc')}</p>
      ) : (
        <ul className="file-list">
          {lista.map((c) => (
            <li key={c.id}>
              <div className="file-name">
                <strong>{c.name}</strong>
                <em>
                  {c.arenaName ? `${c.arenaName} · ` : ''}
                  {data(c.savedAt)}
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
                {t('arq.abrir')}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="row-buttons">
        <button onClick={() => useEditorStore.getState().setDialog(kind === 'ginastica' ? 'nova-ginastica' : 'novo')}>
          {t(kind === 'ginastica' ? 'arq.novaGinOutra' : 'arq.novoPercOutra')}
        </button>
      </div>
      <p className="note dim">{t(kind === 'ginastica' ? 'arq.voltarPerc' : 'arq.voltarGin')}</p>
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
      <h3>{t('arq.meusPercursos')}</h3>
      {lista === null ? (
        <p className="note">{t('arq.carregando')}</p>
      ) : lista.length === 0 ? (
        <p className="note">{t('arq.nenhumPercDica')}</p>
      ) : (
        <ul className="file-list">
          {lista.map((c) => (
            <li key={c.id}>
              <div className="file-name">
                <strong>
                  {c.name}
                  {c.kind === 'ginastica' && <span className="file-tag">{t('arq.tagGin')}</span>}
                </strong>
                <em>
                  {c.arenaName ? `${c.arenaName} · ` : ''}
                  {t(c.obstacleCount === 1 ? 'arq.umObstaculo' : 'arq.nObstaculos', { n: c.obstacleCount })} · {data(c.savedAt)}
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
                {t('arq.abrir')}
              </button>
              <button
                className="mini"
                title={t('arq.apagarPerc')}
                onClick={() => {
                  if (window.confirm(t('arq.confirmaApagarPerc', { nome: c.name }))) void deleteCourse(c.id).then(recarrega);
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
          {t('arq.abrirPcs')}
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
    const escolhido = nome.trim() || doc.arenaSource?.name || doc.meta.venue || t('arq.pistaSemNome');
    const template = buildTemplate(doc, escolhido, SCHEMA_VERSION);
    if (template.objects.length === 0) {
      window.alert(t('arq.nadaSalvar'));
      return null;
    }
    return template;
  };

  const salvar = async () => {
    const tpl = montar();
    if (!tpl) return;
    try {
      await saveTemplate(tpl);
      setSalvo(tpl.name);
      setNome('');
      setVersao((v) => v + 1);
    } catch (err) {
      if (err instanceof TemplateStoreError && window.confirm(`${err.message}\n\n${t('arq.exportarAgora')}`)) exportTemplateFile(tpl);
    }
  };

  const aplicar = (tpl: ArenaTemplate) => {
    if (
      arenaScopeObjects(doc).length > 0 &&
      !window.confirm(t('arq.confirmaTrocar', { nome: tpl.name }))
    ) {
      return;
    }
    apply('Aplicar pista', (d) => applyTemplate(d, tpl));
    useEditorStore.getState().clearSelection();
    fecha();
  };

  return (
    <section className="file-dialog">
      <h3>{t('arq.salvarAtual')}</h3>
      <p className="note">{t('arq.soCenario')}</p>
      <div className="file-save">
        <input
          type="text"
          className="full"
          value={nome}
          placeholder={doc.arenaSource?.name || doc.meta.venue || t('arq.nomeLocal')}
          onChange={(e) => {
            setNome(e.target.value);
            setSalvo(null);
          }}
        />
        <div className="row-buttons">
          <button className="primary" onClick={() => void salvar()}>
            {t('arq.salvarMinhas')}
          </button>
          <button
            onClick={() => {
              const tpl = montar();
              if (tpl) exportTemplateFile(tpl);
            }}
          >
            {t('arq.exportarArquivoPista')}
          </button>
        </div>
        {salvo && <p className="note ok-text">{t('arq.guardada', { nome: salvo })}</p>}
      </div>

      <h3>{t('arq.abrirUma')}</h3>
      <p className="note">{t('arq.trocaSo')}</p>
      <PistaPicker acao={t('arq.aplicar')} onPick={aplicar} versao={versao} />
    </section>
  );
}
