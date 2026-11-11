import { courseOrder, phaseStops } from '@core/assist/courseRide';
import { formatDistance, pathLength } from '@core/model/path';
import type { CourseDocument, InfoBox, Obstacle } from '@core/model/types';
import { useEffect, useState } from 'react';
import { useDocumentStore } from '@store/documentStore';
import { NumberField } from './NumberField';
import { fieldLabel, mostraDesempate, temDesempate } from '@core/library/annotations';
import { heightTableLayout, infoBoxLayout } from '@core/model/annotationLayout';
import { pageSize } from '@core/scale/units';
import { ordemQuadro } from '@core/library/desempate';
import { aplicaTempos, aplicaTemposDesempate, FORMATOS_TEMPO, type FormatoTempo } from '@core/library/courseTimes';
import type { MessageKey } from '@core/i18n/messages';
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

  // Desempate (B-92): a ordem e o comprimento do traçado do desempate.
  const desempate = phaseStops(doc, 'desempate');
  if (desempate.length > 0) out.dspOrdem = ordemQuadro(doc);
  const tracado = doc.objects.find((o) => o.kind === 'path' && o.fase === 'desempate');
  if (tracado?.kind === 'path') out.dspDistancia = metros(pathLength(tracado));
  return out;
}

/** Comprimento do maior traçado do percurso: a extensão medida no desenho. */
function extensaoDesenho(doc: CourseDocument): number {
  return doc.objects.reduce((m, p) => Math.max(m, p.kind === 'path' && !p.fase ? pathLength(p) : 0), 0);
}

const metros = (m: number) => `${formatDistance(m, 0)} m`;

/** Algum quadro ou tabela passa da margem de baixo da folha. */
function saiDaFolha(doc: CourseDocument): boolean {
  const limite = pageSize(doc.page).heightMm - doc.page.marginsMm.bottom + 0.5;
  const obstaculos = doc.objects.filter((x): x is Obstacle => x.kind === 'obstacle');
  return doc.objects.some((o) =>
    o.kind === 'infobox'
      ? o.posMm.y + infoBoxLayout(o).heightMm > limite
      : o.kind === 'heighttable' && o.posMm.y + heightTableLayout(o, obstaculos).heightMm > limite,
  );
}

/**
 * O quadro cresceu ou encolheu (o bloco do desempate entrou ou saiu): o
 * que estava logo abaixo dele, na mesma faixa da folha, acompanha. Sem
 * isto o quadro maior cobria a tabela de alturas posta embaixo dele.
 */
