import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthedRequest } from "../middleware/auth";

const router = Router();
router.use(requireAuth);

// GET /channels/:channelId/messages?before=<messageId>&limit=50
// Autorização: confirma que o usuário é membro do servidor dono do canal
// antes de devolver qualquer mensagem (nunca confia apenas no channelId).
router.get("/:channelId/messages", async (req: AuthedRequest, res) => {
  const { channelId } = req.params;
  const limit = Math.min(Number(req.query.limit) || 50, 100);
  const before = typeof req.query.before === "string" ? req.query.before : undefined;

  const channel = await prisma.channel.findUnique({ where: { id: channelId } });
  if (!channel) return res.status(404).json({ error: "Canal não encontrado" });

  const membership = await prisma.serverMember.findUnique({
    where: { userId_serverId: { userId: req.userId!, serverId: channel.serverId } },
  });
  if (!membership) return res.status(403).json({ error: "Sem acesso a este canal" });

  let cursor: { id: string } | undefined;
  if (before) {
    const cursorMsg = await prisma.message.findUnique({ where: { id: before } });
    if (cursorMsg) cursor = { id: before };
  }

  const messages = await prisma.message.findMany({
    where: { channelId },
    orderBy: { createdAt: "desc" },
    take: limit,
    ...(cursor ? { cursor, skip: 1 } : {}),
    include: { author: { select: { id: true, username: true, avatarColor: true, avatarUrl: true } } },
  });

  res.json({ messages: messages.reverse() });
});

export default router;
