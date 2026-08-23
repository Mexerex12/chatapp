import jwt from "jsonwebtoken";

const SECRET = process.env.JWT_SECRET || "";
if (!SECRET || SECRET.length < 8) {
  // Falha rápido: nunca rodar com um segredo fraco/ausente.
  throw new Error("JWT_SECRET não configurado ou muito curto. Configure no .env");
}
const EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

export interface JwtPayload {
  userId: string;
  username: string;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, SECRET, { expiresIn: EXPIRES_IN } as jwt.SignOptions);
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, SECRET) as JwtPayload;
}
