/**
 * Arena - receptor de "Sugestoes e contato" (PT, EN e ES).
 *
 * O arquivo e todo ASCII: acentos e travessoes estao escritos como \uXXXX,
 * para nao virarem caracteres estranhos ao colar no editor do Apps Script.
 *
 * Publicado como App da Web na conta Google do desenvolvedor. O Arena
 * faz POST com o formulario em JSON (Content-Type text/plain, para evitar o
 * preflight de CORS), e este script repassa por e-mail.
 *
 * Como publicar: ver feedback/README.md.
 */

const DESTINO = 'pedrohbombardelli@gmail.com';

const TIPOS = { sugestao: 'Sugest\u00e3o', erro: 'Erro', contato: 'Contato', acesso: 'Pedido de acesso' };

// Limites defensivos: o endereco do App da Web e publico.
const LIMITE = { nome: 120, celular: 40, email: 160, mensagem: 5000, contexto: 600 };

// v1.20.15: o endereco e publico - sem teto, alguem podia disparar milhares de mensagens, encher a caixa e esgotar a
// cota diaria de e-mails do Google (ai pedidos de acesso e sugestoes de verdade paravam de chegar). Tetos bem acima
// do uso normal (alguns por dia) e abaixo da cota (100 e-mails/dia numa conta Gmail comum).
const TETO = { porHora: 20, porDia: 60, porRemetenteHora: 4 };

function doPost(e) {
  try {
    const d = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const corta = (v, n) => String(v == null ? '' : v).trim().slice(0, n);

    const nome = corta(d.nome, LIMITE.nome);
    const celular = corta(d.celular, LIMITE.celular);
    const email = corta(d.email, LIMITE.email);
    const mensagem = corta(d.mensagem, LIMITE.mensagem);
    if (!nome || !mensagem || (!email && !celular)) {
      return resposta({ ok: false, erro: 'campos' });
    }

    // O admin tenta de novo quando a resposta demora (1? execucao "a frio"), mas o e-mail
    // pode ja ter saido. Cada mensagem tem um id: repetido em ate 6 h = ja enviado.
    const id = corta(d.id, 40);
    const cache = CacheService.getScriptCache();
    if (id && cache.get('fb_' + id)) return resposta({ ok: true, repetido: true });

    // tetos: conta este envio (repeticoes do mesmo id nao chegam aqui); a trava evita duas contagens ao mesmo tempo
    const trava = LockService.getScriptLock();
    if (!trava.tryLock(10000)) return resposta({ ok: false, erro: 'ocupado' });
    let cotas;
    try {
      cotas = contar(cache, (email || celular || nome).toLowerCase());
      if (!cotas) return resposta({ ok: false, erro: 'limite' });
    } finally { trava.releaseLock(); }

    const ctx = d.contexto || {};
    const tipo = TIPOS[d.tipo] || 'Mensagem';
    const idioma = corta(ctx.idioma, 4) || '?';
    const evento = corta(ctx.evento, 120);

    const assunto = '[Arena ' + idioma + '] ' + tipo + ' \u2014 ' + nome + (evento ? ' (' + evento + ')' : '');
    const corpo = [
      tipo.toUpperCase(),
      '',
      mensagem,
      '',
      '\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500',
      'Nome: ' + nome,
      'Celular: ' + (celular || '\u2014'),
      'E-mail: ' + (email || '\u2014'),
      '',
      'Vers\u00e3o do Arena: ' + corta(ctx.versao, 20) + ' (' + idioma + ')',
      'Tela: ' + corta(ctx.tela, 30) + (ctx.modalidade ? ' \u00b7 modalidade ' + corta(ctx.modalidade, 20) : ''),
      'Evento: ' + (evento || '\u2014'),
      'Tela/janela: ' + corta(ctx.telaPx, 60),
      'Navegador: ' + corta(ctx.navegador, LIMITE.contexto),
    ].join('\n');

    const opcoes = { to: DESTINO, subject: assunto, body: corpo, name: 'Arena' };
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) opcoes.replyTo = email;
    MailApp.sendEmail(opcoes);
    if (id) cache.put('fb_' + id, '1', 21600);

    return resposta({ ok: true });
  } catch (err) {
    return resposta({ ok: false, erro: String(err).slice(0, 200) });
  }
}

/**
 * Conta mais um envio e devolve true; devolve false (sem contar) se algum teto ja foi atingido.
 * Hora e remetente: CacheService (some sozinho em 1 h). Dia: PropertiesService, pela data de hoje.
 */
function contar(cache, remetente) {
  const props = PropertiesService.getScriptProperties();
  const hoje = Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'yyyy-MM-dd');
  const hora = 'h_' + Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'yyyy-MM-dd-HH');
  const rem = 'r_' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, remetente || '?'));
  const nDia = props.getProperty('dia') === hoje ? Number(props.getProperty('nDia') || 0) : 0;
  const nHora = Number(cache.get(hora) || 0);
  const nRem = Number(cache.get(rem) || 0);
  if (nDia >= TETO.porDia || nHora >= TETO.porHora || nRem >= TETO.porRemetenteHora) return false;
  props.setProperties({ dia: hoje, nDia: String(nDia + 1) });
  cache.put(hora, String(nHora + 1), 3600);
  cache.put(rem, String(nRem + 1), 3600);
  return true;
}

/** Abrir o endereco no navegador so confirma que esta no ar. */
function doGet() {
  return resposta({ ok: true, servico: 'Arena feedback' });
}

function resposta(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
