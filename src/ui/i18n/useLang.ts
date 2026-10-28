import { useSyncExternalStore } from 'react';
import { getLang, onLangChange, type Lang } from '@core/i18n/i18n';

/** A língua atual; o componente redesenha quando ela muda. */
export const useLang = (): Lang => useSyncExternalStore(onLangChange, getLang);
