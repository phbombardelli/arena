import { useRef, useState } from 'react';
import { getLang, t } from '@core/i18n/i18n';
import type { MessageKey } from '@core/i18n/messages';
import { useEditorStore } from '@store/editorStore';
import { marcaTutorialVisto, tutoriaisVistos } from '@platform/tutorialPrefs';

/**
 * Tutoriais em vídeo (B-25): a lista dos quatro vídeos e o player, com
 * capítulos. Os arquivos moram fora do programa (VITE_TUTORIAIS_URL):
 * NN.mp4, NN-capa.jpg e NN.vtt para cada vídeo.
 */

interface Tutorial {
  id: string;
  titulo: MessageKey;
  resumo: MessageKey;
  duracaoS: number;
  /** Início de cada capítulo, em segundos do vídeo. */
  capitulos: [number, MessageKey][];
}

const TUTORIAIS: Tutorial[] = [
  {
    id: '01', titulo: 'tut.v1', resumo: 'tut.v1r', duracaoS: 260,
    capitulos: [[0, 'tut.c1a'], [43, 'tut.c1b'], [119, 'tut.c1c'], [151, 'tut.c1d'], [186, 'tut.c1e'], [210, 'tut.c1f'], [228, 'tut.c1g']],
  },
  {
    id: '02', titulo: 'tut.v2', resumo: 'tut.v2r', duracaoS: 291,
    capitulos: [[0, 'tut.c2a'], [41, 'tut.c2b'], [54, 'tut.c2c'], [91, 'tut.c2d'], [117, 'tut.c2e'], [163, 'tut.c2f'], [193, 'tut.c2g'], [226, 'tut.c2h'], [242, 'tut.c2i']],
  },
  {
    id: '03', titulo: 'tut.v3', resumo: 'tut.v3r', duracaoS: 365,
    capitulos: [[0, 'tut.c1b'], [35, 'tut.c3a'], [68, 'tut.c3b'], [112, 'tut.c3c'], [141, 'tut.c3d'], [172, 'tut.c3e'], [217, 'tut.c3f'], [247, 'tut.c3g'], [263, 'tut.c3h'], [304, 'tut.c3i'], [331, 'tut.c3j']],
  },
  {
    id: '04', titulo: 'tut.v4', resumo: 'tut.v4r', duracaoS: 276,
    capitulos: [[0, 'tut.c4a'], [25, 'tut.c4b'], [49, 'tut.c4c'], [75, 'tut.c4d'], [113, 'tut.c4e'], [147, 'tut.c4f'], [178, 'tut.c4g'], [195, 'tut.c4h'], [218, 'tut.c4i'], [240, 'tut.c4j']],
  },
];

const BASE = ((import.meta.env.VITE_TUTORIAIS_URL as string | undefined) ?? '').replace(/\/?$/, '/');
/** Sem endereço dos vídeos (build sem VITE_TUTORIAIS_URL), o botão e as boas-vindas não aparecem. */
export const publicados = BASE !== '/';
const arquivo = (id: string, fim: string) => `${BASE}${id}${fim}`;
const minutos = (s: number) => t('tut.minutos', { n: Math.round(s / 60) });
const relogio = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** Duração do primeiro vídeo, para o convite das boas-vindas. */
export const MINUTOS_VIDEO_1 = Math.round(TUTORIAIS[0]!.duracaoS / 60);

/** Pedido de abrir um vídeo direto, vindo das boas-vindas; lido uma vez pela janela. */
let pedido: string | null = null;

export function abrirTutoriais(id: string | null = null): void {
  pedido = id;
  useEditorStore.getState().setDialog('tutoriais');
}

