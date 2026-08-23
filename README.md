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

O banco (SQLite) é criado automaticamente a partir do schema Prisma — não é preciso instalar nada além do Node.

```bash
cd backend
cp .env.example .env
# gere o client do Prisma e crie as tabelas:
npx prisma generate
npx prisma migrate dev --name init
```

Isso cria o arquivo `backend/prisma/dev.db` com todas as tabelas (User, Server, ServerMember, Channel, Message, Invite, FriendRequest, Friend).

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

## 12. Deploy (visão geral)

- **Backend**: qualquer host Node (Railway, Render, Fly.io, VPS próprio). Troque `DATABASE_URL` para Postgres em produção (o schema Prisma já modela tudo de forma portável) e ajuste `CORS_ORIGIN` para o domínio real do frontend.
- **Frontend**: `npm run build` gera arquivos estáticos em `frontend/dist`, que podem ser hospedados em Vercel, Netlify, Cloudflare Pages ou qualquer CDN estática. Ajuste `VITE_API_URL` para a URL pública do backend.
- **WebSocket**: garanta que o host do backend suporte conexões WebSocket persistentes (a maioria dos PaaS modernos suporta).
- **TURN**: em produção, configure um TURN de verdade (seção 8) — sem ele, uma fração dos usuários (redes corporativas/CGNAT) não conseguirá conectar em chamadas.
- **HTTPS**: obrigatório em produção — `getUserMedia`/`getDisplayMedia` só funcionam em contexto seguro (HTTPS ou `localhost`).
