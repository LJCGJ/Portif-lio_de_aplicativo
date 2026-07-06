# Login com Microsoft + Worker — guia de instalação

Depois deste guia, o painel `admin.html` deixa de pedir token colado: você
clica em **Entrar com Microsoft**, aprova no **Microsoft Authenticator** (o
duplo fator da sua conta) e pronto. O token do GitHub passa a viver como
segredo dentro do Cloudflare Worker — fora de qualquer código público.

São 3 etapas, todas gratuitas. Reserve uns 20 minutos.

---

## Etapa 1 — Registrar o "aplicativo" na Microsoft (5 min)

Isso dá ao site permissão de usar o botão "Entrar com Microsoft".

1. Acesse **https://entra.microsoft.com** e entre com a sua conta Microsoft
   pessoal (a mesma do Authenticator).
2. Menu **Identity → Applications → App registrations → New registration**.
3. Preencha:
   - **Name:** `Painel LJCGJ`
   - **Supported account types:** *Personal Microsoft accounts only*
   - **Redirect URI:** plataforma **Single-page application (SPA)** e a URL:
     `https://ljcgj.github.io/Portif-lio_de_aplicativo/admin.html`
     *(se depois você ativar domínio próprio, volte aqui e adicione também
     `https://seudominio.com.br/admin.html`)*
4. Clique em **Register**.
5. Na tela do app, copie o **Application (client) ID** — um código tipo
   `1a2b3c4d-…`. Guarde: é o `MS_CLIENT_ID`.

## Etapa 2 — Criar o Worker na Cloudflare (10 min)

1. Crie uma conta gratuita em **https://dash.cloudflare.com** (não pede cartão).
2. Menu **Workers & Pages → Create → Create Worker**.
3. Dê o nome `painel-ljcgj` (a URL fica `https://painel-ljcgj.SEU-USUARIO.workers.dev`)
   e clique em **Deploy** (com o código de exemplo mesmo).
4. Clique em **Edit code**, apague tudo, cole o conteúdo de `worker/worker.js`
   deste repositório e clique em **Deploy**.
5. Volte à página do Worker → **Settings → Variables and Secrets** e crie:

   | Nome             | Tipo       | Valor                                                       |
   |------------------|------------|-------------------------------------------------------------|
   | `GITHUB_TOKEN`   | **Secret** | seu token fine-grained (Contents: read/write no repositório) |
   | `MS_CLIENT_ID`   | Text       | o Application (client) ID da Etapa 1                        |
   | `ALLOWED_EMAIL`  | Text       | seu e-mail Microsoft (ex.: `voce@outlook.com`)              |
   | `ALLOWED_ORIGIN` | Text       | `https://ljcgj.github.io`                                   |

6. **Deploy** de novo para aplicar. Copie a URL do Worker.

> Dica: o mesmo token que você já usava no painel serve. Se preferir, gere um
> novo e revogue o antigo — a partir de agora ele só existe dentro do Worker.

## Etapa 3 — Ligar o modo Microsoft no painel (1 min)

Abra `frontend/js/admin.js` e preencha o bloco `AUTH` no topo:

```js
var AUTH = {
  workerUrl: "https://painel-ljcgj.SEU-USUARIO.workers.dev",
  msClientId: "COLE-AQUI-O-CLIENT-ID"
};
```

Commit + push. Quando o site republicar, o login do painel vira o botão
**Entrar com Microsoft** — com o push/código do Authenticator no meio do
caminho, exatamente como você imaginou.

---

## Como a segurança funciona (resumo)

- O site continua 100% estático e público; nele **não existe segredo nenhum**.
- O Worker só aceita chamadas com um ID token **assinado pela Microsoft**,
  emitido **para o seu app** (`MS_CLIENT_ID`) e **para o seu e-mail**
  (`ALLOWED_EMAIL`) — a assinatura é verificada criptograficamente a cada chamada.
- Só então ele repassa a operação ao GitHub, usando o `GITHUB_TOKEN` que vive
  como Secret na Cloudflare (nem no painel da Cloudflare dá pra reler o valor).
- Camadas extras: o Worker só aceita chamadas vindas do seu site
  (`ALLOWED_ORIGIN`) e só para o seu repositório (lista de caminhos no código).

## Se algo der errado

- **"Este e-mail não tem acesso ao painel"** → confira `ALLOWED_EMAIL` no Worker
  (tem que ser idêntico ao e-mail da conta que você usou no login).
- **Popup fecha e nada acontece** → confira se a Redirect URI da Etapa 1 é
  exatamente a URL do `admin.html` (com https e sem barra no final).
- **Erro de CORS no console** → confira `ALLOWED_ORIGIN` (só o domínio, sem o
  caminho: `https://ljcgj.github.io`).
- Para voltar ao modo antigo (token colado), basta deixar os dois campos de
  `AUTH` vazios no `admin.js`.
