import crypto from "crypto";

const COOKIE_NAME = "recebeops_session";
const TTL = 60 * 60 * 12;

function secret() {
  const value =
    process.env.RECEBEOPS_SESSION_SECRET || "";

  if (!value) {
    throw new Error(
      "RECEBEOPS_SESSION_SECRET não configurada."
    );
  }

  return value;
}

function sign(value) {
  return crypto
    .createHmac("sha256", secret())
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

function parseCookies(req) {
  const out = {};

  String(req.headers.cookie || "")
    .split(";")
    .forEach(part => {
      const i = part.indexOf("=");

      if (i > 0) {
        out[
          part.slice(0, i).trim()
        ] =
          decodeURIComponent(
            part.slice(i + 1).trim()
          );
      }
    });

  return out;
}

function bearerToken(req) {
  const auth =
    String(
      req.headers.authorization || ""
    ).trim();

  const m =
    auth.match(/^Bearer\s+(.+)$/i);

  return m ? m[1].trim() : "";
}

function validateToken(token) {
  try {
    if (!token) return null;

    const parts =
      String(token).split(".");

    if (parts.length !== 2) {
      return null;
    }

    const payload =
      parts[0];

    const signature =
      parts[1];

    const expected =
      sign(payload);

    const a =
      Buffer.from(signature);

    const b =
      Buffer.from(expected);

    if (
      a.length !== b.length ||
      !crypto.timingSafeEqual(a, b)
    ) {
      return null;
    }

    const data =
      JSON.parse(
        Buffer
          .from(
            payload,
            "base64url"
          )
          .toString("utf8")
      );

    if (
      !data.u ||
      Number(data.exp || 0) <=
        Math.floor(Date.now() / 1000)
    ) {
      return null;
    }

    return data;
  } catch {
    return null;
  }
}

export function getSession(req) {
  // 1. Authorization Bearer tem prioridade.
  const bearer =
    bearerToken(req);

  const byBearer =
    validateToken(bearer);

  if (byBearer) {
    return {
      authenticated: true,
      user: byBearer.u,
      source: "bearer"
    };
  }

  // 2. Fallback para cookie HttpOnly.
  const cookieToken =
    parseCookies(req)[COOKIE_NAME];

  const byCookie =
    validateToken(cookieToken);

  if (byCookie) {
    return {
      authenticated: true,
      user: byCookie.u,
      source: "cookie"
    };
  }

  return {
    authenticated: false,
    user: "",
    source: ""
  };
}

export function isAuthenticated(req) {
  return getSession(req).authenticated;
}

export function sessionCookie(token) {
  return (
    COOKIE_NAME +
    "=" +
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
    COOKIE_NAME +
    "=" +
    "; Path=/" +
    "; HttpOnly" +
    "; Secure" +
    "; SameSite=Lax" +
    "; Max-Age=0"
  );
}
