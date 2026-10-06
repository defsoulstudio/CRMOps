import crypto from "crypto";

import {
  createSession,
  isAuthenticated,
  sessionCookie,
  clearSessionCookie
} from "./_auth.js";

function equal(a, b) {
  const aa = Buffer.from(String(a || ""));
  const bb = Buffer.from(String(b || ""));

  return (
    aa.length === bb.length &&
    crypto.timingSafeEqual(aa, bb)
  );
}

export default async function handler(req, res) {
  res.setHeader(
    "Cache-Control",
    "no-store"
  );

  if (req.method === "GET") {
    return res
      .status(200)
      .json({
        authenticated:
          isAuthenticated(req)
      });
  }

  if (req.method !== "POST") {
    return res
      .status(405)
      .json({
        status: "error",
        message: "Método não permitido."
      });
  }

  if (
    String(req.body?.action || "") ===
    "logout"
  ) {
    res.setHeader(
      "Set-Cookie",
      clearSessionCookie()
    );

    return res
      .status(200)
      .json({
        status: "ok",
        authenticated: false
      });
  }

  const expectedUser =
    process.env.RECEBEOPS_LOGIN_USER || "";

  const expectedPassword =
    process.env.RECEBEOPS_LOGIN_PASSWORD || "";

  const secret =
    process.env.RECEBEOPS_SESSION_SECRET || "";

  if (
    !expectedUser ||
    !expectedPassword ||
    !secret
  ) {
    return res
      .status(500)
      .json({
        status: "error",
        message:
          "Autenticação ainda não configurada na Vercel."
      });
  }

  const user =
    String(req.body?.user || "").trim();

  const password =
    String(req.body?.password || "");

  if (
    !equal(user, expectedUser) ||
    !equal(password, expectedPassword)
  ) {
    return res
      .status(401)
      .json({
        status: "error",
        message:
          "Usuário ou senha inválidos."
      });
  }

  res.setHeader(
    "Set-Cookie",
    sessionCookie(
      createSession(user)
    )
  );

  return res
    .status(200)
    .json({
      status: "ok",
      authenticated: true
    });
}
