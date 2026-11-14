import { useEffect, useRef, useState } from 'react';

interface Props {
  label: string;
  value: number;
  unit?: string;
  decimals?: number;
  step?: number;
  min?: number;
  max?: number;
  disabled?: boolean;
  /** Valor ainda não informado: o campo fica vazio, com "—" de dica. */
  vazio?: boolean;
  onCommit: (value: number) => void;
}

/**
 * Campo numérico de ajuste fino. Aceita vírgula ou ponto como separador
 * decimal e só confirma no Enter ou ao sair do campo — digitar "1," não
 * pode aplicar um valor intermediário ao desenho. Setas ajustam pelo passo.
 */
export function NumberField({
  label,
  value,
  unit,
  decimals = 2,
  step = 1,
  min,
  max,
  disabled,
  vazio = false,
  onCommit,
}: Props) {
  const mostra = (v: number) => (vazio ? '' : format(v, decimals));
  const [text, setText] = useState(() => mostra(value));
  const editing = useRef(false);

  useEffect(() => {
    if (!editing.current) setText(mostra(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, decimals, vazio]);

  const commit = (raw: string) => {
    const parsed = parse(raw);
    editing.current = false;
    if (parsed === null) {
      setText(mostra(value));
      return;
    }
    const clamped = clamp(parsed, min, max);
    setText(format(clamped, decimals));
    if (clamped !== value) onCommit(clamped);
  };

  return (
    <label className="field">
      <span>{label}</span>
      <span className="input-unit">
        <input
          type="text"
          inputMode="decimal"
          value={text}
          placeholder={vazio ? '—' : undefined}
          disabled={disabled}
          onFocus={() => {
            editing.current = true;
          }}
          onChange={(e) => setText(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              commit((e.target as HTMLInputElement).value);
              (e.target as HTMLInputElement).blur();
            } else if (e.key === 'Escape') {
              editing.current = false;
              setText(mostra(value));
              (e.target as HTMLInputElement).blur();
            } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
              e.preventDefault();
              const base = parse(text) ?? value;
              const delta = (e.key === 'ArrowUp' ? 1 : -1) * step * (e.shiftKey ? 10 : 1);
              const next = clamp(base + delta, min, max);
              editing.current = false;
              setText(format(next, decimals));
              onCommit(next);
            }
          }}
        />
        {unit && <em>{unit}</em>}
      </span>
    </label>
  );
}

const format = (v: number, decimals: number): string =>
  v.toFixed(decimals).replace('.', ',').replace(/,?0+$/, (m) => (m.startsWith(',') ? '' : m));

function parse(raw: string): number | null {
  const normalized = raw.trim().replace(',', '.');
  if (normalized === '' || !/^-?\d*\.?\d*$/.test(normalized)) return null;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function clamp(v: number, min?: number, max?: number): number {
  if (min !== undefined && v < min) return min;
  if (max !== undefined && v > max) return max;
  return v;
}
