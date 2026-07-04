import cookieParser from "cookie-parser";

const isProd = () => process.env.NODE_ENV === "production";

// Cookies d'identité/autorisation : signés avec SESSION_SECRET. cookie-parser
// vérifie la signature et n'expose que les cookies valides dans req.signedCookies ;
// un cookie forgé (sans signature ou signature invalide) est ignoré.
export function signedCookieOpts(maxAgeMs: number) {
  return {
    httpOnly: true,
    secure: isProd(),
    sameSite: "lax" as const,
    signed: true,
    maxAge: maxAgeMs,
  };
}

// Cookie opaque non signé (bearer ADO) : le falsifier est sans intérêt — un
// token invalide échoue simplement côté Azure DevOps.
export function plainCookieOpts(maxAgeMs: number) {
  return {
    httpOnly: true,
    secure: isProd(),
    sameSite: "lax" as const,
    maxAge: maxAgeMs,
  };
}

// Vérifie et décode un cookie signé depuis un en-tête Cookie brut (handshake
// WebSocket, où le middleware cookie-parser ne s'applique pas). Renvoie undefined
// si le cookie est absent, non signé, ou de signature invalide.
export function readSignedCookie(
  header: string | string[] | undefined,
  name: string,
  secret: string,
): string | undefined {
  const str = Array.isArray(header) ? header.join("; ") : header;
  if (!str) return undefined;
  const m = str.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  if (!m) return undefined;
  const raw = decodeURIComponent(m[1]);
  if (!raw.startsWith("s:")) return undefined;
  const val = cookieParser.signedCookie(raw, secret);
  return typeof val === "string" ? val : undefined;
}
