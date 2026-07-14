import { z } from "zod";

export const envSchema = z.object({
  DATABASE_URL: z.string(),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  // Signe les cookies d'identité et dérive la clé AES des PATs dans Redis :
  // un secret court rendrait les deux forgeables/déchiffrables par force brute.
  SESSION_SECRET: z.string().min(32),
  PORT: z.coerce.number().default(3000),
  FRONTEND_URL: z.string().default("http://localhost:5173"),
  ADO_WEBHOOK_SECRET: z.string().optional(),
  // Kill-switch du write-back ADO (env de test) : les ops sont appliquées dans
  // Redis + journalisées, mais jamais écrites vers ADO. Lu via process.env dans
  // SessionsService (relu à chaque op, pas figé au bootstrap).
  WRITEBACK_ENABLED: z.enum(["true", "false"]).default("true"),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  return envSchema.parse(config);
}
