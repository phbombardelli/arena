import type { CourseDocument, ObjectId, Obstacle, SceneObject } from '@core/model/types';
import { isLayerVisible } from '@core/model/document';
import { boundsIn, objectScope } from '@core/model/transform';
import type { ObjectScope } from '@core/model/types';
import { LAYER_ORDER } from '@core/model/types';
import { pageSize } from '@core/scale/units';
import { ArenaLayer } from './layers/ArenaLayer';
import { GridLayer } from './layers/GridLayer';
import { measureFrame } from '@core/model/measureFrame';
import { ImageLayer } from './layers/ImageLayer';
import { ObstacleLayer } from './layers/ObstacleLayer';
import { OrnamentLayer } from './layers/OrnamentLayer';
import { TextLayer } from './layers/TextLayer';
import { InfoBoxLayer } from './layers/InfoBoxLayer';
import { HeightTableLayer } from './layers/HeightTableLayer';
import { ScaleLegend } from './layers/ScaleLegend';
import { PathLayer } from './layers/PathLayer';
import { TimingLayer } from './layers/TimingLayer';
import { LogoLayer } from './layers/LogoLayer';
import { color, stroke } from './style/tokens';
import { useMemo } from 'react';
import { layoutLabels } from '@core/assist/labelLayout';

/** Ordem de empilhamento: camada primeiro, depois z dentro da camada. */
function sortForRender(doc: CourseDocument): SceneObject[] {
  return [...doc.objects].sort((a, b) => {
    const byLayer = LAYER_ORDER.indexOf(a.layer) - LAYER_ORDER.indexOf(b.layer);
    return byLayer !== 0 ? byLayer : a.z - b.z;
  });
}

export type RenderMode = 'screen' | 'paper';

export interface RenderOptions {
  mode: RenderMode;
  doc: CourseDocument;
  selection: ObjectId[];
  /** Área visível em mm; no modo papel é a própria página. */
  viewBoxMm: { x: number; y: number; width: number; height: number };
  metersPerPixel: number;
  showPageFrame: boolean;
  /**
   * Escopo em edição. Objetos de outro escopo viram fundo: não recebem
   * clique e ficam esmaecidos. `null` no modo papel, onde tudo é desenho.
   */
  editScope?: ObjectScope | null;
  onObjectPointerDown?: (id: ObjectId, e: React.PointerEvent) => void;
}

/**
 * Fonte única de renderização: a tela, a impressão e a exportação em PDF
 * consomem esta mesma função. Não existe um gerador de PDF paralelo que
 * possa divergir do que se vê na tela.
 */
