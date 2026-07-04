import { createHmac } from "crypto";
import { readSignedCookie } from "./cookies";

const SECRET = "test-secret";

function signed(value: string): string {
  const mac = createHmac("sha256", SECRET).update(value).digest("base64").replace(/=+$/, "");
  return encodeURIComponent("s:" + value + "." + mac);
}

describe("readSignedCookie", () => {
  it("décode un cookie correctement signé", () => {
    const header = `session_user=${signed("hello")}; other=x`;
    expect(readSignedCookie(header, "session_user", SECRET)).toBe("hello");
  });

  it("rejette une signature invalide", () => {
    const header = "session_user=" + encodeURIComponent("s:hello.badsig");
    expect(readSignedCookie(header, "session_user", SECRET)).toBeUndefined();
  });

  it("rejette un cookie non signé (forgé sans préfixe s:)", () => {
    const header = "session_user=" + encodeURIComponent("hello");
    expect(readSignedCookie(header, "session_user", SECRET)).toBeUndefined();
  });

  it("rejette une signature valide sous un autre secret", () => {
    const otherMac = createHmac("sha256", "autre").update("hello").digest("base64").replace(/=+$/, "");
    const header = "session_user=" + encodeURIComponent("s:hello." + otherMac);
    expect(readSignedCookie(header, "session_user", SECRET)).toBeUndefined();
  });

  it("renvoie undefined si le cookie est absent ou l'en-tête vide", () => {
    expect(readSignedCookie(undefined, "session_user", SECRET)).toBeUndefined();
    expect(readSignedCookie("foo=bar", "session_user", SECRET)).toBeUndefined();
  });
});
