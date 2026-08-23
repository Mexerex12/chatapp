import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { requireServerRole, ServerScopedRequest } from "../middleware/permissions";
import { channelNameSchema } from "../utils/validation";

const router = Router({ mergeParams: true });
router.use(requireAuth);

// POST /servers/:serverId/channels
router.post("/", requireServerRole("ADMIN"), async (req: ServerScopedRequest, res) => {
  const { name, type } = req.body ?? {};
  const parsedName = channelNameSchema.safeParse(name);
  if (!parsedName.success) return res.status(400).json({ error: parsedName.error.issues[0].message });
  if (type !== "TEXT" && type !== "VOICE") return res.status(400).json({ error: "Tipo de canal inválido" });

  const count = await prisma.channel.count({ where: { serverId: req.params.serverId } });
  const channel = await prisma.channel.create({
    data: { name: parsedName.data, type, serverId: req.params.serverId, position: count },
  });
  res.status(201).json({ channel });
});

router.delete("/:channelId", requireServerRole("ADMIN"), async (req: ServerScopedRequest, res) => {
  const channel = await prisma.channel.findUnique({ where: { id: req.params.channelId } });
  if (!channel || channel.serverId !== req.params.serverId) {
    return res.status(404).json({ error: "Canal não encontrado" });
  }
  await prisma.channel.delete({ where: { id: channel.id } });
  res.status(204).end();
});

export default router;
