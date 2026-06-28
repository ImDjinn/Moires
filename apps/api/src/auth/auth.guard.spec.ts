import { ExecutionContext, UnauthorizedException } from "@nestjs/common";
import { AuthGuard } from "./auth.guard";

function contextWithCookies(cookies: Record<string, unknown>): ExecutionContext {
  const req: any = { cookies };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

describe("AuthGuard", () => {
  const guard = new AuthGuard();

  it("autorise et attache l'utilisateur depuis un cookie JSON", () => {
    const ctx = contextWithCookies({
      session_user: JSON.stringify({ id: "u1", displayName: "Alice" }),
    });
    expect(guard.canActivate(ctx)).toBe(true);
    const req = ctx.switchToHttp().getRequest();
    expect(req.user).toEqual({ id: "u1", displayName: "Alice" });
  });

  it("accepte un cookie déjà désérialisé (objet)", () => {
    const ctx = contextWithCookies({ session_user: { id: "u2", displayName: "Bob" } });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it("refuse si le cookie est absent", () => {
    expect(() => guard.canActivate(contextWithCookies({}))).toThrow(UnauthorizedException);
  });

  it("refuse si le cookie est un JSON invalide", () => {
    expect(() =>
      guard.canActivate(contextWithCookies({ session_user: "{not-json" })),
    ).toThrow(UnauthorizedException);
  });
});
