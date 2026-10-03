import tls from "node:tls";

export const config = {
  maxDuration: 30,
};

export default async function handler(req, res) {
  const host = "clientes.lote5.com.br";

  try {
    const resultado = await new Promise((resolve, reject) => {
      const socket = tls.connect(
        {
          host,
          port: 443,
          servername: host,

          // SOMENTE diagnóstico do certificado.
          // Nenhuma senha, login ou dado de cliente é enviado aqui.
          rejectUnauthorized: false,
        },
        () => {
          try {
            const cert = socket.getPeerCertificate(true);

            resolve({
              subject: cert.subject || {},
              issuer: cert.issuer || {},
              valid_from: cert.valid_from || "",
              valid_to: cert.valid_to || "",
              fingerprint256: cert.fingerprint256 || "",
              serialNumber: cert.serialNumber || "",
              infoAccess: cert.infoAccess || {},
              authorized: socket.authorized,
              authorizationError: socket.authorizationError || "",
            });
          } catch (e) {
            reject(e);
          } finally {
            socket.end();
          }
        }
      );

      socket.setTimeout(15000, () => {
        socket.destroy();
        reject(new Error("Timeout TLS"));
      });

      socket.on("error", reject);
    });

    return res.status(200).json({
      status: "ok",
      host,
      certificado: resultado,
    });
  } catch (error) {
    return res.status(500).json({
      status: "error",
      message: error?.message || String(error),
      code: error?.code || "",
    });
  }
}