function empurraAbaixo(doc: CourseDocument, box: InfoBox, antes: number, depois: number): void {
  const delta = depois - antes;
  if (Math.abs(delta) < 0.01) return;
  const fundo = box.posMm.y + antes;
  const x0 = box.posMm.x;
  const x1 = box.posMm.x + box.widthMm;
  for (const o of doc.objects) {
    if (o.id === box.id || (o.kind !== 'heighttable' && o.kind !== 'infobox')) continue;
    const largura =
      o.kind === 'infobox'
        ? o.widthMm
        : heightTableLayout(o, doc.objects.filter((x): x is Obstacle => x.kind === 'obstacle')).widthMm;
    const naFaixa = o.posMm.x < x1 && o.posMm.x + largura > x0;
    if (naFaixa && o.posMm.y >= fundo - 1) o.posMm = { ...o.posMm, y: o.posMm.y + delta };
  }
}

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
      aplicaTempos(b);
      aplicaTemposDesempate(b);
    });
  };

  const desempate = temDesempate(box);
  const ligaDesempate = (liga: boolean) => {
    const valores = doDesenho(doc, box.distanciaCorrigidaM);
    apply(t('dsp.noQuadro'), (d) => {
      const b = d.objects.find((o) => o.id === box.id);
      if (b?.kind !== 'infobox') return;
      const antes = infoBoxLayout(b).heightMm;
      mostraDesempate(b, liga);
      empurraAbaixo(d, b, antes, infoBoxLayout(b).heightMm);
      if (!liga) return;
      for (const id of ['dspOrdem', 'dspDistancia']) {
        const campo = b.fields.find((f) => f.id === id);
        if (campo && valores[id] != null) campo.value = valores[id]!;
      }
      // Começa com a velocidade do percurso; o desenhador troca se for outra.
      const vel = b.fields.find((f) => f.id === 'dspVelocidade');
      if (vel && vel.value.trim() === '') vel.value = b.fields.find((f) => f.id === 'velocidade')?.value ?? '';
      aplicaTemposDesempate(b);
    });
  };

  // A ordem do desempate vem do desenho (syncQuadroDesempate): não se digita.
  const automatico = (id: string) => id === 'dspOrdem';
  const linha = (campo: InfoBox['fields'][number], i: number) => (
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
        readOnly={automatico(campo.id)}
        title={automatico(campo.id) ? t('dsp.ordemAutomatica') : undefined}
        onChange={(e) =>
          edita(
            'Valor do quadro',
            (b) => {
              b.fields[i]!.value = e.target.value;
              // Os tempos acompanham a distância e a velocidade.
              if (campo.id === 'distancia' || campo.id === 'velocidade') aplicaTempos(b);
              if (['velocidade', 'dspDistancia', 'dspVelocidade'].includes(campo.id)) aplicaTemposDesempate(b);
            },
            `inf-${box.id}-${campo.id}`,
          )
        }
      />
    </div>
  );

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

      <Tempos box={box} travado={travado} edita={edita} />

      <label className="check">
        <input
          type="checkbox"
          checked={desempate}
          disabled={travado}
          onChange={(e) => ligaDesempate(e.target.checked)}
        />
        {t('dsp.noQuadro')}
      </label>
      {desempate && <p className="note dim">{t('dsp.noQuadroNota')}</p>}
      {saiDaFolha(doc) && <p className="state warn">{t('dsp.naoCabe')}</p>}

      <h3>{t('quadrop.campos')}</h3>
      <div className="leg-list">
        {box.fields.map((campo, i) => (campo.id.startsWith('dsp') ? null : linha(campo, i)))}
      </div>
      {box.fields.some((f) => f.id.startsWith('dsp')) && (
        <>
          <h4>{t('dsp.titulo')}</h4>
          <div className="leg-list">
            {box.fields.map((campo, i) => (campo.id.startsWith('dsp') ? linha(campo, i) : null))}
          </div>
        </>
      )}

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
      aplicaTempos(b);
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

const ROTULO_FORMATO: Record<FormatoTempo, MessageKey> = {
  A: 'quadrop.fmtA',
  ideal: 'quadrop.fmtIdeal',
  faixa: 'quadrop.fmtFaixa',
  C: 'quadrop.fmtC',
};

/**
 * Tempos do quadro (B-25), pelas regras da CBH, como a calculadora do
 * SAPH. Escolher o formato já calcula; depois, mudar a distância ou a
 * velocidade recalcula sozinho.
 */
function Tempos({
  box,
  travado,
  edita,
}: {
  box: InfoBox;
  travado: boolean;
  edita: (rotulo: string, recipe: (b: InfoBox) => void) => void;
}) {
  const formato = box.tempos?.formato ?? 'A';
  const [falhou, setFalhou] = useState(false);

  const calcula = (f: FormatoTempo) => {
    // Sem distância ou velocidade não há o que gravar: só avisa.
    const teste = structuredClone(box);
    teste.tempos = { formato: f };
    const ok = aplicaTempos(teste);
    setFalhou(!ok);
    edita(t('quadrop.calcular'), (b) => {
      b.tempos = { formato: f };
      aplicaTempos(b);
      if (temDesempate(b)) aplicaTemposDesempate(b);
    });
  };

  return (
    <>
      <h3>{t('quadrop.tempos')}</h3>
      <label className="field">
        <span>{t('quadrop.formato')}</span>
        <select
          value={formato}
          disabled={travado}
          onChange={(e) => calcula(e.target.value as FormatoTempo)}
        >
          {FORMATOS_TEMPO.map((f) => (
            <option key={f} value={f}>
              {t(ROTULO_FORMATO[f])}
            </option>
          ))}
        </select>
      </label>
      <div className="row-buttons">
        <button disabled={travado} onClick={() => calcula(formato)}>
          {t('quadrop.calcular')}
        </button>
      </div>
      <p className={falhou ? 'note' : 'note dim'}>
        {falhou ? t('quadrop.semTempos') : t('quadrop.temposNota')}
      </p>
    </>
  );
}
