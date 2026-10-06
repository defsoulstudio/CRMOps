import crypto from "crypto";

const COOKIE_NAME = "recebeops_session";
const TTL = 60 * 60 * 12;

function sign(value) {
  const secret =
    process.env.RECEBEOPS_SESSION_SECRET || "";

  if (!secret) {
    throw new Error(
      "RECEBEOPS_SESSION_SECRET não configurada."
    );
  }

  return crypto
    .createHmac("sha256", secret)
    .update(value)
    .digest("base64url");
}

export function createSession(username) {
  const payload = Buffer
    .from(
      JSON.stringify({
        u: String(username || ""),
        exp:
          Math.floor(Date.now() / 1000) + TTL
      })
    )
    .toString("base64url");

  return payload + "." + sign(payload);
}

function cookies(req) {
  const out = {};

  String(req.headers.cookie || "")
    .split(";")
    .forEach(part => {
      const i = part.indexOf("=");

      if (i > 0) {
        out[part.slice(0, i).trim()] =
          decodeURIComponent(
            part.slice(i + 1).trim()
          );
      }
    });

  return out;
}

export function isAuthenticated(req) {
  try {
    const token = cookies(req)[COOKIE_NAME];

    if (!token) return false;

    const [payload, signature] =
      token.split(".");

    if (!payload || !signature) return false;

    const expected = sign(payload);

    const a = Buffer.from(signature);
    const b = Buffer.from(expected);

    if (
      a.length !== b.length ||
      !crypto.timingSafeEqual(a, b)
    ) {
      return false;
    }

    const data = JSON.parse(
      Buffer
        .from(payload, "base64url")
        .toString("utf8")
    );

    return (
      Boolean(data.u) &&
      Number(data.exp || 0) >
        Math.floor(Date.now() / 1000)
    );
  } catch {
    return false;
  }
}

export function sessionCookie(token) {
  return (
    "recebeops_session=" +
    encodeURIComponent(token) +
    "; Path=/" +
    "; HttpOnly" +
    "; Secure" +
    "; SameSite=Lax" +
    "; Max-Age=" +
    TTL
  );
}

export function clearSessionCookie() {
  return (
    "recebeops_session=" +
    "; Path=/" +
    "; HttpOnly" +
    "; Secure" +
    "; SameSite=Lax" +
    "; Max-Age=0"
  );
}