export function RenderDocument(opts: RenderOptions) {
  const { doc, mode, selection, viewBoxMm, metersPerPixel, showPageFrame } = opts;
  const { widthMm, heightMm } = pageSize(doc.page);
  const isSelected = (id: ObjectId) => selection.includes(id);
  // Um leiaute só para todos os rótulos automáticos: cada um foge dos
  // outros, então precisam ser decididos juntos (decisão 55).
  const rotulos = useMemo(() => layoutLabels(doc), [doc]);
  const quadro = useMemo(() => measureFrame(doc), [doc]);

  const desenha = (obj: SceneObject) => {
        if (!isLayerVisible(doc, obj.layer) || !obj.visible) return null;

        // Fora do modo ativo o objeto é cenário: some do alcance do mouse.
        const ativo = opts.editScope == null || objectScope(obj) === opts.editScope;
        const onPointerDown =
          ativo && opts.onObjectPointerDown
            ? (e: React.PointerEvent) => opts.onObjectPointerDown!(obj.id, e)
            : undefined;
        const conteudo = (() => {
        switch (obj.kind) {
          case 'arena':
            return (
              <ArenaLayer
                key={obj.id}
                arena={obj}
                printScale={doc.page.printScale}
                originMm={doc.originMm}
                selected={isSelected(obj.id)}
                onPointerDown={onPointerDown}
              />
            );
          case 'image':
            return (
              <ImageLayer
                key={obj.id}
                image={obj}
                asset={doc.assets[obj.assetId]}
                printScale={doc.page.printScale}
                originMm={doc.originMm}
                onPointerDown={onPointerDown}
              />
            );
          case 'obstacle':
            return (
              <ObstacleLayer
                key={obj.id}
                obstacle={obj}
                printScale={doc.page.printScale}
                originMm={doc.originMm}
                numberAt={rotulos.number.get(obj.id)}
                heightsAt={rotulos.heights.get(obj.id)}
                onPointerDown={onPointerDown}
              />
            );
          case 'path':
            return (
              <PathLayer
                key={obj.id}
                path={obj}
                obstacles={doc.objects.filter((o): o is Obstacle => o.kind === 'obstacle')}
                distanceAt={rotulos.distances.get(obj.id)}
                printScale={doc.page.printScale}
                originMm={doc.originMm}
                onPointerDown={onPointerDown}
              />
            );
          case 'timing':
            return (
              <TimingLayer
                key={obj.id}
                line={obj}
                printScale={doc.page.printScale}
                originMm={doc.originMm}
                labelAt={rotulos.timing.get(obj.id)}
                onPointerDown={onPointerDown}
              />
            );
          case 'ornament':
            return (
              <OrnamentLayer
                key={obj.id}
                ornament={obj}
                printScale={doc.page.printScale}
                originMm={doc.originMm}
                onPointerDown={onPointerDown}
              />
            );
          case 'text':
            return (
              <TextLayer
                key={obj.id}
                label={obj}
                printScale={doc.page.printScale}
                originMm={doc.originMm}
                onPointerDown={onPointerDown}
              />
            );
          case 'logo':
            return (
              <LogoLayer
                key={obj.id}
                logo={obj}
                asset={doc.assets[obj.assetId]}
                onPointerDown={onPointerDown}
              />
            );
          case 'infobox':
            return <InfoBoxLayer key={obj.id} box={obj} onPointerDown={onPointerDown} />;
          case 'heighttable':
            return (
              <HeightTableLayer
                key={obj.id}
                table={obj}
                obstacles={doc.objects.filter((o): o is Obstacle => o.kind === 'obstacle')}
                onPointerDown={onPointerDown}
              />
            );
          default:
            return null; // demais tipos entram nas fases seguintes
        }
        })();

        if (conteudo === null) return null;
        // Área de clique folgada (B-50): a envoltória do objeto mais 9 px
        // de TELA, por baixo do desenho dele. Linha de partida, ornamento e
        // texto pequenos viravam fios em escala grande.
        const folga = onPointerDown && GENEROUS_HIT.has(obj.kind) ? hitBox(doc, obj, onPointerDown) : null;
        if (folga) {
          return (
            <g key={obj.id}>
              {folga}
              {conteudo}
            </g>
          );
        }
        return ativo ? (
          conteudo
        ) : (
          <g key={obj.id} pointerEvents="none" opacity={0.45}>
            {conteudo}
          </g>
        );
  };
  // Imagem de fundo e pista primeiro; a grade entra entre elas e o resto.
  const ordem = sortForRender(doc);
  const fundo = ordem.filter((o) => o.layer === 'background' || o.layer === 'arena');
  const frente = ordem.filter((o) => o.layer !== 'background' && o.layer !== 'arena');

  return (
    <>
      {mode === 'screen' && showPageFrame && (
        <g data-layer="page" pointerEvents="none">
          <rect
            x={0}
            y={0}
            width={widthMm}
            height={heightMm}
            fill={color.paper}
            stroke="#9aa0a6"
            strokeWidth={stroke.thin}
          />
          <rect
            x={doc.page.marginsMm.left}
            y={doc.page.marginsMm.top}
            width={widthMm - doc.page.marginsMm.left - doc.page.marginsMm.right}
            height={heightMm - doc.page.marginsMm.top - doc.page.marginsMm.bottom}
            fill="none"
            stroke="#c8ccd0"
            strokeWidth={stroke.hairline}
            strokeDasharray="2 2"
          />
        </g>
      )}
      {mode === 'paper' && (
        <rect x={0} y={0} width={widthMm} height={heightMm} fill={color.paper} />
      )}


      {fundo.map(desenha)}

      {/* A grade sai na folha como aparece na tela (decisão 60). Fica
          por cima do piso da pista e por baixo de todo o resto. */}
      <GridLayer
        grid={doc.grid}
        printScale={doc.page.printScale}
        originMm={doc.originMm}
        frame={quadro}
        viewBoxMm={viewBoxMm}
        metersPerPixel={mode === 'paper' ? 0 : metersPerPixel}
      />

      {frente.map(desenha)}

      {/* Por último, para a legenda nunca ficar debaixo de um objeto. */}
      <ScaleLegend page={doc.page} />
    </>
  );
}

/** Folga da área de clique, em pixels de tela (como a dos obstáculos). */
const HIT_MARGIN_PX = 9;

/** Tipos que ganham a área de clique pela envoltória. Obstáculo, pista e
 * traçado têm a sua, feita sob medida na própria camada. */
const GENEROUS_HIT = new Set<SceneObject['kind']>(['timing', 'ornament', 'text', 'infobox', 'heighttable', 'logo']);

function hitBox(doc: CourseDocument, obj: SceneObject, onPointerDown: (e: React.PointerEvent) => void) {
  const b = boundsIn(doc, obj);
  const k = 1000 / doc.page.printScale;
  const x = doc.originMm.x + b.min.x * k;
  const y = doc.originMm.y + b.min.y * k;
  return (
    <rect
      data-part="hit-area"
      x={x}
      y={y}
      width={Math.max(0.01, (b.max.x - b.min.x) * k)}
      height={Math.max(0.01, (b.max.y - b.min.y) * k)}
      fill="transparent"
      stroke="transparent"
      strokeWidth={HIT_MARGIN_PX * 2}
      vectorEffect="non-scaling-stroke"
      onPointerDown={onPointerDown}
      style={{ cursor: 'move' }}
    />
  );
}
