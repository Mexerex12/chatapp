import { z } from "zod";

export const usernameSchema = z
  .string()
  .trim()
  .min(3, "Username deve ter ao menos 3 caracteres")
  .max(24, "Username deve ter no máximo 24 caracteres")
  .regex(/^[a-zA-Z0-9_.]+$/, "Username só pode ter letras, números, _ e .");

export const emailSchema = z.string().trim().email("Email inválido");

export const passwordSchema = z
  .string()
  .min(8, "Senha deve ter ao menos 8 caracteres")
  .max(128, "Senha muito longa");

export const registerSchema = z.object({
  username: usernameSchema,
  email: emailSchema,
  password: passwordSchema,
});

export const loginSchema = z.object({
  emailOrUsername: z.string().trim().min(1),
  password: z.string().min(1),
});

export const messageSchema = z.object({
  content: z.string().trim().min(1).max(4000),
});

export const serverNameSchema = z.string().trim().min(2).max(50);
export const channelNameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  .max(32)
  .regex(/^[a-z0-9-_]+$/, "Nome do canal só pode ter letras minúsculas, números, - e _");

export function sanitizeText(input: string): string {
  return input.replace(/<[^>]*>/g, "").trim();
}
