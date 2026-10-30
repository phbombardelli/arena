import { COMMON } from './messages/common';
import { PANELS } from './messages/panels';
import { GYM } from './messages/gym';
import { DIALOGS } from './messages/dialogs';
import { AVISOS } from './messages/avisos';
import { LIBRARY } from './messages/library';
import { RAIL } from './messages/rail';
import { TOOLBAR } from './messages/toolbar';
import { TUTORIALS } from './messages/tutorials';

/**
 * Catálogo de textos da interface em português, inglês e espanhol (B-10).
 *
 * Cada chave tem as três línguas: faltar uma é erro de tipo, não texto em
 * branco na tela. Os termos seguem docs/GLOSSARIO.md; termo novo entra no
 * glossário antes de entrar aqui. `{nome}` marca um valor que o programa
 * preenche (ver `t` em i18n.ts). Um arquivo por área, em messages/.
 */

export type Texto = { pt: string; en: string; es: string };

export const MESSAGES = {
  ...TOOLBAR,
  ...RAIL,
  ...LIBRARY,
  ...AVISOS,
  ...DIALOGS,
  ...GYM,
  ...PANELS,
  ...COMMON,
  ...TUTORIALS,
};

export type MessageKey = keyof typeof MESSAGES;
