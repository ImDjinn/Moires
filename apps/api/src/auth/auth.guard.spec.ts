import { ExecutionContext, UnauthorizedException } from "@nestjs/common";
import { AuthGuard } from "./auth.guard";

// Le guard ne lit QUE req.signedCookies : un cookie non signé (forgé) n'y figure
// jamais, cookie-parser ne l'y place que si sa signature est valide.
function contextWithSignedCookies(signedCookies: Record<string, unknown>): ExecutionContext {
  const req: any = { signedCookies };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

describe("AuthGuard", () => {
  const guard = new AuthGuard();

  it("autorise et attache l'utilisateur depuis un cookie signé JSON", () => {
    const exp = Date.now() + 3600_000;
    const ctx = contextWithSignedCookies({
      session_user: JSON.stringify({ id: "u1", displayName: "Alice", exp }),
    });
    expect(guard.canActivate(ctx)).toBe(true);
    const req = ctx.switchToHttp().getRequest();
    expect(req.user).toEqual({ id: "u1", displayName: "Alice", exp });
  });

  it("refuse un cookie expiré (exp dépassé) ou sans exp", () => {
    expect(() =>
      guard.canActivate(contextWithSignedCookies({
        session_user: JSON.stringify({ id: "u1", displayName: "Alice", exp: Date.now() - 1 }),
      })),
    ).toThrow(UnauthorizedException);
    expect(() =>
      guard.canActivate(contextWithSignedCookies({
        session_user: JSON.stringify({ id: "u1", displayName: "Alice" }),
      })),
    ).toThrow(UnauthorizedException);
  });

  it("refuse un cookie non signé (forgé) — absent de signedCookies", () => {
    const req: any = { cookies: { session_user: JSON.stringify({ id: "attacker" }) }, signedCookies: {} };
    const ctx = { switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext;
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it("refuse si le cookie est absent", () => {
    expect(() => guard.canActivate(contextWithSignedCookies({}))).toThrow(UnauthorizedException);
  });

  it("refuse une signature invalide (cookie-parser met false)", () => {
    expect(() =>
      guard.canActivate(contextWithSignedCookies({ session_user: false })),
    ).toThrow(UnauthorizedException);
  });

  it("refuse si le cookie signé est un JSON invalide", () => {
    expect(() =>
      guard.canActivate(contextWithSignedCookies({ session_user: "{not-json" })),
    ).toThrow(UnauthorizedException);
  });
});
