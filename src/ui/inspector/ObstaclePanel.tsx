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
  setSpread,
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
import { NumberField } from './NumberField';
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

      <label className="field" title={t('obstp.setaDica')}>
        <span>{t('obstp.sentido')}</span>
        <select
          value={!obstacle.arrow.visible ? 'sem' : obstacle.arrow.both ? 'duplo' : obstacle.arrow.reversed ? 'inverso' : 'frente'}
          disabled={travado}
          onChange={(e) => {
            const v = e.target.value;
            apply('Sentido do salto', (d) =>
              setArrow(d, obstacle.id, {
                visible: v !== 'sem',
                both: v === 'duplo',
                reversed: v === 'inverso' ? true : v === 'frente' ? false : obstacle.arrow.reversed,
              }),
            );
          }}
        >
          <option value="frente">{t('obstp.paraFrente')}</option>
          <option value="inverso">{t('obstp.invertido')}</option>
          <option value="duplo">{t('obstp.duplo')}</option>
          <option value="sem">{t('obstp.semSeta')}</option>
        </select>
      </label>
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
