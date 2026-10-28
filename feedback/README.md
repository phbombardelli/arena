# Sugestões e contato — envio por e-mail

O botão "Sugestões e contato" do Arena (Ajuda, rodapé e Sobre) envia o
formulário para um Google Apps Script publicado na conta Google do
desenvolvedor, que manda o e-mail. O endereço de quem escreveu fica como
"Responder para".

Publicado em 28/10/2026 como "Arena feedback"; o endereço está em
`FEEDBACK_URL`, em `src/platform/feedback.ts`. O assunto sai como
"[Arena PT] Sugestão — Nome".

O script é todo ASCII (acentos como `\u00e3`): colado com acentos de
verdade, o editor do Apps Script os estragava. Para copiar:
`pbcopy < feedback/apps-script.gs`.

## Publicar (uma vez)

1. Abra https://script.google.com e clique em **Novo projeto**.
2. Apague o conteúdo do editor, cole `apps-script.gs` inteiro e dê o nome "Arena feedback".
3. **Implantar → Nova implantação → App da Web**. Executar como: **Eu**. Quem pode acessar: **Qualquer pessoa**.
4. **Implantar** e autorizar (**Avançado → Acessar Arena feedback**).
5. Copie a URL do app da Web (termina em `/exec`) e cole em `FEEDBACK_URL`, em `src/platform/feedback.ts`.

Para atualizar o script depois: **Gerenciar implantações → lápis → Nova versão** (a URL não muda).

Limites: até 100 e-mails por dia na conta gratuita; o script tem tetos próprios (20 por hora, 60 por dia, 4 por remetente por hora).
