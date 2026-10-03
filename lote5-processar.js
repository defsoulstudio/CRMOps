// Vercel Node.js Function
// POST /api/lote5-processar
//
// Environment variables required in Vercel:
//   LOTE5_USUARIO
//   LOTE5_SENHA
//   RECEBEOPS_BACKEND_TOKEN
//
// This endpoint does NOT access Trello.
// It receives cliente + unidades from Apps Script, reads Lote5,
// and returns data + PDFs (base64) per unit.

export const config = {
  maxDuration: 60,
};

const BASE = "https://clientes.lote5.com.br";

function htmlDecode(value = "") {
  return String(value)
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function stripTags(value = "") {
  return htmlDecode(String(value).replace(/<[^>]+>/g, "")).trim();
}

function parseInputs(html = "") {
  const out = {};
  const tags = String(html).match(/<input\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const name = /\bname=["']([^"']+)["']/i.exec(tag);
    if (!name) continue;
    const value = /\bvalue=["']([^"']*)["']/i.exec(tag);
    out[name[1]] = value ? htmlDecode(value[1]) : "";
  }
  return out;
}

function encodeForm(obj) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) {
    p.set(k, v == null ? "" : String(v));
  }
  return p.toString();
}

function splitSetCookie(headerValue = "") {
  // Good enough for ASP.NET_SessionId and the cookies observed on Lote5.
  return String(headerValue)
    .split(/,(?=[^;,]+=)/)
    .map((x) => x.trim())
    .filter(Boolean);
}

class Session {
  constructor() {
    this.cookies = {};
  }

  cookieHeader() {
    return Object.entries(this.cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
  }

  absorbCookies(headers) {
    let values = [];
    if (typeof headers.getSetCookie === "function") {
      values = headers.getSetCookie();
    } else {
      const raw = headers.get("set-cookie");
      if (raw) values = splitSetCookie(raw);
    }

    for (const line of values) {
      const first = String(line).split(";")[0];
      const i = first.indexOf("=");
      if (i > 0) {
        this.cookies[first.slice(0, i).trim()] = first.slice(i + 1).trim();
      }
    }
  }

  async request(url, options = {}) {
    const headers = {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/154 Safari/537.36",
      ...(options.headers || {}),
    };

    const cookie = this.cookieHeader();
    if (cookie) headers.cookie = cookie;

    const response = await fetch(url, {
      redirect: "follow",
      ...options,
      headers,
    });

    this.absorbCookies(response.headers);
    return response;
  }
}

function callbackState(html) {
  const text = String(html);
  const idx = text.indexOf("WucContratos_grdContratos");
  if (idx < 0) return "";

  const window = text.slice(Math.max(0, idx - 5000), idx + 25000);
  const m = /["']callbackState["']\s*:\s*["']([^"']+)["']/i.exec(window);
  if (!m) return "";

  return htmlDecode(m[1])
    .replace(/\\\//g, "/")
    .replace(/\\u002B/g, "+")
    .replace(/\\u003D/g, "=");
}

async function login(session) {
  const user = process.env.LOTE5_USUARIO || "";
  const pass = process.env.LOTE5_SENHA || "";
  if (!user || !pass) {
    throw new Error("LOTE5_USUARIO/LOTE5_SENHA não configurados na Vercel.");
  }

  const root = `${BASE}/`;
  let r = await session.request(root);
  const initialHtml = await r.text();
  const form = parseInputs(initialHtml);

  Object.assign(form, {
    __EVENTTARGET: "",
    __EVENTARGUMENT: "",
    "pnlLogin$TxtUsuario$State": '{"validationState":""}',
    "pnlLogin$TxtUsuario": user,
    "pnlLogin$TxtSenha$State": '{"validationState":""}',
    "pnlLogin$TxtSenha": pass,
    "pnlLogin$captcha$TB$State": '{"validationState":""}',
    "pnlLogin$captcha$TB": "",
    popupRecuperarSenhaState:
      '{"windowsState":"0:0:-1:0:0:0:-10000:-10000:1:0:0:0"}',
    "admOperador$pcSelecaoDeVisaoState":
      '{"windowsState":"0:0:-1:0:0:0:-10000:-10000:1:0:0:0"}',
    "admOperador$contratos$WucContratos_pcContratosState":
      '{"windowsState":"0:0:-1:0:0:0:-10000:-10000:1:0:0:0"}',
    pcAlterarSenhaAdmState:
      '{"windowsState":"0:0:-1:0:0:0:-10000:-10000:1:0:0:0"}',
    __CALLBACKID: "callbackDoLogin",
    __CALLBACKPARAM: "c0:",
  });

  r = await session.request(root, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
      "x-requested-with": "XMLHttpRequest",
      origin: BASE,
      referer: root,
    },
    body: encodeForm(form),
  });

  const text = await r.text();
  if (!text.includes("selecionarContratoOperador")) {
    throw new Error("Login Lote5 não confirmado.");
  }
}

async function searchContracts(session, nameQuery) {
  const url = `${BASE}/WebUserControls/ContratosDoOperador.aspx`;

  let r = await session.request(url, {
    headers: { referer: `${BASE}/` },
  });

  const html = await r.text();
  const form = parseInputs(html);
  const state = callbackState(html);
  if (!state) throw new Error("callbackState da grade de contratos não encontrado.");

  form.WucContratos_grdContratos = JSON.stringify({
    selection: "",
    callbackState: state,
    groupLevelState: {},
    keys: [],
    focusedRow: -1,
    toolbar: "{}",
  });

  form.WucContratos_navbarBusca =
    '{"selectedItemIndexPath":"","groupsExpanding":"0"}';
  form[
    "WucContratos_navbarBusca$GCTC0$WucContratos_txtboxContrato$State"
  ] = '{"rawValue":"0","validationState":""}';
  form[
    "WucContratos_navbarBusca$GCTC0$WucContratos_txtboxContrato"
  ] = "0";
  form[
    "WucContratos_navbarBusca$GCTC0$WucContratos_txtboxCliente"
  ] = nameQuery;
  form[
    "WucContratos_navbarBusca$GCTC0$WucContratos_txtboxCpfCnpj"
  ] = "";
  form["WucContratos_navbarBusca$GCTC0$chkManterFiltro"] = "U";

  // Same serialization validated in the local v21 test.
  form.WucContratos_hdfFiltro =
    '{"data":"12|#|Filtro|13|4|7|1' +
    nameQuery +
    '4|2|104|1|14|1|14|1|14|1|14|1|14|1|14|1|14|1|14|1|14|1|11|0|4|1|1##"}';

  form.WucContratos_hdfContratos = '{"data":"12|#|#"}';
  form.__CALLBACKID = "WucContratos_grdContratos";
  form.__CALLBACKPARAM =
    "c0:KV|2;[];FR|2;-1;CT|2;{};GB|31;14|CUSTOMCALLBACK11|atualizar;N;";

  r = await session.request(url, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
      "x-requested-with": "XMLHttpRequest",
      origin: BASE,
      referer: url,
    },
    body: encodeForm(form),
  });

