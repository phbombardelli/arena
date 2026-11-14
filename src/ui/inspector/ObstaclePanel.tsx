import {
  resetLabel,
  setBarAppearance,
  setLiverpool,
  setWings,
  setArrow,
  setFaceWidth,
  setLabelVisible,
  setObstacleLetter,
  setObstacleNote,
  setObstacleNumber,
  setObstacleType,
  setSoDesempate,
  setSpread,
  setElementHeight,
} from '@core/commands/obstacleOps';
import {
  obstacleTypesFor,
  acceptsLiverpool,
  hasBars,
  semParaflanco,
  obstacleDef,
} from '@core/library/obstacles';
import type { BarStyle, Obstacle, ObstacleType } from '@core/model/types';
import { useDocumentStore } from '@store/documentStore';
import { useEditorStore } from '@store/editorStore';
import { descreveMaterial, disposicaoAtual, materialDe, montagemDe, topoMontagem } from '@core/library/montagem';
import { escalaCm, planosDoObstaculo, VistaFrente, VistaPerfil } from '@render/montagemDesenho';
import { nomePlano } from './MontagemEditor';
import type { MessageKey } from '@core/i18n/messages';
import { NumberField } from './NumberField';
import { phaseStops, viraOxer } from '@core/assist/courseRide';
import { marcaVariacao, variacoesDe } from '@core/library/desempate';
import { WingStyleField } from './WingStyleField';
import { t } from '@core/i18n/i18n';

const LETRAS: Obstacle['letter'][] = ['', 'A', 'B', 'C'];

/**
 * Painel do obstáculo, enxuto (B-33): só o que se mexe a toda hora —
 * tipo, número e letra, frente e largura, seta. Giro e o que é raro
 * (posição exata, aparência, rótulos, observação) o ObjectPanel põe
 * depois, este último dentro de "Mais opções". As alturas moram na
 * configuração da tabela de alturas; as explicações viraram dica do mouse.
 */
export function ObstaclePanel({ obstacle }: { obstacle: Obstacle }) {
  const { apply, doc } = useDocumentStore();
  const def = obstacleDef(obstacle.type);
  const travado = obstacle.locked;

  return (
    <>
      <label className="field" title={def.hint}>
        <span>{t('campo.tipo')}</span>
        <select
          value={obstacle.type}
          disabled={travado}
          onChange={(e) =>
            apply('Tipo do obstáculo', (d) =>
              setObstacleType(d, obstacle.id, e.target.value as ObstacleType),
            )
          }
        >
          {obstacleTypesFor(doc.kind, obstacle.type).map((o) => (
            <option key={o.type} value={o.type} title={o.hint}>{o.label}</option>
          ))}
        </select>
      </label>

      <div className="field-pair">
        <label className="field">
          <span>{t('campo.numero')}</span>
          <input
            type="text"
            value={obstacle.number}
            disabled={travado}
            placeholder="—"
            onChange={(e) =>
              apply(
                'Número do obstáculo',
                (d) => setObstacleNumber(d, obstacle.id, e.target.value),
                `numero-${obstacle.id}`,
              )
            }
          />
        </label>
        <label className="field" title={t('obstp.letraDica')}>
          <span>{t('campo.letraObst')}</span>
          <select
            value={obstacle.letter}
            disabled={travado}
            onChange={(e) =>
              apply('Letra do obstáculo', (d) =>
                setObstacleLetter(d, obstacle.id, e.target.value as Obstacle['letter']),
              )
            }
          >
            {LETRAS.map((l) => (
              <option key={l || 'sem'} value={l}>{l === '' ? '—' : l}</option>
            ))}
          </select>
        </label>
      </div>

      {doc.kind !== 'ginastica' && (
        <label className="check" title={t('dsp.soDesempateDica')}>
          <input
            type="checkbox"
            checked={obstacle.soDesempate === true}
            disabled={travado}
            onChange={(e) =>
              apply(t('dsp.soDesempate'), (d) => setSoDesempate(d, obstacle.id, e.target.checked))
            }
          />
          {t('dsp.soDesempate')}
        </label>
      )}

      <div className="field-pair">
        <NumberField
          label={t('obstp.frente')}
          unit="m"
          value={obstacle.faceWidthM}
          decimals={2}
          step={0.1}
          min={0.5}
          disabled={travado}
          onCommit={(v) => apply('Largura do obstáculo', (d) => setFaceWidth(d, obstacle.id, v))}
        />
        {/* A largura de salto vem do tipo: oxer, tríplice, muro e rio têm;
            vertical e plano, não. */}
        {obstacle.spreadM !== null && (
          <NumberField
            label={t('campo.largura')}
            unit="m"
            value={obstacle.spreadM}
            decimals={2}
            step={0.1}
            min={0.1}
            disabled={travado}
            onCommit={(v) => apply('Largura de salto', (d) => setSpread(d, obstacle.id, v))}
          />
        )}
      </div>

      {/* Sentido em quatro botões (revisão de UX): um clique, e nunca corta. */}
      <div className="field" title={t('obstp.setaDica')}>
        <span>{t('obstp.sentido')}</span>
        <div className="segmentado" role="radiogroup" aria-label={t('obstp.sentido')}>
          {(
            [
              ['frente', '→', 'obstp.paraFrente'],
              ['inverso', '←', 'obstp.invertido'],
              ['duplo', '↔', 'obstp.duplo'],
              ['sem', '⌀', 'obstp.semSeta'],
            ] as const
          ).map(([v, icone, rotulo]) => {
            const atual = !obstacle.arrow.visible ? 'sem' : obstacle.arrow.both ? 'duplo' : obstacle.arrow.reversed ? 'inverso' : 'frente';
            return (
              <button
                key={v}
                role="radio"
                aria-checked={atual === v}
                className={atual === v ? 'active' : ''}
                title={t(rotulo)}
                aria-label={t(rotulo)}
                disabled={travado}
                onClick={() =>
                  apply('Sentido do salto', (d) =>
                    setArrow(d, obstacle.id, {
                      visible: v !== 'sem',
                      both: v === 'duplo',
                      reversed: v === 'inverso' ? true : v === 'frente' ? false : obstacle.arrow.reversed,
                    }),
                  )
                }
              >
                {icone}
              </button>
            );
          })}
        </div>
      </div>

    </>
  );
}

