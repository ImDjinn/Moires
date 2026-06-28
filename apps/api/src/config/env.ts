import { z } from "zod";

export const envSchema = z.object({
  DATABASE_URL: z.string(),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  AZURE_AD_CLIENT_ID: z.string(),
  AZURE_AD_CLIENT_SECRET: z.string(),
  AZURE_AD_TENANT_ID: z.string(),
  AZURE_AD_REDIRECT_URI: z.string(),
  ADO_ORG_URL: z.string(),
  SESSION_SECRET: z.string(),
  PORT: z.coerce.number().default(3000),
  FRONTEND_URL: z.string().default("http://localhost:5173"),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  return envSchema.parse(config);
}
