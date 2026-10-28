import { courseOrder } from '@core/assist/courseRide';
import { formatDistance, pathLength } from '@core/model/path';
import type { CourseDocument, InfoBox, Obstacle } from '@core/model/types';
import { useEffect, useState } from 'react';
import { useDocumentStore } from '@store/documentStore';
import { NumberField } from './NumberField';
import { fieldLabel } from '@core/library/annotations';
import { t } from '@core/i18n/i18n';

/**
 * Valores que o desenho já conhece.
 *
 * Distância é a do traçado desenhado (§19), obstáculos é a contagem de
 * números lançados, e esforços conta cada elemento — a combinação 8ABC é
 * um obstáculo e três esforços. São exatamente os três campos que dão
 * erro quando digitados à mão e depois o percurso muda.
 *
 * Preenche só o que sabe, e só quando pedido: o §44 proíbe validação
 * esportiva, e sobrescrever o que o desenhador digitou seria pior que
 * deixar em branco.
 */
function doDesenho(doc: CourseDocument, corrigidaM?: number): Record<string, string> {
  const obstaculos = doc.objects.filter((o): o is Obstacle => o.kind === 'obstacle');
  const degraus = courseOrder(obstaculos);
  const elementos = degraus.reduce((n, d) => n + d.elements.length, 0);
  const maior = extensaoDesenho(doc);

  const out: Record<string, string> = {
    obstaculos: String(degraus.length),
    esforcos: String(elementos),
  };
  // A extensão corrigida na pista vale mais que a medida no desenho (B-90).
  if (corrigidaM != null) out.distancia = metros(corrigidaM);
  else if (maior > 0) out.distancia = metros(maior);
  return out;
}

/** Comprimento do maior traçado: a extensão medida no desenho. */
function extensaoDesenho(doc: CourseDocument): number {
  return doc.objects.reduce((m, p) => Math.max(m, p.kind === 'path' ? pathLength(p) : 0), 0);
}

const metros = (m: number) => `${formatDistance(m, 0)} m`;

export function InfoBoxPanel({ box }: { box: InfoBox }) {
  const { doc, apply } = useDocumentStore();
  const travado = box.locked;

  const edita = (rotulo: string, recipe: (b: InfoBox) => void, mergeKey?: string) =>
    apply(
      rotulo,
      (d) => {
        const alvo = d.objects.find((o) => o.id === box.id);
        if (alvo?.kind === 'infobox') recipe(alvo);
      },
      mergeKey,
    );

  const preencher = () => {
    const valores = doDesenho(doc, box.distanciaCorrigidaM);
    edita(t('quadrop.preencher'), (b) => {
      for (const campo of b.fields) {
        const v = valores[campo.id];
        if (v != null) campo.value = v;
      }
    });
  };

  return (
    <>
      <div className="row-buttons">
        <button
          disabled={travado}
          title={t('quadrop.preencherDica')}
          onClick={preencher}
        >
          {t('quadrop.preencher')}
        </button>
      </div>

      <Extensao box={box} medidaM={extensaoDesenho(doc)} travado={travado} edita={edita} />

      <h3>{t('quadrop.campos')}</h3>
      <div className="leg-list">
        {box.fields.map((campo, i) => (
          <div className="field-row" key={campo.id}>
            <input
              type="checkbox"
              checked={campo.enabled}
              disabled={travado}
              title={campo.enabled ? t('quadrop.esconder') : t('quadrop.mostrar')}
              onChange={(e) =>
                edita('Campo do quadro', (b) => {
                  b.fields[i]!.enabled = e.target.checked;
                })
              }
            />
            <span className="field-label" title={fieldLabel(campo)}>
              {fieldLabel(campo)}
            </span>
            <input
              type="text"
              value={campo.value}
              disabled={travado || !campo.enabled}
              onChange={(e) =>
                edita(
                  'Valor do quadro',
                  (b) => {
                    b.fields[i]!.value = e.target.value;
                  },
                  `inf-${box.id}-${campo.id}`,
                )
              }
            />
          </div>
        ))}
      </div>

      <h3>{t('quadrop.aparencia')}</h3>
      <NumberField
        label={t('campo.largura')}
        unit="mm"
        value={box.widthMm}
        decimals={0}
        step={2}
        min={30}
        max={280}
        disabled={travado}
        onCommit={(v) => edita('Largura do quadro', (b) => { b.widthMm = v; })}
      />
      <NumberField
        label={t('quadrop.colunas')}
        value={box.columns}
        decimals={0}
        step={1}
        min={1}
        max={4}
        disabled={travado}
        onCommit={(v) => edita('Colunas do quadro', (b) => { b.columns = Math.round(v); })}
      />
      <NumberField
        label={t('campo.letra')}
        unit="mm"
        value={box.style.sizeMm}
        decimals={1}
        step={0.2}
        min={1.5}
        max={10}
        disabled={travado}
        onCommit={(v) => edita('Letra do quadro', (b) => { b.style.sizeMm = v; })}
      />
      <p className="note dim">
        {t('quadrop.nota')}
      </p>
    </>
  );
}

