import { Router } from "express";
import { requireAuth } from "../middleware/auth";

const router = Router();

// Devolve a lista de ICE servers (STUN/TURN) configurada no backend, para o
// frontend montar a RTCPeerConnection sem precisar hardcodar credenciais.
router.get("/ice-servers", requireAuth, (_req, res) => {
  const iceServers: RTCIceServer[] = [];

  const stunUrls = (process.env.STUN_URLS || "stun:stun.l.google.com:19302")
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean);
  if (stunUrls.length) iceServers.push({ urls: stunUrls });

  if (process.env.TURN_URL) {
    iceServers.push({
      urls: process.env.TURN_URL,
      username: process.env.TURN_USERNAME || undefined,
      credential: process.env.TURN_CREDENTIAL || undefined,
    });
  }

  res.json({ iceServers });
});

interface RTCIceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export default router;
