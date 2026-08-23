# ChatApp — comunicação em tempo real para você e seus amigos

Um aplicativo de chat/voz/vídeo inspirado no Discord, porém mais simples e leve. MVP **funcional de verdade**: chat em tempo real, canais de voz com WebRTC (áudio, vídeo e compartilhamento de tela), servidores com permissões, sistema de amigos e presença online/offline.

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend | React + TypeScript + Vite + Tailwind CSS v4 |
| Tempo real | Socket.IO (chat, presença, sinalização WebRTC) |
| Voz/vídeo/tela | WebRTC nativo (mesh P2P), sinalização via Socket.IO |
| Backend | Node.js + TypeScript + Express |
| Banco de dados | SQLite (via Prisma ORM) — fácil trocar para PostgreSQL |
| Autenticação | JWT + bcrypt |
| Desktop | Electron (wrapper simples do frontend) |

### Por que SQLite em vez de Postgres?
Para rodar localmente com zero configuração de infraestrutura (sem precisar instalar/subir um servidor Postgres). O Prisma torna a troca trivial: basta mudar `provider` e `DATABASE_URL` no `backend/prisma/schema.prisma` e no `.env` — o resto do código não muda.

### Arquitetura de voz/vídeo/tela (WebRTC)
Usamos uma topologia **mesh**: cada participante de uma chamada abre uma `RTCPeerConnection` direta com cada outro participante (adequado para grupos pequenos de amigos, tipicamente até ~6-8 pessoas por canal de voz). O backend **não** transporta mídia — ele só repassa a sinalização (offer/answer/ICE candidates) via Socket.IO, evento `voice:signal`. Isso é sinalização real, não uma simulação: sem esse relay, os navegadores nunca conseguiriam negociar a conexão P2P.

Compartilhamento de tela reaproveita a mesma `RTCPeerConnection`: adicionamos uma track de vídeo extra vinda de `getDisplayMedia()`.

## Estrutura do projeto

```
chatapp/
├── backend/     # API REST + Socket.IO + Prisma
├── frontend/    # App React (web)
├── desktop/     # Wrapper Electron do frontend
└── package.json # scripts de conveniência do monorepo
```

---

## 1. Pré-requisitos

- Node.js 18+ e npm
- Um navegador moderno (Chrome/Edge/Firefox) — necessário para testar áudio/vídeo/tela

## 2. Instalação

```bash
cd chatapp
npm run install:all
# ou manualmente:
cd backend && npm install
cd ../frontend && npm install
cd ../desktop && npm install   # opcional, só se for usar o app desktop
```

## 3. Configurar o banco de dados

O schema Prisma já vem configurado para **Postgres** (necessário para hospedar de verdade e compartilhar com amigos — veja seção 12). Você tem duas opções:

