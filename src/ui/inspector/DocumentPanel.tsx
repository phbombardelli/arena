import { useEffect, useMemo, useState } from 'react';
import { courseOrder, phaseStops, viraOxer } from '@core/assist/courseRide';
import { avisosDesempate, lerOrdem, limpaVariacoes, marcaVariacao, ordemTexto, variacoesDe } from '@core/library/desempate';
import { traceCourse } from '@ui/actions/rideActions';
import { avisosDuasFases, fasesDoPercurso, ligaDuasFases, mudaFimDaPrimeira } from '@core/library/duasFases';
import { findInterferences } from '@core/assist/interference';
import { firstArena } from '@core/model/document';
import { arenaArea, arenaExtent } from '@core/model/arena';
import { formatDistance, pathLength } from '@core/model/path';
import type { CoursePath, FolhaDesempate, Obstacle } from '@core/model/types';
import { formatMeters } from '@core/scale/units';
import { useDocumentStore } from '@store/documentStore';
import { useEditorStore } from '@store/editorStore';
import { insertTimingLine } from '@ui/actions/timingActions';
import { startMapWizard } from '@ui/actions/imageActions';
import { GuidedPanel } from './GuidedPanel';
import { ObjectPanel } from './ObjectPanel';
import { formatDate, t } from '@core/i18n/i18n';

/**
 * Painel da direita: SÓ o que está selecionado.
 *
 * Antes ele empilhava folha, margens, escala, grade, interferências e a
 * seleção, tudo aberto, e o que importava no momento ficava no fundo de
 * uma coluna longa. A folha foi para o botão "Folha" da barra de cima; a
 * grade e os avisos, para a barra de baixo. Sem seleção, o painel
 * mostra o resumo do que se está fazendo.
 */
export function DocumentPanel() {
  const { selection, guided, showHints, toggleHints } = useEditorStore();

  let conteudo: React.ReactNode;
  if (guided) conteudo = <GuidedPanel />;
  else if (selection.length > 0) conteudo = <ObjectPanel />;
  else conteudo = <Resumo />;

  return (
    <aside className={showHints ? 'panel show-hints' : 'panel'}>
      <div className="panel-tools">
        <button
          className={showHints ? 'hint-toggle active' : 'hint-toggle'}
          onClick={toggleHints}
          title={showHints ? t('resumo.esconderExplicacoes') : t('resumo.mostrarExplicacoes')}
          aria-pressed={showHints}
        >
          ?
        </button>
      </div>
      {conteudo}
    </aside>
  );
}

function Resumo() {
  const mode = useEditorStore((s) => s.mode);
  const ginastica = useDocumentStore((s) => s.doc.kind === 'ginastica');
  return mode === 'pista' ? <ResumoPista /> : ginastica ? <ResumoGinastica /> : <ResumoProva />;
}

/** Resumo da folha de ginástica (B-37): o que há nela, sem prova. */
function ResumoGinastica() {
  const doc = useDocumentStore((s) => s.doc);
  const elementos = doc.objects.filter((o) => o.kind === 'obstacle').length;
  const exercicios = new Set(doc.objects.map((o) => o.exercise?.id).filter(Boolean)).size;
  return (
    <section className="summary">
      <h2>{t('resumo.ginastica')}</h2>
      {doc.arenaSource && (
        <p className="note arena-source">
          {t('resumo.pista')} <strong>{doc.arenaSource.name}</strong>
        </p>
      )}
      <div className="stat-row">
        <div className="stat">
          <strong>{exercicios}</strong>
          <span>{t('resumo.exercicios')}</span>
        </div>
        <div className="stat">
          <strong>{elementos}</strong>
          <span>{t('resumo.elementos')}</span>
        </div>
      </div>
      <p className="note">{t('resumo.ginasticaNota')}</p>
    </section>
  );
}

