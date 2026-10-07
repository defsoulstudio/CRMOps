import crypto from "crypto";

import {
  createSession,
  getSession,
  sessionCookie,
  clearSessionCookie
} from "./_auth.js";

function equal(a, b) {
  const aa =
    Buffer.from(
      String(a || "")
    );

  const bb =
    Buffer.from(
      String(b || "")
    );

  return (
    aa.length === bb.length &&
    crypto.timingSafeEqual(
      aa,
      bb
    )
  );
}

export default async function handler(
  req,
  res
) {
  res.setHeader(
    "Cache-Control",
    "no-store, no-cache, must-revalidate"
  );

  if (req.method === "GET") {
    const session =
      getSession(req);

    return res
      .status(200)
      .json({
        authenticated:
          session.authenticated,
        user:
          session.user || ""
      });
  }

  if (req.method !== "POST") {
    return res
      .status(405)
      .json({
        status: "error",
        message:
          "Método não permitido."
      });
  }

  if (
    String(
      req.body?.action || ""
    ) === "logout"
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
    process.env
      .RECEBEOPS_LOGIN_USER || "";

  const expectedPassword =
    process.env
      .RECEBEOPS_LOGIN_PASSWORD || "";

  const sessionSecret =
    process.env
      .RECEBEOPS_SESSION_SECRET || "";

  if (
    !expectedUser ||
    !expectedPassword ||
    !sessionSecret
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
    String(
      req.body?.user || ""
    ).trim();

  const password =
    String(
      req.body?.password || ""
    );

  if (
    !equal(
      user,
      expectedUser
    ) ||
    !equal(
      password,
      expectedPassword
    )
  ) {
    return res
      .status(401)
      .json({
        status: "error",
        message:
          "Usuário ou senha inválidos."
      });
  }

  const token =
    createSession(user);

  res.setHeader(
    "Set-Cookie",
    sessionCookie(token)
  );

  return res
    .status(200)
    .json({
      status: "ok",
      authenticated: true,
      user: user,
      sessionToken: token
    });
}