/**
 * O que muda no desempate, direto no obstáculo (revisão de UX): só aparece
 * se ele está na ordem do desempate. É a mesma marca da lista do resumo.
 */
export function DesempateDoObstaculo({ obstacle }: { obstacle: Obstacle }) {
  const { doc, apply } = useDocumentStore();
  if ((doc.desempate?.ordem.length ?? 0) === 0) return null;
  const stops = phaseStops(doc, 'desempate');
  const i = stops.findIndex((st) => st.elements.some((e) => e.id === obstacle.id));
  if (i < 0) return null;
  const stop = stops[i]!;
  const tem = (v: 'contrario' | 'oxer') => stop.elements.every((e) => variacoesDe(doc.desempate, e.id).includes(v));
  const podeOxer = stop.elements.length === 1 && viraOxer(obstacle);
  const alterna = (v: 'contrario' | 'oxer') =>
    apply(t(v === 'contrario' ? 'dsp.contrario' : 'dsp.oxer'), (d) => marcaVariacao(d, stop, v, !tem(v)));
  return (
    <>
      <h3>{t('dsp.noDesempate', { n: i + 1 })}</h3>
      <label className="check">
        <input type="checkbox" checked={tem('contrario')} disabled={obstacle.locked} onChange={() => alterna('contrario')} />
        {t('dsp.saltadoContrario')}
      </label>
      {podeOxer && (
        <label className="check">
          <input type="checkbox" checked={tem('oxer')} disabled={obstacle.locked} onChange={() => alterna('oxer')} />
          {t('dsp.oxer')}
        </label>
      )}
    </>
  );
}

const ROTULO_DISPOSICAO: Record<ReturnType<typeof disposicaoAtual>, MessageKey> = {
  paralelas: 'mont.paralelas',
  'leque-dir': 'mont.lequeDir',
  'leque-esq': 'mont.lequeEsq',
  z: 'mont.z',
  'z-inv': 'mont.zInv',
  livre: 'mont.livre',
};

/**
 * A montagem no painel (B-108): só a miniatura e o resumo. Editar abre a
 * janela, que tem espaço para arrastar as varas com precisão.
 */
