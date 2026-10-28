import { useState } from 'react';
import {
  enviarContato,
  guardarRascunho,
  lerRascunho,
  novoIdContato,
  type Contato,
  type TipoContato,
} from '@platform/feedback';
import { useEditorStore } from '@store/editorStore';
import type { MessageKey } from '@core/i18n/messages';
import { t } from '@core/i18n/i18n';

const TIPOS: [TipoContato, MessageKey, MessageKey][] = [
  ['sugestao', 'contato.sugestao', 'contato.phSugestao'],
  ['erro', 'contato.erro', 'contato.phErro'],
  ['contato', 'contato.contato', 'contato.phContato'],
];

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Sugestões e contato (como o "Fale com o desenvolvedor" do SAPH): uma
 * sugestão, um erro ou uma mensagem, com nome e um jeito de responder.
 * O que não foi enviado fica guardado neste navegador.
 */
export function ContactForm() {
  const fecha = () => useEditorStore.getState().setDialog(null);
  const [c, setC] = useState<Contato>(() => {
    const r = lerRascunho();
    return {
      id: r.id ?? novoIdContato(),
      tipo: r.tipo ?? 'sugestao',
      nome: r.nome ?? '',
      celular: r.celular ?? '',
      email: r.email ?? '',
      mensagem: r.mensagem ?? '',
    };
  });
  const [estado, setEstado] = useState<'editando' | 'enviando' | 'enviado'>('editando');
  const [aviso, setAviso] = useState<string | null>(null);

  const muda = (parcial: Partial<Contato>) => {
    const novo = { ...c, ...parcial };
    setC(novo);
    guardarRascunho(novo);
  };

  const enviar = async () => {
    const limpo = {
      ...c,
      nome: c.nome.trim(),
      celular: c.celular.trim(),
      email: c.email.trim(),
      mensagem: c.mensagem.trim(),
    };
    if (!limpo.nome) return setAviso(t('contato.faltaNome'));
    if (!limpo.email && !limpo.celular) return setAviso(t('contato.faltaResposta'));
    if (limpo.email && !EMAIL.test(limpo.email)) return setAviso(t('contato.emailIncompleto'));
    if (!limpo.mensagem) return setAviso(t('contato.faltaMensagem'));
    if (navigator.onLine === false) return setAviso(t('contato.semInternet'));

    setAviso(null);
    setEstado('enviando');
    try {
      await enviarContato(limpo);
      setEstado('enviado');
    } catch {
      setEstado('editando');
      setAviso(t('contato.falhou'));
    }
  };

  if (estado === 'enviado') {
    return (
      <section className="file-dialog contact-form">
        <p className="ok-text">{t('contato.enviado')}</p>
        <div className="row-buttons">
          <button className="primary" onClick={fecha}>{t('contato.fechar')}</button>
        </div>
      </section>
    );
  }

  const placeholder = TIPOS.find(([id]) => id === c.tipo)?.[2] ?? 'contato.phContato';
  const enviando = estado === 'enviando';

  return (
    <section className="file-dialog contact-form">
      <p>{t('contato.intro')}</p>
      <div className="file-tabs" role="tablist">
        {TIPOS.map(([id, rotulo]) => (
          <button
            key={id}
            role="tab"
            aria-selected={c.tipo === id}
            className={c.tipo === id ? 'active' : ''}
            onClick={() => muda({ tipo: id })}
          >
            {t(rotulo)}
          </button>
        ))}
      </div>

      <label className="contact-field">
        <span>{t('contato.nome')}</span>
        <input id="contato-nome" type="text" autoComplete="name" maxLength={120} value={c.nome} onChange={(e) => muda({ nome: e.target.value })} />
      </label>
      <div className="contact-pair">
        <label className="contact-field">
          <span>{t('contato.celular')}</span>
          <input id="contato-celular" type="text" inputMode="tel" autoComplete="tel" maxLength={40} value={c.celular} onChange={(e) => muda({ celular: e.target.value })} />
        </label>
        <label className="contact-field">
          <span>{t('contato.email')}</span>
          <input id="contato-email" type="text" inputMode="email" autoComplete="email" maxLength={160} value={c.email} onChange={(e) => muda({ email: e.target.value })} />
        </label>
      </div>
      <label className="contact-field">
        <span>{t('contato.mensagem')}</span>
        <textarea
          id="contato-mensagem"
          rows={6}
          maxLength={5000}
          placeholder={t(placeholder)}
          value={c.mensagem}
          onChange={(e) => muda({ mensagem: e.target.value })}
        />
      </label>
      <p className="note">{t('contato.contexto')}</p>
      {aviso && <p className="contact-aviso">{aviso}</p>}

      <div className="row-buttons">
        <button onClick={fecha} disabled={enviando}>{t('contato.cancelar')}</button>
        <button className="primary" onClick={() => void enviar()} disabled={enviando}>
          {enviando ? t('contato.enviando') : t('contato.enviar')}
        </button>
      </div>
    </section>
  );
}
