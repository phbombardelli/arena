import { useEffect, useRef, useState } from 'react';
import { centerOnPage, fitScaleToPage } from '@core/model/document';
import { GRID_STEPS } from '@core/geometry/snap';
import { PAGE_FORMATS, STANDARD_SCALES, formatMeters } from '@core/scale/units';
import type { Orientation, PageFormat, SheetCorner } from '@core/scale/units';
import { useDocumentStore } from '@store/documentStore';
import { toggleGrid } from '@ui/actions/viewActions';

const ROTULO_MARGEM = {
  top: 'Topo',
  right: 'Direita',
  bottom: 'Base',
  left: 'Esquerda',
} as const;

/**
 * A folha: formato, margens, escala e legenda.
 *
 * Saiu do painel da direita, onde ocupava metade da altura o tempo todo,
 * para o botão "Folha" da barra de cima: é o que se ajusta uma vez por
 * croqui, e não enquanto se desenha.
 */
export function SheetSettings() {
  const { doc, apply } = useDocumentStore();

  return (
    <div className="settings">
      <section>
        <h3>Folha</h3>
        <Field label="Formato">
          <select
            value={doc.page.format}
            onChange={(e) =>
              apply('Formato da página', (d) => {
                d.page.format = e.target.value as PageFormat;
              })
            }
          >
            {Object.keys(PAGE_FORMATS).map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
            <option value="custom">Personalizado</option>
          </select>
        </Field>
        <Field label="Orientação">
          <select
            value={doc.page.orientation}
            onChange={(e) =>
              apply('Orientação', (d) => {
                d.page.orientation = e.target.value as Orientation;
              })
            }
          >
            <option value="landscape">Paisagem</option>
            <option value="portrait">Retrato</option>
          </select>
        </Field>
      </section>

      <section>
        <h3>Escala de impressão</h3>
        <Field label="Escala">
          <ScaleInput
            value={doc.page.printScale}
            onCommit={(v) =>
              apply('Escala de impressão', (d) => {
                d.page.printScale = v;
              })
            }
          />
        </Field>
        <p className="note">1 m no terreno = {formatMeters(1000 / doc.page.printScale, 2)} mm no papel.</p>
        <div className="row-buttons">
          <button
            className="primary"
            title="Escolhe a maior escala padrão em que o desenho cabe e centraliza"
            onClick={() =>
              apply('Ajustar escala ao papel', (d) => {
                d.page.printScale = fitScaleToPage(d);
                centerOnPage(d);
              })
            }
          >
            Ajustar ao papel
          </button>
          <button onClick={() => apply('Centralizar na página', centerOnPage)}>Centralizar</button>
        </div>
      </section>

      <section>
        <h3>Margens (mm)</h3>
        <div className="margin-grid">
          {(['top', 'right', 'bottom', 'left'] as const).map((lado) => (
            <label key={lado} className="margin-cell">
              <span>{ROTULO_MARGEM[lado]}</span>
              <input
                type="number"
                min={0}
                step={1}
                value={doc.page.marginsMm[lado]}
                onChange={(e) => {
                  const v = Math.max(0, Number(e.target.value) || 0);
                  apply(`Margem ${ROTULO_MARGEM[lado].toLowerCase()}`, (d) => {
                    d.page.marginsMm[lado] = v;
                  });
                }}
              />
            </label>
          ))}
        </div>
        <div className="row-buttons">
          <button
            title="Aplica a margem de cima nos quatro lados"
            onClick={() =>
              apply('Margens iguais', (d) => {
                const v = d.page.marginsMm.top;
                d.page.marginsMm = { top: v, right: v, bottom: v, left: v };
              })
            }
          >
            Igualar as quatro
          </button>
        </div>
      </section>

      <section>
        <h3>Sinalização</h3>
        <label className="check" title="Vermelha à direita e branca à esquerda de quem salta, nos obstáculos e nas linhas de partida e chegada">
          <input
            type="checkbox"
            checked={doc.flags}
            onChange={(e) =>
              apply(e.target.checked ? 'Mostrar bandeirolas' : 'Ocultar bandeirolas', (d) => {
                d.flags = e.target.checked;
              })
            }
          />
          Bandeirolas (vermelha à direita, branca à esquerda)
        </label>
      </section>

      <section>
        <h3>Legenda de escala</h3>
        <label className="check">
          <input
            type="checkbox"
            checked={doc.page.scaleLabel.visible}
            onChange={(e) =>
              apply('Legenda de escala', (d) => {
                d.page.scaleLabel.visible = e.target.checked;
              })
            }
          />
          Imprimir a escala na folha
        </label>
        {doc.page.scaleLabel.visible && (
          <>
            <Field label="Canto">
              <select
                value={doc.page.scaleLabel.corner}
                onChange={(e) =>
                  apply('Canto da legenda', (d) => {
                    d.page.scaleLabel.corner = e.target.value as SheetCorner;
                  })
                }
              >
                <option value="inferior-direito">Inferior direito</option>
                <option value="inferior-esquerdo">Inferior esquerdo</option>
                <option value="superior-direito">Superior direito</option>
                <option value="superior-esquerdo">Superior esquerdo</option>
              </select>
            </Field>
            <label className="check" title="A barra continua certa mesmo se a folha for copiada reduzida; o número escrito, não.">
              <input
                type="checkbox"
                checked={doc.page.scaleLabel.bar}
                onChange={(e) =>
                  apply('Barra de escala', (d) => {
                    d.page.scaleLabel.bar = e.target.checked;
                  })
                }
              />
              Barra gráfica
            </label>
          </>
        )}
      </section>
    </div>
  );
}

/** Grade: dentro da pista, contada do canto; sai na folha quando visível. */
export function GridSettings() {
  const { doc, apply } = useDocumentStore();
  return (
    <div className="settings">
      <label className="check">
        <input type="checkbox" checked={doc.grid.visible} onChange={toggleGrid} />
        Mostrar a grade <kbd>G</kbd>
      </label>
      <Field label="Espaçamento">
        <select
          value={doc.grid.stepM}
          onChange={(e) =>
            apply('Espaçamento da grade', (d) => {
              d.grid.stepM = Number(e.target.value);
            })
          }
        >
          <option value={0}>Automático</option>
          {GRID_STEPS.map((s) => (
            <option key={s} value={s}>{formatMeters(s, s < 1 ? 2 : 0)} m</option>
          ))}
        </select>
      </Field>
      <Field label="Linha forte a cada">
        <input
          type="number"
          min={2}
          max={20}
          value={doc.grid.subdivisions}
          onChange={(e) =>
            apply('Subdivisões da grade', (d) => {
              d.grid.subdivisions = Math.max(2, Number(e.target.value) || 2);
            })
          }
        />
      </Field>
    </div>
  );
}

/** Limites da escala digitada: de planta de detalhe a hipódromo inteiro. */
const ESCALA_MIN = 10;
const ESCALA_MAX = 5000;

/**
 * Escala digitável (B-32): o campo aceita qualquer denominador — 1:300,
 * 1:350 —, e a setinha ao lado oferece as escalas redondas para quem só
 * quer escolher. Confirma no Enter ou ao sair, como os campos numéricos.
 */
function ScaleInput({ value, onCommit }: { value: number; onCommit: (v: number) => void }) {
  const [texto, setTexto] = useState(String(value));
  const editando = useRef(false);
  useEffect(() => {
    if (!editando.current) setTexto(String(value));
  }, [value]);

  const confirma = () => {
    editando.current = false;
    const n = Math.round(Number(texto.replace(/^1\s*:\s*/, '').replace(',', '.')));
    if (!Number.isFinite(n) || n < ESCALA_MIN || n > ESCALA_MAX) {
      setTexto(String(value));
      return;
    }
    setTexto(String(n));
    if (n !== value) onCommit(n);
  };

  return (
    <div className="inline scale-input">
      <span>1:</span>
      <input
        type="text"
        inputMode="numeric"
        aria-label="Denominador da escala"
        value={texto}
        onFocus={() => {
          editando.current = true;
        }}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={confirma}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') {
            editando.current = false;
            setTexto(String(value));
          }
        }}
      />
      <select
        aria-label="Escalas comuns"
        title="Escalas comuns"
        value=""
        onChange={(e) => {
          if (e.target.value) onCommit(Number(e.target.value));
        }}
      >
        <option value="" disabled hidden>▾</option>
        {STANDARD_SCALES.map((s) => (
          <option key={s} value={s}>1:{s}</option>
        ))}
      </select>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
