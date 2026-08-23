import { Response, NextFunction } from "express";
import { prisma } from "../lib/prisma";
import { AuthedRequest } from "./auth";
import { Role } from "@prisma/client";

const ROLE_RANK: Record<Role, number> = { MEMBER: 0, ADMIN: 1, OWNER: 2 };

export interface ServerScopedRequest extends AuthedRequest {
  membership?: { role: Role; serverId: string };
}

/**
 * Garante que o usuário autenticado é membro do servidor (via params.serverId)
 * e opcionalmente exige um cargo mínimo. A checagem é SEMPRE feita no backend,
 * consultando o banco — nunca confiamos em um "role" enviado pelo cliente.
 */
export function requireServerRole(minRole: Role = "MEMBER") {
  return async (req: ServerScopedRequest, res: Response, next: NextFunction) => {
    const serverId = req.params.serverId;
    if (!req.userId || !serverId) {
      return res.status(400).json({ error: "Requisição inválida" });
    }
    const membership = await prisma.serverMember.findUnique({
      where: { userId_serverId: { userId: req.userId, serverId } },
    });
    if (!membership) {
      return res.status(403).json({ error: "Você não é membro deste servidor" });
    }
    if (ROLE_RANK[membership.role] < ROLE_RANK[minRole]) {
      return res.status(403).json({ error: "Permissão insuficiente" });
    }
    req.membership = { role: membership.role, serverId };
    next();
  };
}
