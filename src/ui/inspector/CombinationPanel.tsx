import { useState } from 'react';
import {
  alignCombination,
  ARC_MAX_DEG,
  arcGaps,
  COMBINATION_GAP,
  confirmCombination,
  currentGaps,
  isStraightLine,
  orderAlongLine,
  sameCombination,
  setArcGap,
  splitCombination,
  type ArcGap,
} from '@core/commands/alignOps';
import { obstacleLabel } from '@core/library/obstacles';
import { canSetDistance, courseDistances, setCourseDistance } from '@core/commands/distanceOps';
import type { CoursePath, Obstacle } from '@core/model/types';
import { useDocumentStore } from '@store/documentStore';
import { ArcGapPreview } from './ArcGapPreview';
import { LinkRow } from './LinkRow';
import { NumberField } from './NumberField';

/**
 * Composto ou linha (decisões 71 e 80).
 *
 * Duas escolhas no topo, que se trocam a qualquer momento, conforme o
 * planejamento evolui:
 * - COMPOSTO: os elementos ganham o mesmo número e as letras A, B, C; o
 *   vão de vara a vara fica entre 7 e 12 m. Voltar para Linha desfaz as
 *   letras e renumera (5A, 5B viram 5 e 6).
 * - LINHA: números próprios, e a linha é RETA (todos no eixo do primeiro)
 *   ou CURVA. Na curva sem traçado, cada vão é um arco que sai da vara de
 *   saída do anterior (B-81, como no pé de galinha da ginástica): a
 *   distância se mede sobre o arco, e a abertura — no campo ou arrastando
 *   na prévia — leva o seguinte de lado sem mudar a distância.
 *
 * A distância se mede de VARA A VARA, e digitar outra JÁ ajusta o croqui.
 * A ordem é a da NUMERAÇÃO do percurso, não a da geometria.
 */
