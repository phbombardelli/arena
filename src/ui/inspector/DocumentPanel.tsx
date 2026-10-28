import { useMemo } from 'react';
import { courseOrder } from '@core/assist/courseRide';
import { findInterferences } from '@core/assist/interference';
import { firstArena } from '@core/model/document';
import { arenaArea, arenaExtent } from '@core/model/arena';
import { formatDistance, pathLength } from '@core/model/path';
import type { Obstacle } from '@core/model/types';
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
  const tracados = doc.objects.filter((o) => o.kind === 'path');
  const distancia = tracados.length > 0 ? pathLength(tracados[0]!) : null;
  const achados = useMemo(() => findInterferences(doc), [doc]);
  const temPartida = doc.objects.some((o) => o.kind === 'timing' && o.role === 'start');
  const temChegada = doc.objects.some((o) => o.kind === 'timing' && o.role === 'finish');

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

      <p className="note dim">
        {t('resumo.selecioneNota')}
      </p>
    </section>
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
