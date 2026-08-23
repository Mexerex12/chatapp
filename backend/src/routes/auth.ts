import { Router } from "express";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import { prisma } from "../lib/prisma";
import { signToken } from "../utils/jwt";
import { registerSchema, loginSchema } from "../utils/validation";
import { requireAuth, AuthedRequest } from "../middleware/auth";

const router = Router();

// Rate limit básico contra brute-force de login/registro.
const authLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Muitas tentativas. Tente novamente mais tarde." },
});

router.post("/register", authLimiter, async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const { username, email, password } = parsed.data;

  const existing = await prisma.user.findFirst({
    where: { OR: [{ email }, { username }] },
  });
  if (existing) {
    return res.status(409).json({ error: "Username ou email já em uso" });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const colors = ["#5865F2", "#57F287", "#FEE75C", "#EB459E", "#ED4245", "#3BA55D"];
  const user = await prisma.user.create({
    data: {
      username,
      email,
      passwordHash,
      avatarColor: colors[Math.floor(Math.random() * colors.length)],
    },
  });

  const token = signToken({ userId: user.id, username: user.username });
  res.status(201).json({
    token,
    user: { id: user.id, username: user.username, email: user.email, avatarColor: user.avatarColor, avatarUrl: user.avatarUrl },
  });
});

router.post("/login", authLimiter, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const { emailOrUsername, password } = parsed.data;

  const user = await prisma.user.findFirst({
    where: { OR: [{ email: emailOrUsername }, { username: emailOrUsername }] },
  });
  // Mensagem genérica de propósito: não revela se o usuário existe ou não.
  if (!user) return res.status(401).json({ error: "Credenciais inválidas" });

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return res.status(401).json({ error: "Credenciais inválidas" });

  const token = signToken({ userId: user.id, username: user.username });
  res.json({
    token,
    user: { id: user.id, username: user.username, email: user.email, avatarColor: user.avatarColor, avatarUrl: user.avatarUrl },
  });
});

router.get("/me", requireAuth, async (req: AuthedRequest, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { id: true, username: true, email: true, avatarColor: true, avatarUrl: true, status: true },
  });
  if (!user) return res.status(404).json({ error: "Usuário não encontrado" });
  res.json({ user });
});

export default router;
