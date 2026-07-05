import { validateEnv } from "./env";

const required = {
  DATABASE_URL: "postgres://localhost/db",
  SESSION_SECRET: "shhh",
};

describe("validateEnv", () => {
  it("applique les valeurs par défaut sur les variables optionnelles", () => {
    const env = validateEnv({ ...required });
    expect(env.PORT).toBe(3000);
    expect(env.REDIS_URL).toBe("redis://localhost:6379");
    expect(env.FRONTEND_URL).toBe("http://localhost:5173");
  });

  it("coerce PORT en nombre", () => {
    const env = validateEnv({ ...required, PORT: "8080" });
    expect(env.PORT).toBe(8080);
  });

  it("rejette une configuration à laquelle il manque une variable requise", () => {
    const { DATABASE_URL, ...incomplete } = required;
    expect(() => validateEnv(incomplete)).toThrow();
  });
});
