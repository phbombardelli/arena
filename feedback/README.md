# Sugestões e contato — envio por e-mail

O botão "Sugestões e contato" do Arena (Ajuda, rodapé e Sobre) envia o
formulário para um Google Apps Script publicado na conta Google do
desenvolvedor, que manda o e-mail. O endereço de quem escreveu fica como
"Responder para".

Enquanto o script do Arena não estiver publicado, o Arena usa o do SAPH
(`FEEDBACK_URL` em `src/platform/feedback.ts`); o assunto sai como
"[SAPH PT] Sugestão — Nome (Arena 1)".

## Publicar (uma vez)

1. Abra https://script.google.com e clique em **Novo projeto**.
2. Apague o conteúdo do editor, cole `apps-script.gs` inteiro e dê o nome "Arena feedback".
3. **Implantar → Nova implantação → App da Web**. Executar como: **Eu**. Quem pode acessar: **Qualquer pessoa**.
4. **Implantar** e autorizar (**Avançado → Acessar Arena feedback**).
5. Copie a URL do app da Web (termina em `/exec`) e cole em `FEEDBACK_URL`, em `src/platform/feedback.ts`.

Para atualizar o script depois: **Gerenciar implantações → lápis → Nova versão** (a URL não muda).

Limites: até 100 e-mails por dia na conta gratuita; o script tem tetos próprios (20 por hora, 60 por dia, 4 por remetente por hora).
