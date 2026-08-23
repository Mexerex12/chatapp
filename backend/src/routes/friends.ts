import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { getIO, onlineUsers } from "../sockets";

const router = Router();
router.use(requireAuth);

function pairKey(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

router.get("/", async (req: AuthedRequest, res) => {
  const uid = req.userId!;
  const friends = await prisma.friend.findMany({
    where: { OR: [{ userAId: uid }, { userBId: uid }] },
    include: {
      userA: { select: { id: true, username: true, avatarColor: true, avatarUrl: true, status: true } },
      userB: { select: { id: true, username: true, avatarColor: true, avatarUrl: true, status: true } },
    },
  });
  const list = friends.map((f) => {
    const friend = f.userAId === uid ? f.userB : f.userA;
    return { ...friend, status: onlineUsers.has(friend.id) ? "online" : "offline" };
  });

  const incoming = await prisma.friendRequest.findMany({
    where: { receiverId: uid, status: "PENDING" },
    include: { sender: { select: { id: true, username: true, avatarColor: true, avatarUrl: true } } },
  });
  const outgoing = await prisma.friendRequest.findMany({
    where: { senderId: uid, status: "PENDING" },
    include: { receiver: { select: { id: true, username: true, avatarColor: true, avatarUrl: true } } },
  });

  res.json({ friends: list, incoming, outgoing });
});

router.post("/requests", async (req: AuthedRequest, res) => {
  const username = String(req.body?.username ?? "").trim();
  if (!username) return res.status(400).json({ error: "Informe um username" });

  const target = await prisma.user.findUnique({ where: { username } });
  if (!target) return res.status(404).json({ error: "Usuário não encontrado" });
  if (target.id === req.userId) return res.status(400).json({ error: "Você não pode se adicionar" });

  const [a, b] = pairKey(req.userId!, target.id);
  const already = await prisma.friend.findUnique({ where: { userAId_userBId: { userAId: a, userBId: b } } });
  if (already) return res.status(409).json({ error: "Vocês já são amigos" });

  const existingReq = await prisma.friendRequest.findFirst({
    where: {
      status: "PENDING",
      OR: [
        { senderId: req.userId!, receiverId: target.id },
        { senderId: target.id, receiverId: req.userId! },
      ],
    },
  });
  if (existingReq) return res.status(409).json({ error: "Já existe uma solicitação pendente" });

  const request = await prisma.friendRequest.create({
    data: { senderId: req.userId!, receiverId: target.id },
    include: { sender: { select: { id: true, username: true, avatarColor: true } } },
  });

  getIO().to(`user:${target.id}`).emit("friend:request-received", request);
  res.status(201).json({ request });
});

router.post("/requests/:id/accept", async (req: AuthedRequest, res) => {
  const request = await prisma.friendRequest.findUnique({ where: { id: req.params.id } });
  if (!request || request.receiverId !== req.userId) return res.status(404).json({ error: "Solicitação não encontrada" });
  if (request.status !== "PENDING") return res.status(400).json({ error: "Solicitação já processada" });

  const [a, b] = pairKey(request.senderId, request.receiverId);
  await prisma.$transaction([
    prisma.friendRequest.update({ where: { id: request.id }, data: { status: "ACCEPTED" } }),
    prisma.friend.create({ data: { userAId: a, userBId: b } }),
  ]);

  getIO().to(`user:${request.senderId}`).emit("friend:request-accepted", { by: req.userId });
  res.json({ ok: true });
});

router.post("/requests/:id/decline", async (req: AuthedRequest, res) => {
  const request = await prisma.friendRequest.findUnique({ where: { id: req.params.id } });
  if (!request || request.receiverId !== req.userId) return res.status(404).json({ error: "Solicitação não encontrada" });
  await prisma.friendRequest.update({ where: { id: request.id }, data: { status: "DECLINED" } });
  res.json({ ok: true });
});

router.delete("/:friendUserId", async (req: AuthedRequest, res) => {
  const [a, b] = pairKey(req.userId!, req.params.friendUserId);
  await prisma.friend.deleteMany({ where: { userAId: a, userBId: b } });
  res.status(204).end();
});

export default router;
