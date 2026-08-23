import { Server as IOServer, Socket } from "socket.io";
import { Server as HttpServer } from "http";
import { verifyToken } from "../utils/jwt";
import { prisma } from "../lib/prisma";
import { messageSchema, sanitizeText } from "../utils/validation";

let io: IOServer | null = null;

// userId -> Set de socket.id (um usuário pode ter várias abas/dispositivos)
export const onlineUsers = new Map<string, Set<string>>();

// channelId (canal de voz) -> Set de userId presentes na chamada
const voiceChannelMembers = new Map<string, Set<string>>();
// socket.id -> { userId, username } cache para lookups rápidos
const socketUser = new Map<string, { userId: string; username: string }>();
// socket.id -> voice channelId atual (para limpar ao desconectar)
const socketVoiceChannel = new Map<string, string>();

export function getIO(): IOServer {
  if (!io) throw new Error("Socket.IO ainda não foi inicializado");
  return io;
}

interface AuthedSocket extends Socket {
  data: { userId: string; username: string };
}

async function broadcastServersPresence(userId: string, status: "online" | "offline") {
  // Notifica apenas usuários que compartilham algum servidor ou são amigos,
  // via as "rooms" de servidor que cada socket já está inscrito.
  const memberships = await prisma.serverMember.findMany({ where: { userId }, select: { serverId: true } });
  for (const m of memberships) {
    getIO().to(`server:${m.serverId}`).emit("presence:update", { userId, status });
  }
  const friends = await prisma.friend.findMany({
    where: { OR: [{ userAId: userId }, { userBId: userId }] },
  });
  for (const f of friends) {
    const otherId = f.userAId === userId ? f.userBId : f.userAId;
    getIO().to(`user:${otherId}`).emit("presence:update", { userId, status });
  }
}