  const raw = await r.text();
  const decoded = htmlDecode(raw);

  const keys = [];
  const keysMatch = /["']keys["']\s*:\s*\[(.*?)\]/s.exec(raw);
  if (keysMatch) {
    const re = /["']([^"']+)["']/g;
    let km;
    while ((km = re.exec(keysMatch[1]))) keys.push(km[1]);
  }

  const rows = [];
  const rowRe =
    /<tr[^>]*id=["']WucContratos_grdContratos_DXDataRow(\d+)["'][^>]*>(.*?)<\/tr>/gis;

  let m;
  while ((m = rowRe.exec(decoded))) {
    const cells = [];
    const cellRe = /<td[^>]*>(.*?)<\/td>/gis;
    let c;
    while ((c = cellRe.exec(m[2]))) cells.push(stripTags(c[1]));

    if (cells.length >= 5) {
      const idx = Number(m[1]);
      rows.push({
        indice: idx,
        contrato: cells[0],
        cliente: cells[1],
        empreendimento: cells[2],
        quadra: cells[3],
        lote: cells[4],
        chave_interna: keys[idx] || "",
      });
    }
  }

  return rows;
}

async function generateCod(session, internalKey) {
  const root = `${BASE}/`;
  let r = await session.request(root, {
    headers: { referer: `${BASE}/WebUserControls/ContratosDoOperador.aspx` },
  });

  const html = await r.text();
  const form = parseInputs(html);

  form.__EVENTTARGET = "";
  form.__EVENTARGUMENT = "";
  form.__CALLBACKID = "ctl01$cbkTrocarContrato";
  form.__CALLBACKPARAM = `c0:encriptar=${internalKey}`;

  r = await session.request(root, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
      "x-requested-with": "XMLHttpRequest",
      origin: BASE,
      referer: root,
    },
    body: encodeForm(form),
  });

