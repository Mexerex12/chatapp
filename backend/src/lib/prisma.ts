import { PrismaClient } from "@prisma/client";

// Singleton do PrismaClient para evitar múltiplas conexões em dev (hot-reload).
export const prisma = new PrismaClient();
