import type { BordaDaCaixa, FonteDoTitulo, TituloDaFolha } from '@core/model/types';
import { tituloLayout } from '@core/model/annotationLayout';
import { FONTES, familiaCss } from '@render/fontes';
import { useDocumentStore } from '@store/documentStore';
import { NumberField } from './NumberField';
import { t } from '@core/i18n/i18n';
import { folhaAtiva, temDuasFolhas } from '@core/library/folhas';

/**
 * Caixa de texto da folha (B-106). O texto se escreve no próprio papel
 * (duplo clique); aqui ficam a letra e o alinhamento, e o texto também,
 * para quem preferir.
 */
export function TituloPanel({ titulo }: { titulo: TituloDaFolha }) {
  const { doc, apply } = useDocumentStore();
  const duas = temDuasFolhas(doc);
  const ativa = folhaAtiva(doc);
  const travado = titulo.locked;
  const edita = (rotulo: string, recipe: (o: TituloDaFolha) => void, mergeKey?: string) =>
    apply(
      rotulo,
      (d) => {
        const o = d.objects.find((x) => x.id === titulo.id);
        if (o?.kind === 'titulo') recipe(o);
      },
      mergeKey,
    );

  return (
    <>
      <textarea
        className="full"
        rows={Math.min(5, Math.max(2, titulo.text.split('\n').length))}
        value={titulo.text}
        disabled={travado}
        aria-label={t('campo.texto')}
        onChange={(e) => edita(t('campo.texto'), (o) => { o.text = e.target.value; }, `tit-${titulo.id}`)}
      />

      <label className="field">
        <span>{t('titulo.fonte')}</span>
        <select
          value={titulo.fonte}
          disabled={travado}
          onChange={(e) => edita(t('titulo.fonte'), (o) => { o.fonte = e.target.value as FonteDoTitulo; })}
        >
          {FONTES.map((f) => (
            <option key={f.id} value={f.id} style={{ fontFamily: familiaCss(f.id) }}>{f.nome}</option>
          ))}
        </select>
      </label>

      <NumberField
        label={t('campo.tamanho')}
        unit="mm"
        value={titulo.sizeMm}
        decimals={1}
        step={0.5}
        min={1}
        max={60}
        disabled={travado}
        onCommit={(v) => edita(t('campo.tamanho'), (o) => { o.sizeMm = v; })}
      />

      <div className="field">
        <span>{t('titulo.estilo')}</span>
        <div className="titulo-estilo">
          <div className="segmentado" role="group" aria-label={t('titulo.estilo')}>
            <button
              className={titulo.bold ? 'active' : ''}
              aria-pressed={titulo.bold}
              title={t('titulo.negrito')}
              disabled={travado}
              onClick={() => edita(t('titulo.negrito'), (o) => { o.bold = !o.bold; })}
            >
              <b>N</b>
            </button>
            <button
              className={titulo.italic ? 'active' : ''}
              aria-pressed={titulo.italic}
              title={t('titulo.italico')}
              disabled={travado}
              onClick={() => edita(t('titulo.italico'), (o) => { o.italic = !o.italic; })}
            >
              <i>I</i>
            </button>
          </div>
          <div className="segmentado" role="radiogroup" aria-label={t('textop.alinhamento')}>
            {(
              [
                ['start', '⇤', 'textop.esquerda'],
                ['middle', '↔', 'textop.centro'],
                ['end', '⇥', 'textop.direita'],
              ] as const
            ).map(([v, icone, rotulo]) => (
              <button
                key={v}
                role="radio"
                aria-checked={titulo.align === v}
                className={titulo.align === v ? 'active' : ''}
                title={t(rotulo)}
                aria-label={t(rotulo)}
                disabled={travado}
                onClick={() => edita(t('textop.alinhamento'), (o) => { o.align = v; })}
              >
                {icone}
              </button>
            ))}
          </div>
          <input
            type="color"
            value={titulo.color}
            title={t('campo.cor')}
            aria-label={t('campo.cor')}
            disabled={travado}
            onChange={(e) => edita(t('campo.cor'), (o) => { o.color = e.target.value; }, `cor-tit-${titulo.id}`)}
          />
        </div>
      </div>

      <NumberField
        label={t('campo.largura')}
        unit="mm"
        value={titulo.widthMm}
        decimals={0}
        step={5}
        min={5}
        disabled={travado}
        onCommit={(v) => edita(t('campo.largura'), (o) => { o.widthMm = Math.max(5, v); })}
      />
      <NumberField
        label={t('titulo.altura')}
        unit="mm"
        value={tituloLayout(titulo).heightMm}
        decimals={0}
        step={5}
        min={1}
        disabled={travado}
        onCommit={(v) => edita(t('titulo.altura'), (o) => { o.heightMm = Math.max(1, v); })}
      />

      <label className="field">
        <span>{t('titulo.borda')}</span>
        <select
          value={titulo.borda?.estilo ?? ''}
          disabled={travado}
          onChange={(e) => {
            const estilo = e.target.value as BordaDaCaixa['estilo'] | '';
            edita(t('titulo.borda'), (o) => {
              if (!estilo) delete o.borda;
              else o.borda = { espessuraMm: 0.35, cor: '#111111', ...o.borda, estilo };
            });
          }}
        >
          <option value="">{t('titulo.semBorda')}</option>
          <option value="continua">{t('titulo.continua')}</option>
          <option value="tracejada">{t('titulo.tracejada')}</option>
          <option value="pontilhada">{t('titulo.pontilhada')}</option>
        </select>
      </label>
      {titulo.borda && (
        <div className="titulo-estilo">
          <NumberField
            label={t('titulo.espessura')}
            unit="mm"
            value={titulo.borda.espessuraMm}
            decimals={2}
            step={0.05}
            min={0.05}
            max={5}
            disabled={travado}
            onCommit={(v) => edita(t('titulo.espessura'), (o) => { if (o.borda) o.borda.espessuraMm = Math.min(5, Math.max(0.05, v)); })}
          />
          <input
            type="color"
            value={titulo.borda.cor}
            title={t('titulo.corBorda')}
            aria-label={t('titulo.corBorda')}
            disabled={travado}
            onChange={(e) => edita(t('titulo.corBorda'), (o) => { if (o.borda) o.borda.cor = e.target.value; }, `borda-tit-${titulo.id}`)}
          />
        </div>
      )}

      <div className="field" title={t('titulo.fundoDica')}>
        <span>{t('titulo.fundo')}</span>
        <div className="titulo-estilo">
          <input
            type="checkbox"
            checked={!!titulo.fundo}
            aria-label={t('titulo.fundo')}
            disabled={travado}
            onChange={(e) => {
              const liga = e.target.checked;
              edita(t('titulo.fundo'), (o) => {
                if (liga) o.fundo = '#ffffff';
                else delete o.fundo;
              });
            }}
          />
          {titulo.fundo && (
            <input
              type="color"
              value={titulo.fundo}
              title={t('titulo.fundo')}
              aria-label={t('titulo.fundo')}
              disabled={travado}
              onChange={(e) => edita(t('titulo.fundo'), (o) => { o.fundo = e.target.value; }, `fundo-tit-${titulo.id}`)}
            />
          )}
        </div>
      </div>

      {duas && (
        <label className="check" title={t('titulo.duasFolhasDica')}>
          <input
            type="checkbox"
            checked={!titulo.folha}
            disabled={travado}
            onChange={(e) => {
              const nasDuas = e.target.checked;
              edita(t('titulo.duasFolhas'), (o) => {
                if (nasDuas) delete o.folha;
                else o.folha = ativa;
              });
            }}
          />
          {t('titulo.duasFolhas')}
        </label>
      )}
    </>
  );
}
