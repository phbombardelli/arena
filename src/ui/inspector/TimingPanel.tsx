import { setTimingLine } from '@core/commands/timingOps';
import { clampTimingDistance, TIMING_DISTANCE } from '@core/library/timing';
import { obstacleLabel } from '@core/library/obstacles';
import type { TimingLine, WingStyle } from '@core/model/types';
import { useDocumentStore } from '@store/documentStore';
import { NumberField } from './NumberField';
import { t } from '@core/i18n/i18n';

/**
 * Painel da partida/chegada, enxuto (B-53). A linha é solidária ao
 * obstáculo — o eixo, o giro e o sentido vêm dele —, então aqui não há
 * inverter direção, suporte, rotação nem posição: só a distância até a
 * vara, o papel, a largura, o texto e o traço.
 */
export function TimingPanel({ line }: { line: TimingLine }) {
  const { doc, apply } = useDocumentStore();
  const travado = line.locked;
  const dono = line.anchor
    ? doc.objects.find((o) => o.id === line.anchor!.obstacleId)
    : undefined;

  return (
    <>
      {line.anchor && dono?.kind === 'obstacle' ? (
        <>
          <NumberField
            label={t('campo.distancia')}
            unit="m"
            value={line.anchor.distanceM}
            decimals={1}
            step={TIMING_DISTANCE.passo}
            min={TIMING_DISTANCE.min}
            max={TIMING_DISTANCE.max}
            disabled={travado}
            onCommit={(v) =>
              apply('Distância da cruzada', (d) => {
                const alvo = d.objects.find((o) => o.id === line.id);
                if (alvo?.kind === 'timing' && alvo.anchor) {
                  alvo.anchor.distanceM = clampTimingDistance(v);
                }
              })
            }
          />
          {/* Arrastar move a linha no desenho a cada passo: é o jeito de
              procurar a distância olhando o croqui, e não o número. */}
          <input
            className="timing-slider"
            type="range"
            min={TIMING_DISTANCE.min}
            max={TIMING_DISTANCE.max}
            step={TIMING_DISTANCE.passo}
            value={line.anchor.distanceM}
            disabled={travado}
            onChange={(e) => {
              const v = clampTimingDistance(Number(e.target.value));
              apply(
                'Distância da cruzada',
                (d) => {
                  const alvo = d.objects.find((o) => o.id === line.id);
                  if (alvo?.kind === 'timing' && alvo.anchor) alvo.anchor.distanceM = v;
                },
                // Arrastar o controle é um gesto só no histórico.
                `cruzada-${line.id}`,
              );
            }}
          />
          <p className="note">
            {t(line.role === 'start' ? 'timingp.notaPartida' : 'timingp.notaChegada', {
              obstaculo: obstacleLabel(dono) || t('alturas.semNumero'),
            })}
          </p>
        </>
      ) : (
        <p className="note dim">
          {t('timingp.solta')}
        </p>
      )}

      <label className="field">
        <span>{t('timingp.papel')}</span>
        <select
          value={line.role}
          disabled={travado}
          onChange={(e) =>
            apply('Papel da linha', (d) =>
              setTimingLine(d, line.id, { role: e.target.value as TimingLine['role'] }),
            )
          }
        >
          <option value="start">{t('timingp.partida')}</option>
          <option value="finish">{t('timingp.chegada')}</option>
        </select>
      </label>

      <NumberField
        label={t('campo.largura')}
        unit="m"
        value={line.widthM}
        decimals={2}
        step={0.5}
        min={0.5}
        disabled={travado}
        onCommit={(v) => apply('Largura da linha', (d) => setTimingLine(d, line.id, { widthM: v }))}
      />

      <label className="field">
        <span>{t('campo.texto')}</span>
        <input
          type="text"
          value={line.label}
          disabled={travado}
          onChange={(e) =>
            apply(
              'Texto da linha',
              (d) => setTimingLine(d, line.id, { label: e.target.value }),
              `timlabel-${line.id}`,
            )
          }
        />
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={line.labelVisible}
          disabled={travado}
          onChange={(e) =>
            apply(t('timingp.textoDesenho'), (d) =>
              setTimingLine(d, line.id, { labelVisible: e.target.checked }),
            )
          }
        />
        {t('timingp.textoDesenho')}
      </label>

      <h3>{t('timingp.passagem')}</h3>
      <label className="check">
        <input
          type="checkbox"
          checked={line.arrow.visible}
          disabled={travado}
          onChange={(e) =>
            apply('Seta da linha', (d) =>
              setTimingLine(d, line.id, { arrow: { ...line.arrow, visible: e.target.checked } }),
            )
          }
        />
        {t('timingp.mostrarSeta')}
      </label>
      <label className="field">
        <span>{t('timingp.corTraco')}</span>
        <input
          type="color"
          value={line.style.color}
          disabled={travado}
          onChange={(e) =>
            apply(
              'Cor da linha',
              (d) => setTimingLine(d, line.id, { style: { ...line.style, color: e.target.value } }),
              `timcor-${line.id}`,
            )
          }
        />
      </label>
      <label className="field">
        <span>{t('campo.traco')}</span>
        <select
          value={line.style.dash}
          disabled={travado}
          onChange={(e) =>
            apply('Traço da linha', (d) =>
              setTimingLine(d, line.id, {
                style: { ...line.style, dash: e.target.value as TimingLine['style']['dash'] },
              }),
            )
          }
        >
          <option value="solid">{t('tracadop.continuo')}</option>
          <option value="dashed">{t('tracadop.tracejado')}</option>
          <option value="dotted">{t('tracadop.pontilhado')}</option>
          <option value="dashdot">{t('tracadop.tracoPonto')}</option>
        </select>
      </label>

    </>
  );
}

export type { WingStyle };