export function ResumoMontagem({ obstacle }: { obstacle: Obstacle }) {
  const abreMontagem = useEditorStore((s) => s.abreMontagem);
  const { apply } = useDocumentStore();
  const m = montagemDe(obstacle);
  const varas = m.pecas.filter((p) => p.tipo === 'vara').length;
  const abre = () => abreMontagem(obstacle.id);
  const n = obstacle.elements.length;
  const maxCm = escalaCm(Math.max(topoMontagem(m), ...obstacle.elements.map((e) => Math.round((e.height ?? 0) * 100))));
  const perfil = planosDoObstaculo(obstacle);
  return (
    <>
      <h3>{t('mont.titulo')}</h3>
      {/* As alturas de cada plano, aqui mesmo: as mesmas da tabela de alturas. */}
      <div className="montagem-alturas">
        {obstacle.elements.map((e, i) => (
          <NumberField
            key={i}
            label={n > 1 ? nomePlano(i, n) : t('mont.altura')}
            unit="cm"
            value={e.height == null ? 0 : Math.round(e.height * 100)}
            vazio={e.height == null}
            decimals={0}
            step={5}
            min={0}
            max={200}
            disabled={obstacle.locked}
            onCommit={(v) => apply(t('mont.alturaCm'), (d) => setElementHeight(d, obstacle.id, i, v > 0 ? v / 100 : null))}
          />
        ))}
      </div>
      <button className="montagem-miniatura dupla" onClick={abre} title={t('mont.editar')} aria-label={t('mont.editar')}>
        <svg viewBox="0 0 170 64">
          <VistaFrente pecas={m.pecas} caixa={{ x: 4, y: 3, w: 162, h: 58 }} maxCm={maxCm} traco={1.1} />
        </svg>
        <svg viewBox="0 0 74 64">
          <VistaPerfil {...perfil} caixa={{ x: 2, y: 3, w: 70, h: 58 }} maxCm={maxCm} traco={1.1} />
        </svg>
      </button>
      <p className="montagem-resumo">
        {descreveMaterial(materialDe(obstacle))}
        {varas >= 2 && ` · ${t(ROTULO_DISPOSICAO[disposicaoAtual(m)]).toLowerCase()}`}
      </p>
      <div className="row-buttons">
        <button onClick={abre}>{t('mont.editar')}</button>
      </div>
    </>
  );
}

