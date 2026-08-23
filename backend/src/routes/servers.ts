import { Router } from "express";
import { nanoid } from "nanoid";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { requireServerRole, ServerScopedRequest } from "../middleware/permissions";
import { serverNameSchema } from "../utils/validation";

const router = Router();
router.use(requireAuth);

// Lista os servidores em que o usuário autenticado é membro.
router.get("/", async (req: AuthedRequest, res) => {
  const memberships = await prisma.serverMember.findMany({
    where: { userId: req.userId },
    include: {
      server: {
        include: { channels: { orderBy: { position: "asc" } }, _count: { select: { members: true } } },
      },
    },
  });
  res.json({
    servers: memberships.map((m) => ({
      id: m.server.id,
      name: m.server.name,
      iconUrl: m.server.iconUrl,
      ownerId: m.server.ownerId,
      myRole: m.role,
      memberCount: m.server._count.members,
      channels: m.server.channels,
    })),
  });
});

router.post("/", async (req: AuthedRequest, res) => {
  const parsed = serverNameSchema.safeParse(req.body?.name);
  if (!parsed.success) return res.status(400).json({ error: "Nome de servidor inválido" });

  const server = await prisma.server.create({
    data: {
      name: parsed.data,
      ownerId: req.userId!,
      members: { create: { userId: req.userId!, role: "OWNER" } },
      channels: {
        create: [
          { name: "geral", type: "TEXT", position: 0 },
          { name: "sala-geral", type: "VOICE", position: 1 },
        ],
      },
    },
    include: { channels: true },
  });
  res.status(201).json({ server: { ...server, myRole: "OWNER" } });
});

router.get("/:serverId/members", requireServerRole("MEMBER"), async (req: ServerScopedRequest, res) => {
  const members = await prisma.serverMember.findMany({
    where: { serverId: req.params.serverId },
    include: { user: { select: { id: true, username: true, avatarColor: true, avatarUrl: true, status: true } } },
    orderBy: { joinedAt: "asc" },
  });
  res.json({ members: members.map((m) => ({ ...m.user, role: m.role, membershipId: m.id })) });
});

router.patch("/:serverId", requireServerRole("ADMIN"), async (req: ServerScopedRequest, res) => {
  const { name, iconUrl } = req.body ?? {};
  const data: { name?: string; iconUrl?: string } = {};
  if (name !== undefined) {
    const parsed = serverNameSchema.safeParse(name);
    if (!parsed.success) return res.status(400).json({ error: "Nome inválido" });
    data.name = parsed.data;
  }
  if (iconUrl !== undefined) data.iconUrl = String(iconUrl).slice(0, 500);

  const server = await prisma.server.update({ where: { id: req.params.serverId }, data });
  res.json({ server });
});

router.delete("/:serverId", requireServerRole("OWNER"), async (req: ServerScopedRequest, res) => {
  await prisma.server.delete({ where: { id: req.params.serverId } });
  res.status(204).end();
});

router.post("/:serverId/leave", requireServerRole("MEMBER"), async (req: ServerScopedRequest, res) => {
  const server = await prisma.server.findUnique({ where: { id: req.params.serverId } });
  if (server?.ownerId === req.userId) {
    return res.status(400).json({ error: "O dono deve excluir o servidor ou transferir a posse antes de sair" });
  }
  await prisma.serverMember.delete({
    where: { userId_serverId: { userId: req.userId!, serverId: req.params.serverId } },
  });
  res.status(204).end();
});

router.delete("/:serverId/members/:memberUserId", requireServerRole("ADMIN"), async (req: ServerScopedRequest, res) => {
  const target = await prisma.serverMember.findUnique({
    where: { userId_serverId: { userId: req.params.memberUserId, serverId: req.params.serverId } },
  });
  if (!target) return res.status(404).json({ error: "Membro não encontrado" });
  if (target.role === "OWNER") return res.status(400).json({ error: "Não é possível remover o dono" });
  await prisma.serverMember.delete({ where: { id: target.id } });
  res.status(204).end();
});

// ---- Convites ----

router.post("/:serverId/invites", requireServerRole("ADMIN"), async (req: ServerScopedRequest, res) => {
  const invite = await prisma.invite.create({
    data: {
      code: nanoid(10),
      serverId: req.params.serverId,
      createdBy: req.userId!,
    },
  });
  res.status(201).json({ invite });
});

router.post("/join/:code", async (req: AuthedRequest, res) => {
  const invite = await prisma.invite.findUnique({ where: { code: req.params.code } });
  if (!invite) return res.status(404).json({ error: "Convite inválido" });
  if (invite.expiresAt && invite.expiresAt < new Date()) {
    return res.status(410).json({ error: "Convite expirado" });
  }
  if (invite.maxUses && invite.uses >= invite.maxUses) {
    return res.status(410).json({ error: "Convite esgotado" });
  }

  const already = await prisma.serverMember.findUnique({
    where: { userId_serverId: { userId: req.userId!, serverId: invite.serverId } },
  });
  if (already) {
    const server = await prisma.server.findUnique({ where: { id: invite.serverId }, include: { channels: true } });
    return res.json({ server: { ...server, myRole: already.role }, alreadyMember: true });
  }

  const [, server] = await prisma.$transaction([
    prisma.serverMember.create({ data: { userId: req.userId!, serverId: invite.serverId, role: "MEMBER" } }),
    prisma.server.findUnique({ where: { id: invite.serverId }, include: { channels: true } }),
    prisma.invite.update({ where: { id: invite.id }, data: { uses: { increment: 1 } } }),
  ]);

  res.status(201).json({ server: { ...server, myRole: "MEMBER" } });
});

export default router;
