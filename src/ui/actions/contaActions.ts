import { contaAtual, registraUso, type Uso } from '@platform/cloud';
import { useEditorStore } from '@store/editorStore';

/**
 * Salvar, exportar PDF e imprimir pedem a conta (decisão 110). Desenhar é livre.
 *
 * Sem conta, abre o aviso de login e guarda a ação: entrando, ela segue
 * sozinha — o PDF sai, o croqui é salvo. Com conta, conta o uso e segue.
 */
let pendente: (() => void) | null = null;

export async function comConta<T>(uso: Uso, acao: () => T | Promise<T>): Promise<T | 'cancelado'> {
  if (await contaAtual()) {
    registraUso(uso);
    return acao();
  }
  pendente = () => {
    registraUso(uso);
    void acao();
  };
  useEditorStore.getState().setDialog('conta');
  return 'cancelado';
}

/** Abre o aviso de login; `depois` roda quando a pessoa entrar. */
export function pedeConta(depois?: () => void): void {
  pendente = depois ?? null;
  useEditorStore.getState().setDialog('conta');
}

/** Depois de entrar: faz o que estava esperando a conta. */
export function seguePendente(): void {
  const acao = pendente;
  pendente = null;
  acao?.();
}

export function descartaPendente(): void {
  pendente = null;
}