### Opção A — Postgres na nuvem (recomendado, grátis)
1. Crie um banco em [neon.tech](https://neon.tech) (ou [supabase.com](https://supabase.com)) — leva 1 minuto, sem cartão de crédito.
2. Copie a *connection string* que eles fornecem.
3. Configure:
   ```bash
   cd backend
   cp .env.example .env
   # edite o .env e cole a connection string em DATABASE_URL
   npx prisma generate
   npx prisma migrate dev --name init
   ```

### Opção B — SQLite 100% local (sem depender de serviço externo)
Só para testar rapidinho na sua máquina, sem publicar para ninguém:
1. Em `backend/prisma/schema.prisma`, troque `provider = "postgresql"` para `provider = "sqlite"`.
2. Em `backend/.env`, use `DATABASE_URL="file:./dev.db"`.
3. Rode os mesmos comandos do passo acima (`prisma generate` e `prisma migrate dev`).

Isso cria as tabelas (User, Server, ServerMember, Channel, Message, Invite, FriendRequest, Friend).

> Quiser inspecionar o banco visualmente? Rode `npx prisma studio` dentro de `backend/`.

## 4. Variáveis de ambiente

### `backend/.env`
```env
DATABASE_URL="file:./dev.db"
JWT_SECRET="troque-este-valor-por-uma-string-aleatoria-longa"
JWT_EXPIRES_IN="7d"
PORT=4000
CORS_ORIGIN="http://localhost:5173"

# STUN público (gratuito, funciona na maioria das redes domésticas)
STUN_URLS="stun:stun.l.google.com:19302"

# TURN (opcional — necessário só se a chamada não conectar em redes com
# NAT restritivo/CGNAT, ex: 4G, algumas redes corporativas). Veja seção 8.
TURN_URL=""
TURN_USERNAME=""
TURN_CREDENTIAL=""
```

**Troque `JWT_SECRET` por um valor aleatório forte** (ex: `openssl rand -hex 32`).

### `frontend/.env` (crie a partir de `frontend/.env.example`)
```env
VITE_API_URL=http://localhost:4000
```

## 5. Iniciar o backend

```bash
cd backend
npm run dev
```
Você verá `✅ Backend rodando em http://localhost:4000`.

## 6. Iniciar o frontend

Em outro terminal:
```bash
cd frontend
npm run dev
```
Acesse **http://localhost:5173**.

## 7. Iniciar o app desktop (opcional)

```bash
cd desktop
npm start
```
Isso abre uma janela Electron apontando para `http://localhost:5173` (o frontend precisa estar rodando — passo 6). Permissões de microfone/câmera/tela já são concedidas automaticamente para o app.

Para gerar um instalador de verdade (fora do escopo deste MVP), use `electron-builder` apontando para os arquivos estáticos de `frontend/dist` em vez do dev server.

---

## 8. Configurando STUN/TURN

- **STUN** (já configurado com o servidor público do Google) ajuda os dois lados a descobrirem seu IP público. Funciona para a maioria das conexões domésticas.
- **TURN** é necessário quando a conexão P2P direta não é possível (redes 4G/CGNAT, firewalls corporativos restritivos). Sem TURN, a chamada pode simplesmente não conectar entre certas redes.

Opções para configurar TURN:
1. **Rodar seu próprio [coturn](https://github.com/coturn/coturn)** em um VPS.
2. **Usar um serviço gerenciado** (ex: [Twilio Network Traversal Service](https://www.twilio.com/docs/stun-turn), [Xirsys](https://xirsys.com/), [Metered TURN](https://www.metered.ca/tools/openrelay/)) — a maioria oferece um free tier suficiente para uso entre amigos.

Depois, preencha no `backend/.env`:
```env
TURN_URL="turn:seu-servidor:3478"
TURN_USERNAME="usuario"
TURN_CREDENTIAL="senha"
```
O backend expõe essa configuração para o frontend via `GET /config/ice-servers` — não é preciso mexer em nada no código do cliente.

---

## 9. Testando com duas contas localmente

1. Abra `http://localhost:5173` em uma aba normal e registre a **Conta A**.
2. Abra `http://localhost:5173` em uma **aba anônima/privada** (ou outro navegador) e registre a **Conta B**. (Precisa ser um contexto de navegador diferente porque o token fica em `localStorage`.)
3. Na Conta A: clique em **+** na barra lateral esquerda → crie um servidor.
4. No menu do servidor (nome do servidor → seta) → **Configurações do servidor** → **Gerar convite** → copie o código.
5. Na Conta B: clique no ícone de bússola (🧭) → **Entrar em um servidor** → cole o código.
6. Envie mensagens no canal `#geral` de uma conta para a outra — devem aparecer instantaneamente, sem recarregar a página.
7. Ambas as contas clicam no canal de voz `🔊 sala-geral` → concedam permissão de microfone ao navegador.
8. Testem falar — deve aparecer o indicador visual de "falando" ao redor do avatar.
9. Cliquem no botão de câmera 📹 para ligar vídeo, e no botão de tela 🖥️ para compartilhar a tela — a outra conta deve ver o vídeo/tela em tempo real.

Se quiser testar em **dois computadores diferentes** na mesma rede (ou internet), basta que ambos acessem o IP/domínio onde o frontend e backend estão publicados, e que `CORS_ORIGIN`/`VITE_API_URL` apontem para os endereços corretos.

---

## 10. Segurança implementada

- Senhas com hash `bcrypt` (custo 12)
- Autenticação via JWT (HTTP e Socket.IO)
- Toda autorização (quem pode ver/editar o quê) é checada **no backend**, nunca confiando em dados enviados pelo cliente
- Validação de input com `zod` em todas as rotas que recebem dados
- Sanitização de mensagens (remoção de tags HTML) antes de persistir
- Rate limiting básico (geral + reforçado em login/registro, contra brute-force)
- CORS restrito à origem configurada

## 11. Limitações conhecidas do MVP (próximos passos sugeridos)

- Mensagens diretas (DM) entre amigos ainda não têm UI própria — a infraestrutura de tempo real já suporta adicionar isso.
- A topologia de voz é mesh P2P: ótima para grupos pequenos, mas não escala indefinidamente. Para servidores com muitas pessoas em uma call, o próximo passo seria migrar para um SFU (ex: [mediasoup](https://mediasoup.org/), [LiveKit](https://livekit.io/)).
- Upload de avatar/ícone de servidor é feito por URL (ainda não há upload de arquivo).
- Notificações são apenas in-app (toasts), sem push do sistema operacional.
- Reordenar canais por drag-and-drop ainda não está implementado (a posição existe no banco, falta a UI).

## 12. Deploy — guia completo (Neon + Railway + Vercel)

O schema Prisma **já está configurado para Postgres** (`backend/prisma/schema.prisma`). Siga na ordem:

### 12.1 Subir o código para o GitHub

```bash
cd chatapp
git init
git add .
git commit -m "primeiro commit"
```
Crie um repositório vazio em [github.com/new](https://github.com/new) e depois:
```bash
git remote add origin https://github.com/SEU_USUARIO/chatapp.git
git branch -M main
git push -u origin main
```

### 12.2 Banco de dados — [Neon](https://neon.tech) (Postgres grátis)

1. Crie conta, clique **Create Project**, escolha a região mais próxima.
2. Em **Connection Details**, copie a **Connection string** (algo como `postgresql://usuario:senha@host/dbname?sslmode=require`).
3. No seu computador, cole essa URL em `backend/.env` como `DATABASE_URL` e rode:
   ```bash
   cd backend
   npx prisma migrate dev --name init
   ```
   Isso cria as tabelas direto no banco na nuvem — não precisa repetir isso no servidor depois.

### 12.3 Backend — [Railway](https://railway.app)

1. **New Project → Deploy from GitHub repo** → selecione seu repositório.
2. Em **Settings → Root Directory**, defina `backend` (é um monorepo).
3. Em **Variables**, adicione:
   - `DATABASE_URL` — a mesma connection string do Neon
   - `JWT_SECRET` — string aleatória forte (gere com `openssl rand -hex 32`)
   - `JWT_EXPIRES_IN` = `7d`
   - `CORS_ORIGIN` — por enquanto deixe `http://localhost:5173`, você volta aqui no passo 12.5
   - `STUN_URLS` = `stun:stun.l.google.com:19302`
   - **Não defina `PORT` manualmente** — o Railway injeta a porta automaticamente e o código já lê `process.env.PORT`.
4. O Railway detecta o `package.json` e roda `npm install` (que já dispara `prisma generate` via `postinstall`), depois `npm run build` e `npm start` (que roda `prisma migrate deploy` automaticamente antes de iniciar — suas tabelas ficam sempre atualizadas a cada deploy).
5. Depois do deploy, copie a URL pública gerada (ex: `https://seuapp.up.railway.app`) — em **Settings → Networking**, gere um domínio se ainda não tiver um.

### 12.4 Frontend — [Vercel](https://vercel.com)

1. Conecte seu GitHub e importe o mesmo repositório.
2. Em **Root Directory**, selecione `frontend` (a Vercel detecta Vite automaticamente).
3. Em **Environment Variables**, adicione `VITE_API_URL` = URL do Railway (passo anterior).
4. Deploy. Você recebe uma URL tipo `https://seuapp.vercel.app` — **esse é o link para mandar aos seus amigos**.
5. O arquivo `frontend/vercel.json` (já incluso) garante que rotas como `/login` não retornem 404 ao recarregar a página.

### 12.5 Fechar o CORS

Volte no Railway → Variables → edite `CORS_ORIGIN` para a URL exata da Vercel (ex: `https://seuapp.vercel.app`, sem barra no final) → redeploy o backend.

### 12.6 TURN (recomendado para produção)

Crie conta grátis em [Metered](https://www.metered.ca/tools/openrelay/) ou [Xirsys](https://xirsys.com), copie `TURN_URL`, `TURN_USERNAME` e `TURN_CREDENTIAL`, e adicione essas 3 variáveis no Railway. Sem isso, amigos em redes 4G ou corporativas restritas podem não conseguir conectar nas chamadas de voz/vídeo.

### 12.7 Testar

Mande o link da Vercel para seus amigos. Cada um cria a própria conta, você cria um servidor, gera um convite (Configurações do servidor → Gerar convite) e compartilha o código. HTTPS já vem pronto em ambas as plataformas — necessário para câmera/microfone/tela funcionarem.

---

### Alternativa: tudo em uma VPS só

Se preferir não depender de 3 serviços, alugue uma VPS (ex: [Hetzner](https://www.hetzner.com) ~€4/mês) e rode backend + Postgres + frontend nela, com [Caddy](https://caddyserver.com) cuidando do HTTPS automático via domínio próprio. Isso é mais trabalho manual (SSH, systemd, etc.) mas evita múltiplos free tiers — se quiser, posso escrever esse guia à parte.