function ResumoProva() {
  const doc = useDocumentStore((s) => s.doc);
  const { setSelection } = useEditorStore();

  const obstaculos = doc.objects.filter((o): o is Obstacle => o.kind === 'obstacle');
  const degraus = courseOrder(obstaculos);
  const esforcos = degraus.reduce((n, d) => n + d.elements.length, 0);
  const tracados = doc.objects.filter((o): o is CoursePath => o.kind === 'path' && !o.fase);
  const distancia = tracados.length > 0 ? pathLength(tracados[0]!) : null;
  const achados = useMemo(() => findInterferences(doc), [doc]);
  const temPartida = doc.objects.some((o) => o.kind === 'timing' && o.role === 'start' && !o.divisa);
  const temChegada = doc.objects.some((o) => o.kind === 'timing' && o.role === 'finish' && !o.divisa);

  return (
    <section className="summary">
      <h2>{t('resumo.prova')}</h2>
      {doc.arenaSource && (
        <p className="note arena-source" title={t('resumo.pistaCopiada')}>
          {t('resumo.pista')} <strong>{doc.arenaSource.name}</strong>
          <span> · {formatDate(new Date(doc.arenaSource.savedAt))}</span>
        </p>
      )}
      <div className="stat-row">
        <div className="stat">
          <b>{degraus.length}</b>
          <span>{t('resumo.obstaculos')}</span>
        </div>
        <div className="stat">
          <b>{esforcos}</b>
          <span>{t('resumo.esforcos')}</span>
        </div>
        <div className="stat">
          <b>{distancia === null ? '—' : `${formatDistance(distancia, 0)} m`}</b>
          <span>{t('resumo.tracado')}</span>
        </div>
      </div>

      {achados.length === 0 ? (
        <p className="state ok">{t('resumo.semInterferencias')}</p>
      ) : (
        <button className="state warn" onClick={() => setSelection(achados[0]!.ids)}>
          {t(achados.length === 1 ? 'resumo.umaInterferencia' : 'resumo.nInterferencias', { n: achados.length })}
        </button>
      )}

      <h3>{t('resumo.partidaChegada')}</h3>
      <div className="row-buttons">
        <button onClick={() => insertTimingLine('start')}>
          {temPartida ? t('resumo.recolocarPartida') : t('resumo.colocarPartida')}
        </button>
        <button onClick={() => insertTimingLine('finish')}>
          {temChegada ? t('resumo.recolocarChegada') : t('resumo.colocarChegada')}
        </button>
      </div>
      <p className="note dim">
        {t('resumo.partidaNota')}
      </p>

      <DuasFases />

      <Desempate />

      <p className="note dim">
        {t('resumo.selecioneNota')}
      </p>
    </section>
  );
}

/**
 * Prova em duas fases (B-95): liga, escolhe onde a 1ª termina e mostra os
 * avisos do Art. 222. A linha entre as fases e os blocos do quadro vêm
 * sozinhos.
 */
function DuasFases() {
  const { doc, apply } = useDocumentStore();
  const stops = courseOrder(doc.objects.filter((o): o is Obstacle => o.kind === 'obstacle'));
  const fases = fasesDoPercurso(doc);
  const avisos = useMemo(() => avisosDuasFases(doc), [doc]);
  // Precisa de pelo menos dois obstáculos para haver duas fases.
  if (stops.length < 2 && !fases) return null;
  const fim = fases?.primeira[fases.primeira.length - 1];

  return (
    <>
      <h3>{t('df.titulo')}</h3>
      <label className="check" title={t('df.ligaDica')}>
        <input
          type="checkbox"
          checked={fases != null}
          onChange={(e) => apply(t('df.liga'), (d) => ligaDuasFases(d, e.target.checked))}
        />
        {t('df.liga')}
      </label>
      {fases && (
        <>
          <label className="field">
            <span>{t('df.fimPrimeira')}</span>
            <select
              value={fim?.elements[0]?.id ?? ''}
              onChange={(e) => apply(t('df.fimPrimeira'), (d) => mudaFimDaPrimeira(d, e.target.value))}
            >
              {stops.slice(0, -1).map((st) => (
                <option key={st.elements[0]!.id} value={st.elements[0]!.id}>
                  {st.label}
                </option>
              ))}
            </select>
          </label>
          <p className="note">{t('df.contagem', { a: fases.primeira.length, b: fases.segunda.length })}</p>
          {avisos.length === 0 ? (
            <p className="state ok">{t('df.semAvisos')}</p>
          ) : (
            avisos.map((a) => (
              <p key={a.chave} className="state warn">
                {t(a.chave, a.params)}
              </p>
            ))
          )}
          <p className="note dim">{t('df.avisosNota')}</p>
          <p className="note dim">{t('df.linhaNota')}</p>
        </>
      )}
    </>
  );
}

