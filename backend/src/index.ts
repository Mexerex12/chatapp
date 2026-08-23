import "dotenv/config";
import express from "express";
import http from "http";
import cors from "cors";
import rateLimit from "express-rate-limit";

import authRoutes from "./routes/auth";
import serverRoutes from "./routes/servers";
import channelRoutes from "./routes/channels";
import messageRoutes from "./routes/messages";
import friendRoutes from "./routes/friends";
import configRoutes from "./routes/config";
import { initSocket } from "./sockets";

const app = express();
const httpServer = http.createServer(app);

const CORS_ORIGIN = process.env.CORS_ORIGIN || "http://localhost:5173";

app.use(cors({ origin: CORS_ORIGIN, credentials: true }));
app.use(express.json({ limit: "1mb" }));

// Rate limit geral básico para toda a API.
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    limit: 300,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/auth", authRoutes);
app.use("/servers", serverRoutes);
app.use("/servers/:serverId/channels", channelRoutes);
app.use("/channels", messageRoutes);
app.use("/friends", friendRoutes);
app.use("/config", configRoutes);

// Handler de erro genérico — nunca vaza stack trace para o cliente.
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Erro interno do servidor" });
});

initSocket(httpServer, CORS_ORIGIN);

const PORT = Number(process.env.PORT) || 4000;
httpServer.listen(PORT, () => {
  console.log(`✅ Backend rodando em http://localhost:${PORT}`);
});