export function TutorialsBody() {
  const [atual, setAtual] = useState<string | null>(() => {
    const p = pedido;
    pedido = null;
    return p;
  });
  const [vistos, setVistos] = useState(tutoriaisVistos);
  const marca = (id: string) => {
    marcaTutorialVisto(id);
    setVistos(tutoriaisVistos());
  };

  if (!publicados) return <p>{t('tut.indisponivel')}</p>;

  const i = TUTORIAIS.findIndex((v) => v.id === atual);
  const tut = TUTORIAIS[i];
  if (tut) {
    return (
      <Player
        key={tut.id}
        tut={tut}
        anterior={TUTORIAIS[i - 1]?.id ?? null}
        proximo={TUTORIAIS[i + 1]?.id ?? null}
        onTroca={setAtual}
        onVisto={() => marca(tut.id)}
      />
    );
  }

  return (
    <section className="tutorials">
      <p>{t('tut.intro')}{getLang() !== 'pt' ? ` ${t('tut.soPortugues')}` : ''}</p>
      <ul className="tut-grid">
        {TUTORIAIS.map((v, k) => (
          <li key={v.id}>
            <button className="tut-card" onClick={() => setAtual(v.id)}>
              <span className="tut-capa">
                <img src={arquivo(v.id, '-capa.jpg')} alt="" loading="lazy" />
                <span className="tut-play" aria-hidden>▶</span>
                <span className="tut-duracao">{minutos(v.duracaoS)}</span>
              </span>
              <strong>{k + 1}. {t(v.titulo)}</strong>
              <em>{t(v.resumo)}</em>
              {vistos.includes(v.id) && <span className="tut-visto">{t('tut.assistido')}</span>}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

interface PlayerProps {
  tut: Tutorial;
  anterior: string | null;
  proximo: string | null;
  onTroca: (id: string | null) => void;
  onVisto: () => void;
}

function Player({ tut, anterior, proximo, onTroca, onVisto }: PlayerProps) {
  const video = useRef<HTMLVideoElement>(null);
  const [agora, setAgora] = useState(0);
  const [erro, setErro] = useState(false);
  const capitulo = tut.capitulos.reduce((c, [s], k) => (agora >= s ? k : c), 0);

  const vaiPara = (s: number) => {
    const v = video.current;
    if (!v) return;
    v.currentTime = s;
    void v.play().catch(() => {});
  };

  return (
    <section className="tut-player">
      <div className="tut-tela">
        <video
          ref={video}
          controls
          autoPlay
          playsInline
          preload="metadata"
          crossOrigin="anonymous"
          poster={arquivo(tut.id, '-capa.jpg')}
          onTimeUpdate={(e) => {
            const v = e.currentTarget;
            setAgora(v.currentTime);
            // Visto quando passou de nove décimos: os créditos do fim não contam.
            if (v.duration && v.currentTime / v.duration > 0.9) onVisto();
          }}
          onError={() => setErro(true)}
        >
          <source src={arquivo(tut.id, '.mp4')} type="video/mp4" onError={() => setErro(true)} />
          <track kind="subtitles" srcLang="pt" label="Português" src={arquivo(tut.id, '.vtt')} default={getLang() !== 'pt'} />
        </video>
        {erro && <p className="error">{t('tut.erro')}</p>}
        <div className="tut-nav">
          <button onClick={() => onTroca(null)}>{t('tut.todos')}</button>
          <span className="toolbar-spacer" />
          {anterior && <button onClick={() => onTroca(anterior)}>{t('tut.anterior')}</button>}
          {proximo && <button className="primary" onClick={() => onTroca(proximo)}>{t('tut.proximo')}</button>}
        </div>
      </div>
      <aside className="tut-capitulos">
        <h3>{TUTORIAIS.indexOf(tut) + 1}. {t(tut.titulo)}</h3>
        <p className="note">{t('tut.capitulos')}</p>
        <ol>
          {tut.capitulos.map(([s, rotulo], k) => (
            <li key={s}>
              <button className={k === capitulo ? 'active' : ''} onClick={() => vaiPara(s)}>
                <span>{relogio(s)}</span> {t(rotulo)}
              </button>
            </li>
          ))}
        </ol>
      </aside>
    </section>
  );
}

/** Primeira abertura: convite para o vídeo 1, uma vez só. */
export function WelcomeBody() {
  const setDialog = useEditorStore((s) => s.setDialog);
  return (
    <section className="welcome">
      <p>{t('bv.texto')}</p>
      {publicados && (
        <button className="tut-card tut-card-unico" onClick={() => abrirTutoriais('01')}>
          <span className="tut-capa">
            <img src={arquivo('01', '-capa.jpg')} alt="" />
            <span className="tut-play" aria-hidden>▶</span>
            <span className="tut-duracao">{minutos(TUTORIAIS[0]!.duracaoS)}</span>
          </span>
        </button>
      )}
      <p>{t('bv.comece', { n: MINUTOS_VIDEO_1 })}{getLang() !== 'pt' ? ` ${t('tut.soPortugues')}` : ''}</p>
      <div className="row-buttons">
        <button className="primary" onClick={() => abrirTutoriais('01')}>{t('bv.assistir')}</button>
        <button onClick={() => abrirTutoriais()}>{t('bv.todos')}</button>
        <button onClick={() => setDialog(null)}>{t('bv.depois')}</button>
      </div>
      <p className="note">{t('bv.ondeFica')}</p>
    </section>
  );
}