/**
 * Extensão do percurso (B-90): a medida no desenho ao lado da corrigida
 * pelo que foi armado e medido na pista. Informar a corrigida já põe o
 * valor no campo Distância; apagá-la volta para a medida no desenho.
 */
function Extensao({
  box,
  medidaM,
  travado,
  edita,
}: {
  box: InfoBox;
  medidaM: number;
  travado: boolean;
  edita: (rotulo: string, recipe: (b: InfoBox) => void) => void;
}) {
  const corrigida = box.distanciaCorrigidaM;
  const [texto, setTexto] = useState(corrigida != null ? formatDistance(corrigida, 0) : '');
  useEffect(() => setTexto(corrigida != null ? formatDistance(corrigida, 0) : ''), [corrigida]);

  const confirma = () => {
    const limpo = texto.trim().replace(',', '.');
    const valor = limpo === '' ? undefined : Number(limpo);
    if (valor != null && (!Number.isFinite(valor) || valor <= 0)) {
      setTexto(corrigida != null ? formatDistance(corrigida, 0) : '');
      return;
    }
    if (valor === corrigida) return;
    edita(valor == null ? 'Tirar a extensão corrigida' : 'Extensão corrigida', (b) => {
      if (valor == null) delete b.distanciaCorrigidaM;
      else b.distanciaCorrigidaM = valor;
      const campo = b.fields.find((f) => f.id === 'distancia');
      if (!campo) return;
      if (valor != null) campo.value = metros(valor);
      else if (medidaM > 0) campo.value = metros(medidaM);
    });
  };

  const diferenca = corrigida != null && medidaM > 0 ? corrigida - medidaM : null;
  return (
    <>
      <h3>{t('quadrop.extensao')}</h3>
      <div className="extensao">
        <p className="field">
          <span>{t('quadrop.noDesenho')}</span>
          <strong>{medidaM > 0 ? metros(medidaM) : '—'}</strong>
        </p>
        <label className="field">
          <span>{t('quadrop.corrigida')}</span>
          <span className="input-unit">
            <input
              type="text"
              inputMode="decimal"
              placeholder="—"
              value={texto}
              disabled={travado}
              onChange={(e) => setTexto(e.target.value)}
              onBlur={confirma}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              }}
            />
            <em>m</em>
          </span>
        </label>
        {diferenca != null && (
          <p className="note">
            {t('quadrop.diferenca', {
              d: `${diferenca > 0 ? '+' : diferenca < 0 ? '−' : ''}${formatDistance(Math.abs(diferenca), 0)}`,
            })}
          </p>
        )}
        {corrigida == null && (
          <p className="note dim">{t('quadrop.corrigidaNota')}</p>
        )}
      </div>
    </>
  );
}