export function CombinationPanel({ obstacles }: { obstacles: Obstacle[] }) {
  const { doc, apply } = useDocumentStore();
  const ordenados = orderAlongLine(obstacles);
  const ids = ordenados.map((o) => o.id);
  const travado = ordenados.some((o) => o.locked);
  const jaComposto =
    ordenados.length >= 2 && ordenados.every((o, i) => i === 0 || sameCombination(ordenados[i - 1]!, o));
  // Reta ou curva é escolha do painel; começa pelo que o croqui já é.
  const [curva, setCurva] = useState(() => !isStraightLine(ordenados));
  const emCurva = !jaComposto && curva;
  const vaos = currentGaps(ordenados);
  const arcos = arcGaps(ordenados);

  // Na curva com um traçado passando pelos dois, a medida é a do traçado,
  // e quem anda é o de destino, sobre ele (B-60).
  const peloTracado = (i: number) => {
    if (!emCurva) return null;
    const chave = `${ordenados[i]?.id}>${ordenados[i + 1]?.id}`;
    for (const p of doc.objects) {
      if (p.kind !== 'path') continue;
      const d = courseDistances(doc, p).find((x) => x.key === chave);
      if (d && canSetDistance(doc, p, d)) return { path: p as CoursePath, d };
    }
    return null;
  };

  const numeroProposto = (() => {
    const ns = ordenados.map((o) => parseInt(o.number, 10)).filter((n) => Number.isFinite(n));
    if (ns.length) return String(Math.min(...ns));
    const todos = doc.objects
      .filter((o): o is Obstacle => o.kind === 'obstacle')
      .map((o) => parseInt(o.number, 10))
      .filter((n) => Number.isFinite(n));
    return String((todos.length ? Math.max(...todos) : 0) + 1);
  })();

  // Vãos em curva que andam pelo arco: os que não têm traçado passando.
  const curvas = ordenados.slice(1).map((_, i) => emCurva && !peloTracado(i));
  const curvaArco = (indice: number, gap: ArcGap, mergeKey?: string) =>
    apply('Curva da linha', (d) => setArcGap(d, ids, indice, gap), mergeKey);

  const ajusta = (indice: number, metros: number) => {
    const t = peloTracado(indice);
    if (t) {
      apply('Distância da linha', (d) => {
        setCourseDistance(d, t.path.id, t.d.key, metros);
      });
      return;
    }
    if (curvas[indice]) {
      curvaArco(indice, { gapM: metros, angleDeg: arcos[indice]?.angleDeg ?? 0 });
      return;
    }
    apply(jaComposto ? 'Distância do composto' : 'Distância da linha', (d) =>
      alignCombination(
        d,
        ids,
        vaos.map((v, i) => (i === indice ? metros : v)),
      ),
    );
  };

  const nome = (o: Obstacle, i: number) => obstacleLabel(o) || `elemento ${i + 1}`;
  const podeComposto = ordenados.length >= 2 && ordenados.length <= 3;

  return (
    <section className="object-panel">
      <h3>Composto ou linha</h3>

      <div className="row-buttons">
        <button
          className={jaComposto ? 'active' : ''}
          disabled={travado || !podeComposto}
          title={
            podeComposto
              ? `Mesmo número e letras na ordem do salto (${ordenados.map((_, i) => `${numeroProposto}${'ABC'[i]}`).join(', ')})`
              : 'Composto tem 2 ou 3 elementos'
          }
          onClick={() => !jaComposto && apply('Composto', (d) => confirmCombination(d, ids))}
        >
          Composto
        </button>
        <button
          className={!jaComposto ? 'active' : ''}
          disabled={travado}
          title="Números próprios, em linha reta ou curva"
          onClick={() => jaComposto && apply('Linha', (d) => splitCombination(d, ids))}
        >
          Linha
        </button>
      </div>

      {!jaComposto && (
        <div className="row-buttons">
          <button className={!curva ? 'active' : ''} onClick={() => setCurva(false)}>
            Reta
          </button>
          <button className={curva ? 'active' : ''} onClick={() => setCurva(true)}>
            Curva
          </button>
        </div>
      )}

      <p className="note">Na ordem do percurso: {ordenados.map(nome).join(' - ')}</p>

      {ordenados.slice(1).map((o, i) => {
        const composto = sameCombination(ordenados[i]!, o);
        const t = peloTracado(i);
        const arco = curvas[i] ? arcos[i] : undefined;
        const metros = t ? t.d.meters : arco ? arco.gapM : (vaos[i] ?? 0);
        return (
          <div key={o.id} className={arco ? 'arc-gap' : undefined}>
            <NumberField
              label={`${nome(ordenados[i]!, i)} - ${nome(o, i + 1)}${arco ? ' (na curva)' : ''}`}
              unit="m"
              value={Math.round(metros * 100) / 100}
              decimals={2}
              step={0.1}
              min={composto ? COMBINATION_GAP.min : undefined}
              max={composto ? COMBINATION_GAP.max : undefined}
              disabled={travado}
              onCommit={(v) => ajusta(i, v)}
            />
            {arco && (
              <NumberField
                label="Abertura"
                unit="°"
                value={Math.round(arco.angleDeg)}
                decimals={0}
                step={1}
                min={-ARC_MAX_DEG}
                max={ARC_MAX_DEG}
                disabled={travado || o.locked}
                onCommit={(v) => curvaArco(i, { gapM: arco.gapM, angleDeg: v })}
              />
            )}
          </div>
        );
      })}

      {curvas.some(Boolean) && (
        <ArcGapPreview
          ordenados={ordenados}
          curvas={curvas}
          travado={travado}
          onAbertura={(i, gap) => curvaArco(i, gap, `arco-${ids.join('-')}-${i}`)}
        />
      )}

      {/* Na curva não há o que alinhar: cada um mantém o próprio ângulo. */}
      {!emCurva && (
        <div className="row-buttons">
          <button
            disabled={travado}
            title="Todos no eixo do primeiro e na mesma inclinação, sem mudar as distâncias"
            onClick={() => apply('Alinhar em reta', (d) => alignCombination(d, ids, vaos))}
          >
            Alinhar em reta
          </button>
        </div>
      )}

      <LinkRow ids={ids} />

      <p className="note dim">
        Da vara de saída de um até a vara de entrada do seguinte. O primeiro
        elemento não se move. No composto (5A, 5B...) o vão fica entre{' '}
        {COMBINATION_GAP.min} e {COMBINATION_GAP.max} m; na linha é livre. Na
        curva, a medida é sobre o arco que sai do anterior na direção do
        salto, ou sobre o traçado quando ele passa pelos dois; abertura
        negativa vira à esquerda.
      </p>
    </section>
  );
}