  const text = await r.text();
  const m = /Cliente\/Home\.aspx\?cod=([^'"}]+)/.exec(text);
  if (!m) throw new Error("cod do contrato não encontrado.");
  return htmlDecode(m[1]);
}

async function cadastralData(session, cod) {
  const url = `${BASE}/Cliente/EdicaoCadastro.aspx?cod=${cod}`;
  const r = await session.request(url, {
    headers: { referer: `${BASE}/` },
  });

  const html = await r.text();
  const inputs = parseInputs(html);

  function suffix(s) {
    const key = Object.keys(inputs).find((k) => k.endsWith(s));
    return key ? inputs[key] : "";
  }

  return {
    nome: suffix("$txtNome"),
    estado_civil: suffix("$cboEstCivil"),
    sexo: suffix("$cboSexo"),
    data_nascimento: suffix("$dtaNasc"),
    profissao: suffix("$txtProfissao"),
    rg: suffix("$txtRg"),
    cpf: suffix("$txtCpf"),
    email: suffix("$txtEmail"),
    conjuge: {
      nome: suffix("$pnl$txtNomeCo"),
      cpf: suffix("$pnl$txtCpfCo"),
      rg: suffix("$pnl$txtRGCo"),
      data_nascimento: suffix("$pnl$dteDtNascCo"),
      profissao: suffix("$pnl$txtProfissaoCo"),
    },
  };
}

function findExportUrl(text) {
  const m =
    /(?:\.\.\/)?Relatorios\/CrystalExport\.aspx\?formato=PDF&nome=[^&'"<\\\s]+&file=[^'"<\\\s]+/i.exec(
      htmlDecode(text)
    );
  return m ? m[0] : "";
}

async function downloadReport(session, cod, type) {
  const isExtrato = type === "extrato";
  const url =
    BASE +
    (isExtrato
      ? "/Cliente/RelCarWExtratoCliente.aspx?cod="
      : "/Cliente/RelCarWSinteseContrato.aspx?cod=") +
    cod;

  let r = await session.request(url, {
    headers: { referer: `${BASE}/` },
  });

  const initial = await r.text();
  const form = parseInputs(initial);
  let exportPath = findExportUrl(initial);

  if (!exportPath) {
    const buttons = isExtrato
      ? ["btnGerarRelatorio"]
      : ["btnGerarRelatorio", "btnGerar", "btnVisualizar"];

    for (const button of buttons) {
      const f = { ...form, __EVENTTARGET: "", __EVENTARGUMENT: "" };
      f[button] = "OK";

      if (isExtrato) {
        f.ScriptManager1 = "UpdatePanel1|btnGerarRelatorio";
        f.__ASYNCPOST = "true";
      }

      r = await session.request(url, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
          origin: BASE,
          referer: url,
          "x-requested-with": "XMLHttpRequest",
          ...(isExtrato ? { "x-microsoftajax": "Delta=true" } : {}),
        },
        body: encodeForm(f),
      });

      exportPath = findExportUrl(await r.text());
      if (exportPath) break;
    }
  }

  if (!exportPath) {
    throw new Error(`Exportação ${type} não encontrada.`);
  }

  const exportUrl = exportPath.startsWith("http")
    ? exportPath
    : `${BASE}/${exportPath.replace(/^\.\.\//, "")}`;

  r = await session.request(exportUrl, {
    headers: { referer: url },
  });

  const bytes = Buffer.from(await r.arrayBuffer());

  if (bytes.length < 4 || bytes[0] !== 0x25 || bytes[1] !== 0x50) {
    throw new Error(`${type} retornado não parece PDF.`);
  }

  return bytes;
}

function normalizeUnit(value = "") {
  return String(value).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function safeContract(contract) {
  // Do not return the internal encrypted key to Apps Script/logs.
  return {
    contrato: contract.contrato,
    cliente: contract.cliente,
    empreendimento: contract.empreendimento,
    quadra: contract.quadra,
    lote: contract.lote,
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      status: "error",
      code: "METHOD_NOT_ALLOWED",
    });
  }

  const expected = process.env.RECEBEOPS_BACKEND_TOKEN || "";
  const received = String(req.headers["x-recebeops-token"] || "");

  if (!expected || received !== expected) {
    return res.status(401).json({
      status: "error",
      code: "AUTH",
    });
  }

  try {
    const { cardId = "", cliente = "", unidades = [] } = req.body || {};

    if (!cliente || !Array.isArray(unidades) || unidades.length === 0) {
      return res.status(400).json({
        status: "error",
        code: "INVALID_INPUT",
        message: "cliente e unidades[] são obrigatórios.",
      });
    }

    const session = new Session();
    await login(session);

    // The first-name search is the behavior already validated locally.
    const nameQuery = String(cliente).trim().split(/\s+/)[0];
    const contracts = await searchContracts(session, nameQuery);

    const result = {
      status: "ok",
      cardId,
      cliente_trello: cliente,
      nome_busca_lote5: nameQuery,
      contratos_encontrados: contracts.length,
      unidades: [],
    };

    for (const requested of unidades) {
      const q = normalizeUnit(requested.quadra);
      const l = normalizeUnit(requested.lote);

      const candidates = contracts.filter(
        (c) =>
          normalizeUnit(c.quadra).endsWith(q) &&
          normalizeUnit(c.lote).endsWith(l)
      );

      if (candidates.length !== 1) {
        result.unidades.push({
          solicitado: requested,
          status: "revisao_humana",
          motivo:
            candidates.length === 0
              ? "nenhum contrato correspondente"
              : "mais de um contrato correspondente",
          candidatos: candidates.map(safeContract),
        });
        continue;
      }

      const contract = candidates[0];
      const cod = await generateCod(session, contract.chave_interna);
      const cadastro = await cadastralData(session, cod);
      const extrato = await downloadReport(session, cod, "extrato");
      const sintese = await downloadReport(session, cod, "sintese");

      result.unidades.push({
        solicitado: requested,
        status: "ok",
        contrato: safeContract(contract),
        dados_cadastrais: cadastro,
        extratoPdfBase64: extrato.toString("base64"),
        sintesePdfBase64: sintese.toString("base64"),
      });
    }

    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json(result);
  } catch (error) {
    console.error("lote5-processar:", error);

    const message =
      error && error.message ? String(error.message) : String(error);

    return res.status(500).json({
      status: "error",
      code: "LOTE5_BACKEND_ERROR",
      message,
    });
  }
}