/**
 * Desempate (B-92): a ordem digitada, os avisos da FEI, a partida e a
 * chegada próprias e o traçado. A ordem guarda os obstáculos, então o
 * texto é sempre reescrito a partir dela: renumerar o percurso atualiza.
 */
function Desempate() {
  const { doc, apply } = useDocumentStore();
  const obstaculos = doc.objects.filter((o): o is Obstacle => o.kind === 'obstacle');
  const stops = phaseStops(doc, 'desempate');
  const atual = ordemTexto(stops);
  const [texto, setTexto] = useState(atual);
  const [desconhecidos, setDesconhecidos] = useState<string[]>([]);
  useEffect(() => setTexto(atual), [atual]);

  const avisos = useMemo(() => avisosDesempate(doc), [doc]);
  const tracado = doc.objects.find((o) => o.kind === 'path' && o.fase === 'desempate');
  const temOrdem = (doc.desempate?.ordem.length ?? 0) > 0;
  const tem = (role: 'start' | 'finish') =>
    doc.objects.some((o) => o.kind === 'timing' && o.role === role && o.fase === 'desempate');

  const confirma = () => {
    const lida = lerOrdem(texto, obstaculos);
    setDesconhecidos(lida.desconhecidos);
    if (lida.desconhecidos.length > 0) return;
    if (lida.ids.join() === (doc.desempate?.ordem ?? []).join()) {
      setTexto(atual);
      return;
    }
    apply(t('dsp.ordem'), (d) => {
      if (lida.ids.length === 0) delete d.desempate;
      else {
        d.desempate = { ...d.desempate, ordem: lida.ids };
        limpaVariacoes(d.desempate);
      }
    });
  };

  return (
    <>
      <h3>{t('dsp.titulo')}</h3>
      <label className="field">
        <span>{t('dsp.ordem')}</span>
        <input
          type="text"
          value={texto}
          placeholder={t('dsp.ordemExemplo')}
          onChange={(e) => setTexto(e.target.value)}
          onBlur={confirma}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
        />
      </label>
      {desconhecidos.length > 0 ? (
        <p className="note">{t('dsp.desconhecidos', { lista: desconhecidos.join(', ') })}</p>
      ) : (
        <p className="note dim">{t('dsp.ordemNota')}</p>
      )}

      {temOrdem && (
        <>
          {avisos.length === 0 ? (
            <p className="state ok">{t('dsp.semAvisos')}</p>
          ) : (
            <>
              {avisos.map((a) => (
                <p key={a.key} className="state warn">{t(a.key, a.params)}</p>
              ))}
              <p className="note dim">{t('dsp.avisosNota')}</p>
            </>
          )}

          <h4>{t('dsp.variacoes')}</h4>
          <div className="dsp-variacoes">
            {stops.map((stop, i) => {
              const tem = (v: 'contrario' | 'oxer') =>
                stop.elements.every((e) => variacoesDe(doc.desempate, e.id).includes(v));
              // O degrau já vem como é saltado: a pergunta é sobre o original.
              const original = obstaculos.find((o) => o.id === stop.elements[0]!.id);
              const podeOxer = stop.elements.length === 1 && original != null && viraOxer(original);
              const alterna = (v: 'contrario' | 'oxer') =>
                apply(t(v === 'contrario' ? 'dsp.contrario' : 'dsp.oxer'), (d) =>
                  marcaVariacao(d, stop, v, !tem(v)),
                );
              return (
                <span className="dsp-degrau" key={`${stop.label}-${i}`}>
                  <strong>{stop.label}</strong>
                  <button
                    className={tem('contrario') ? 'active' : ''}
                    title={t('dsp.contrario')}
                    aria-pressed={tem('contrario')}
                    onClick={() => alterna('contrario')}
                  >
                    ↩
                  </button>
                  {podeOxer && (
                    <button
                      className={tem('oxer') ? 'active' : ''}
                      title={t('dsp.oxer')}
                      aria-pressed={tem('oxer')}
                      onClick={() => alterna('oxer')}
                    >
                      oxer
                    </button>
                  )}
                </span>
              );
            })}
          </div>
          <p className="note dim">{t('dsp.variacoesNota')}</p>

          <div className="row-buttons">
            <button onClick={() => insertTimingLine('start', 'desempate')}>
              {tem('start') ? t('resumo.recolocarPartida') : t('resumo.colocarPartida')}
            </button>
            <button onClick={() => insertTimingLine('finish', 'desempate')}>
              {tem('finish') ? t('resumo.recolocarChegada') : t('resumo.colocarChegada')}
            </button>
          </div>
          <p className="note dim">{t('dsp.partidaNota')}</p>

          <div className="row-buttons">
            <button onClick={() => traceCourse(undefined, 'desempate')}>{t('dsp.tracar')}</button>
          </div>
          {tracado?.kind === 'path' && (
            <p className="note">{t('dsp.extensao', { d: formatDistance(pathLength(tracado), 0) })}</p>
          )}
          <label className="check" title={t('dsp.ordemNoObstaculoDica')}>
            <input
              type="checkbox"
              checked={doc.desempate?.ordemNoObstaculo !== false}
              onChange={(e) =>
                apply(t('dsp.ordemNoObstaculo'), (d) => {
                  if (!d.desempate) return;
                  if (e.target.checked) delete d.desempate.ordemNoObstaculo;
                  else d.desempate.ordemNoObstaculo = false;
                })
              }
            />
            {t('dsp.ordemNoObstaculo')}
          </label>
          <label className="field">
            <span>{t('dsp.naFolha')}</span>
            <select
              value={doc.desempate?.folha ?? 'percurso'}
              onChange={(e) =>
                apply(t('dsp.naFolha'), (d) => {
                  if (d.desempate) d.desempate.folha = e.target.value as FolhaDesempate;
                })
              }
            >
              {(['percurso', 'duas', 'uma'] as const).map((f) => (
                <option key={f} value={f}>{t(`dsp.folha.${f}`)}</option>
              ))}
            </select>
          </label>
          <p className="note dim">{t('dsp.vistaNota')}</p>
        </>
      )}
    </>
  );
}

function ResumoPista() {
  const doc = useDocumentStore((s) => s.doc);
  const { setDialog } = useEditorStore();
  const arena = firstArena(doc);

  return (
    <section className="summary">
      <h2>{t('resumo.pistaTitulo')}</h2>
      {arena ? (
        <p className="note">
          {formatMeters(arenaExtent(arena).widthM, 0)} × {formatMeters(arenaExtent(arena).heightM, 0)} m ·{' '}
          {formatMeters(arenaArea(arena), 0)} m²
        </p>
      ) : (
        <p className="note">
          {t('resumo.semContorno')}
        </p>
      )}
      <div className="row-buttons">
        <button onClick={() => void startMapWizard()}>{t('resumo.pistaPeloMapa')}</button>
        <button onClick={() => setDialog('modelos')}>{t('resumo.modelos')}</button>
      </div>
      <p className="note dim">
        {t('resumo.modelosNota')}
      </p>
    </section>
  );
}
