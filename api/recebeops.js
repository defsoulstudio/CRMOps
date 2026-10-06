import {
  isAuthenticated
} from "./_auth.js";

export default async function handler(req, res) {
  res.setHeader(
    "Cache-Control",
    "no-store"
  );

  if (!isAuthenticated(req)) {
    return res
      .status(401)
      .json({
        status: "error",
        code: "AUTH_REQUIRED",
        message:
          "Faça login no RecebeOps para continuar."
      });
  }

  const appsUrl =
    process.env.APPS_SCRIPT_URL;

  if (!appsUrl) {
    return res
      .status(500)
      .json({
        status: "error",
        message:
          "APPS_SCRIPT_URL não configurada na Vercel."
      });
  }

  try {
    if (req.method === "GET") {
      const cardId =
        String(
          req.query.cardId || ""
        );

      if (!cardId) {
        return res
          .status(400)
          .json({
            status: "error",
            message:
              "cardId obrigatório"
          });
      }

      const r = await fetch(
        appsUrl +
          "?cardId=" +
          encodeURIComponent(cardId),
        {
          redirect: "follow"
        }
      );

      const text = await r.text();

      res.setHeader(
        "Content-Type",
        "application/json; charset=utf-8"
      );

      return res
        .status(200)
        .send(text);
    }

    if (req.method === "POST") {
      const r = await fetch(
        appsUrl,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json"
          },
          body:
            JSON.stringify(
              req.body || {}
            ),
          redirect: "follow"
        }
      );

      const text = await r.text();

      res.setHeader(
        "Content-Type",
        "application/json; charset=utf-8"
      );

      return res
        .status(200)
        .send(text);
    }

    return res
      .status(405)
      .json({
        status: "error",
        message:
          "Método não permitido"
      });
  } catch (e) {
    return res
      .status(500)
      .json({
        status: "error",
        message: String(e)
      });
  }
}