export function initSocket(httpServer: HttpServer, corsOrigin: string) {
  io = new IOServer(httpServer, {
    cors: { origin: corsOrigin, credentials: true },
    maxHttpBufferSize: 1e6,
  });

  // Autenticação no handshake: exige JWT válido, igual às rotas HTTP.
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token as string | undefined;
      if (!token) return next(new Error("unauthorized"));
      const payload = verifyToken(token);
      (socket as AuthedSocket).data = { userId: payload.userId, username: payload.username };
      next();
    } catch {
      next(new Error("unauthorized"));
    }
  });

  io.on("connection", async (socket: Socket) => {
    const s = socket as AuthedSocket;
    const { userId, username } = s.data;

    socketUser.set(s.id, { userId, username });
    socket.join(`user:${userId}`);

    const wasOffline = !onlineUsers.has(userId) || onlineUsers.get(userId)!.size === 0;
    if (!onlineUsers.has(userId)) onlineUsers.set(userId, new Set());
    onlineUsers.get(userId)!.add(s.id);

    if (wasOffline) {
      await prisma.user.update({ where: { id: userId }, data: { status: "online" } });
    }

    // Junta o socket às rooms de todos os servidores do usuário, para
    // receber eventos de chat/presença/voz desses servidores.
    const memberships = await prisma.serverMember.findMany({ where: { userId } });
    for (const m of memberships) socket.join(`server:${m.serverId}`);

    if (wasOffline) await broadcastServersPresence(userId, "online");

    // ---------- CHAT ----------

    socket.on("channel:join", (channelId: string) => {
      socket.join(`channel:${channelId}`);
    });

    socket.on("channel:leave", (channelId: string) => {
      socket.leave(`channel:${channelId}`);
    });

    socket.on("message:send", async (payload: { channelId: string; content: string }, ack) => {
      try {
        const parsed = messageSchema.safeParse({ content: payload?.content });
        if (!parsed.success) return ack?.({ error: "Mensagem inválida" });

        const channel = await prisma.channel.findUnique({ where: { id: payload.channelId } });
        if (!channel || channel.type !== "TEXT") return ack?.({ error: "Canal inválido" });

        const membership = await prisma.serverMember.findUnique({
          where: { userId_serverId: { userId, serverId: channel.serverId } },
        });
        if (!membership) return ack?.({ error: "Sem permissão para enviar mensagens aqui" });

        const clean = sanitizeText(parsed.data.content);
        if (!clean) return ack?.({ error: "Mensagem vazia" });

        const message = await prisma.message.create({
          data: { content: clean, channelId: channel.id, authorId: userId },
          include: { author: { select: { id: true, username: true, avatarColor: true, avatarUrl: true } } },
        });

        io!.to(`channel:${channel.id}`).emit("message:new", message);
        ack?.({ ok: true, message });
      } catch (err) {
        ack?.({ error: "Erro ao enviar mensagem" });
      }
    });

    socket.on("typing:start", (channelId: string) => {
      socket.to(`channel:${channelId}`).emit("typing:update", { userId, username, typing: true });
    });
    socket.on("typing:stop", (channelId: string) => {
      socket.to(`channel:${channelId}`).emit("typing:update", { userId, username, typing: false });
    });

    // ---------- VOZ / VÍDEO / SCREEN SHARE (sinalização WebRTC) ----------
    // Arquitetura: mesh P2P — cada par de participantes troca offer/answer/ICE
    // diretamente via WebRTC, o servidor só repassa a sinalização (não toca no
    // fluxo de mídia). Adequado para grupos pequenos de amigos.

    socket.on("voice:join", async (channelId: string, ack) => {
      const channel = await prisma.channel.findUnique({ where: { id: channelId } });
      if (!channel || channel.type !== "VOICE") return ack?.({ error: "Canal de voz inválido" });
      const membership = await prisma.serverMember.findUnique({
        where: { userId_serverId: { userId, serverId: channel.serverId } },
      });
      if (!membership) return ack?.({ error: "Sem permissão" });

      // Sai de qualquer outro canal de voz em que estivesse antes.
      const prevChannel = socketVoiceChannel.get(s.id);
      if (prevChannel) leaveVoiceChannel(s, prevChannel);

      if (!voiceChannelMembers.has(channelId)) voiceChannelMembers.set(channelId, new Set());
      const room = voiceChannelMembers.get(channelId)!;

      const existingPeers = Array.from(room).filter((uid) => uid !== userId);

      room.add(userId);
      socketVoiceChannel.set(s.id, channelId);
      socket.join(`voice:${channelId}`);

      socket.to(`voice:${channelId}`).emit("voice:user-joined", { userId, username, channelId });
      socket.to(`server:${channel.serverId}`).emit("voice:presence-update", { channelId, userIds: Array.from(room) });

      ack?.({ ok: true, peers: existingPeers });
    });

    socket.on("voice:leave", (channelId: string) => {
      leaveVoiceChannel(s, channelId);
    });

    socket.on("voice:signal", (data: { to: string; from: string; type: string; payload: unknown; channelId: string }) => {
      // Repassa a mensagem de sinalização (offer/answer/ice-candidate) apenas
      // ao socket do usuário-alvo, nunca em broadcast.
      const targetSockets = onlineUsers.get(data.to);
      if (!targetSockets) return;
      for (const sockId of targetSockets) {
        io!.to(sockId).emit("voice:signal", { from: userId, type: data.type, payload: data.payload, channelId: data.channelId });
      }
    });

    socket.on("voice:mute", (data: { channelId: string; muted: boolean }) => {
      socket.to(`voice:${data.channelId}`).emit("voice:mute-update", { userId, muted: data.muted });
    });

    socket.on("voice:video-toggle", (data: { channelId: string; enabled: boolean }) => {
      socket.to(`voice:${data.channelId}`).emit("voice:video-update", { userId, enabled: data.enabled });
    });

    socket.on("voice:screenshare-toggle", (data: { channelId: string; sharing: boolean }) => {
      socket.to(`voice:${data.channelId}`).emit("voice:screenshare-update", { userId, sharing: data.sharing });
    });

    socket.on("voice:speaking", (data: { channelId: string; speaking: boolean }) => {
      socket.to(`voice:${data.channelId}`).emit("voice:speaking-update", { userId, speaking: data.speaking });
    });

    // ---------- DESCONEXÃO ----------

    socket.on("disconnect", async () => {
      const prevChannel = socketVoiceChannel.get(s.id);
      if (prevChannel) leaveVoiceChannel(s, prevChannel);
      socketUser.delete(s.id);

      const sockets = onlineUsers.get(userId);
      sockets?.delete(s.id);
      if (sockets && sockets.size === 0) {
        onlineUsers.delete(userId);
        await prisma.user.update({ where: { id: userId }, data: { status: "offline" } }).catch(() => {});
        await broadcastServersPresence(userId, "offline");
      }
    });
  });

  function leaveVoiceChannel(s: Socket, channelId: string) {
    const info = socketUser.get(s.id);
    if (!info) return;
    const room = voiceChannelMembers.get(channelId);
    room?.delete(info.userId);
    socketVoiceChannel.delete(s.id);
    s.leave(`voice:${channelId}`);
    s.to(`voice:${channelId}`).emit("voice:user-left", { userId: info.userId, channelId });
    if (room) {
      io!.to(`voice:${channelId}`).emit("voice:presence-update", { channelId, userIds: Array.from(room) });
    }
  }

  return io;
}