/** O que é raro no obstáculo: vai para "Mais opções", fechado. */
export function ObstacleMore({ obstacle }: { obstacle: Obstacle }) {
  const { apply } = useDocumentStore();
  const travado = obstacle.locked;

  return (
    <>
      {hasBars(obstacle.type) && (
        <>
          {/* Vara no chão e cavalete não têm suporte para escolher. */}
          {!semParaflanco(obstacle.type) && (
            <>
              <h3 title={t('obstp.paraflancoDica')}>{t('obstp.suporte')}</h3>
              <WingStyleField
                wings={obstacle.wings}
                disabled={travado}
                onChange={(patch, rotulo) => apply(rotulo, (d) => setWings(d, obstacle.id, patch))}
              />
            </>
          )}

          <h3>{t('obstp.varas')}</h3>
          <label className="field">
            <span>{t('campo.estilo')}</span>
            <select
              value={obstacle.bar.style}
              disabled={travado}
              onChange={(e) =>
                apply('Estilo da vara', (d) =>
                  setBarAppearance(d, obstacle.id, { style: e.target.value as BarStyle }),
                )
              }
            >
              <option value="lisa">{t('obstp.lisa')}</option>
              <option value="listrada">{t('obstp.listrada')}</option>
              <option value="pontas">{t('obstp.faixasPontas')}</option>
            </select>
          </label>
          <div className="color-pair">
            <label className="field">
              <span>{t('campo.cor')}</span>
              <input
                type="color"
                value={obstacle.bar.color}
                disabled={travado}
                onChange={(e) =>
                  apply(
                    'Cor da vara',
                    (d) => setBarAppearance(d, obstacle.id, { color: e.target.value }),
                    `barcor-${obstacle.id}`,
                  )
                }
              />
            </label>
            {obstacle.bar.style !== 'lisa' && (
              <label className="field">
                <span>{t('obstp.faixa')}</span>
                <input
                  type="color"
                  value={obstacle.bar.accent}
                  disabled={travado}
                  onChange={(e) =>
                    apply(
                      'Cor da faixa',
                      (d) => setBarAppearance(d, obstacle.id, { accent: e.target.value }),
                      `barfaixa-${obstacle.id}`,
                    )
                  }
                />
              </label>
            )}
          </div>
          {obstacle.bar.style === 'listrada' && (
            <NumberField
              label={t('obstp.faixas')}
              value={obstacle.bar.stripes}
              decimals={0}
              step={1}
              min={2}
              max={24}
              disabled={travado}
              onCommit={(v) =>
                apply('Número de faixas', (d) =>
                  setBarAppearance(d, obstacle.id, { stripes: Math.round(v) }),
                )
              }
            />
          )}
        </>
      )}

      {acceptsLiverpool(obstacle.type) && (
        <>
          <h3 title={t('obstp.liverpoolDica')}>Liverpool</h3>
          <label className="check">
            <input
              type="checkbox"
              checked={obstacle.liverpool.enabled}
              disabled={travado}
              onChange={(e) =>
                apply('Liverpool', (d) =>
                  setLiverpool(d, obstacle.id, { enabled: e.target.checked }),
                )
              }
            />
            {t('obstp.lamina')}
          </label>
          {obstacle.liverpool.enabled && (
            <>
              <NumberField
                label={t('campo.profundidade')}
                unit="m"
                value={obstacle.liverpool.spreadM}
                decimals={2}
                step={0.1}
                min={0.1}
                disabled={travado}
                onCommit={(v) =>
                  apply('Profundidade do liverpool', (d) =>
                    setLiverpool(d, obstacle.id, { spreadM: v }),
                  )
                }
              />
              <NumberField
                label={t('campo.posicao')}
                unit="m"
                value={obstacle.liverpool.offsetM}
                decimals={2}
                step={0.1}
                disabled={travado}
                onCommit={(v) =>
                  apply('Posição do liverpool', (d) =>
                    setLiverpool(d, obstacle.id, { offsetM: v }),
                  )
                }
              />
              <NumberField
                label={t('campo.comprimento')}
                unit="m"
                value={obstacle.liverpool.widthM}
                decimals={2}
                step={0.1}
                min={0.1}
                disabled={travado}
                onCommit={(v) =>
                  apply('Comprimento do liverpool', (d) =>
                    setLiverpool(d, obstacle.id, { widthM: v }),
                  )
                }
              />
              <label className="field">
                <span>{t('obstp.corAgua')}</span>
                <input
                  type="color"
                  value={obstacle.liverpool.color}
                  disabled={travado}
                  onChange={(e) =>
                    apply(
                      t('obstp.corAgua'),
                      (d) => setLiverpool(d, obstacle.id, { color: e.target.value }),
                      `agua-${obstacle.id}`,
                    )
                  }
                />
              </label>
            </>
          )}
        </>
      )}

      <h3>{t('campo.rotulos')}</h3>
      <label className="check">
        <input
          type="checkbox"
          checked={obstacle.numberLabel.visible}
          disabled={travado}
          onChange={(e) =>
            apply('Rótulo do número', (d) =>
              setLabelVisible(d, obstacle.id, 'numberLabel', e.target.checked),
            )
          }
        />
        {t('obstp.numeroDesenho')}
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={obstacle.heightLabel.visible}
          disabled={travado}
          onChange={(e) =>
            apply('Rótulo das alturas', (d) =>
              setLabelVisible(d, obstacle.id, 'heightLabel', e.target.checked),
            )
          }
        />
        {t('obstp.alturasDesenho')}
      </label>
      {(!obstacle.numberLabel.auto || !obstacle.heightLabel.auto) && (
        <div className="row-buttons">
          <button
            disabled={travado}
            title={t('obstp.reposicionarDica')}
            onClick={() =>
              apply('Posição automática dos rótulos', (d) => {
                resetLabel(d, obstacle.id, 'numberLabel');
                resetLabel(d, obstacle.id, 'heightLabel');
              })
            }
          >
            {t('obstp.reposicionar')}
          </button>
        </div>
      )}


      <h3>{t('campo.observacao')}</h3>
      <input
        type="text"
        className="full"
        value={obstacle.note}
        disabled={travado}
        placeholder="ex.: liverpool"
        onChange={(e) =>
          apply(
            t('campo.observacao'),
            (d) => setObstacleNote(d, obstacle.id, e.target.value),
            `obs-${obstacle.id}`,
          )
        }
      />
    </>
  );
}
