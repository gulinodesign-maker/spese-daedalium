/*************************************************
 * Daedalium PMS – Backend Google Apps Script
 * FIX DEFINITIVO DATE + IVA
 *************************************************/

const API_KEY = "daedalium2026";

const SHEETS = {
  SPESE: "spese",
  OSPITI: "ospiti",
  STANZE: "stanze",
  MOTIVAZIONI: "motivazioni"
};

/* =========================
   ENTRY POINT
========================= */

function doGet(e) {
  return handleRequest(e, "GET");
}

function doPost(e) {
  return handleRequest(e, "POST");
}

function handleRequest(e, method) {
  try {
    if (e.parameter.apiKey !== API_KEY) {
      return jsonError("API key non valida");
    }

    const action = e.parameter.action;
    if (!action) return jsonError("Action mancante");

    switch (action) {
      case "spese":
        return handleSpese(e, method);
      case "report":
        return handleReport(e);
      case "motivazioni":
        return handleMotivazioni(e, method);
      case "ospiti":
        return handleOspiti(e, method);
      case "stanze":
        return handleStanze(e, method);
      default:
        return jsonError("Action sconosciuta");
    }
  } catch (err) {
    return jsonError(err.message || "Errore interno");
  }
}

/* =========================
   SPESE (FIX DATE)
========================= */

function handleSpese(e, method) {
  const sh = getSheet(SHEETS.SPESE);

  if (method === "GET") {
    const { from, to } = e.parameter;
    const rows = getRows(sh).filter(r => {
      const d = toISODate(r.dataSpesa);
      return (!from || d >= from) && (!to || d <= to);
    });
    return jsonOk(rows);
  }

  if (method === "POST" && !e.parameter._method) {
    const data = parseBody(e);
    const ivaCfg = getIvaConfig(data.categoria);

    const lordo = Number(data.importoLordo);
    const imponibile = ivaCfg.aliquota === 0
      ? lordo
      : round(lordo / (1 + ivaCfg.aliquota));
    const iva = round(lordo - imponibile);
    const ivaDetraibile = ivaCfg.detraibile ? iva : 0;

    sh.appendRow([
      uid(),
      now(),
      data.dataSpesa,
      data.categoria,
      data.motivazione,
      lordo,
      ivaCfg.aliquota,
      imponibile,
      iva,
      ivaDetraibile,
      data.note || "",
      now()
    ]);

    return jsonOk({ saved: true });
  }

  if (method === "POST" && e.parameter._method === "DELETE") {
    deleteById(sh, e.parameter.id);
    return jsonOk({ deleted: true });
  }
}

/* =========================
   REPORT (FIX DATE)
========================= */

function handleReport(e) {
  const sh = getSheet(SHEETS.SPESE);
  const { from, to } = e.parameter;

  const rows = getRows(sh).filter(r => {
    const d = toISODate(r.dataSpesa);
    return (!from || d >= from) && (!to || d <= to);
  });

  const totals = {
    importoLordo: 0,
    imponibile: 0,
    iva: 0,
    ivaDetraibile: 0
  };

  const byCategoria = {};

  rows.forEach(r => {
    totals.importoLordo += r.importoLordo;
    totals.imponibile += r.imponibile;
    totals.iva += r.iva;
    totals.ivaDetraibile += r.ivaDetraibile;

    if (!byCategoria[r.categoria]) {
      byCategoria[r.categoria] = {
        importoLordo: 0,
        imponibile: 0,
        iva: 0,
        ivaDetraibile: 0
      };
    }

    byCategoria[r.categoria].importoLordo += r.importoLordo;
    byCategoria[r.categoria].imponibile += r.imponibile;
    byCategoria[r.categoria].iva += r.iva;
    byCategoria[r.categoria].ivaDetraibile += r.ivaDetraibile;
  });

  return jsonOk({
    totals: roundObj(totals),
    byCategoria: roundNested(byCategoria)
  });
}

/* =========================
   OSPITI (DELETE REALE)
========================= */


function handleOspiti(e, method) {
  const sh = getSheet(SHEETS.OSPITI);

  if (method === "PUT") {
    const d = parseBody(e);
    const rows = sh.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]) === String(d.id)) {
        sh.getRange(i+1, 2, 1, 15).setValues([[
          d.name,
          d.adults,
          d.kidsU10,
          d.checkIn,
          d.checkOut,
          d.total,
          d.booking,
          d.deposit,
          d.depositType,
          rows[i][10],
          rows[i][11],
          d.matrimonio,
          rows[i][13],
          rows[i][14],
          now()
        ]]);
        return jsonOk({ updated: true });
      }
    }
    return jsonError("Ospite non trovato");
  }

  const sh = getSheet(SHEETS.OSPITI);

  if (method === "GET") {
    return jsonOk(getRows(sh));
  }

  if (method === "POST" && !e.parameter._method) {
    const d = parseBody(e);
    sh.appendRow([
      uid(),
      d.name,
      d.adults,
      d.kidsU10,
      d.checkIn,
      d.checkOut,
      d.total,
      d.booking,
      d.deposit,
      d.depositType,
      false,
      "",
      d.matrimonio,
      false,
      false,
      now(),
      now()
    ]);
    return jsonOk({ saved: true });
  }

  if (method === "POST" && e.parameter._method === "DELETE") {
    deleteById(sh, e.parameter.id);
    deleteWhere(getSheet(SHEETS.STANZE), "ospite_id", e.parameter.id);
    return jsonOk({ deleted: true });
  }
}

/* =========================
   STANZE
========================= */

function handleStanze(e, method) {
  const sh = getSheet(SHEETS.STANZE);

  if (method === "POST") {
    const d = parseBody(e);
    deleteWhere(sh, "ospite_id", d.ospite_id);

    d.stanze.forEach(s => {
      sh.appendRow([
        uid(),
        d.ospite_id,
        s.stanza_num,
        s.letto_m,
        s.letto_s,
        s.culla,
        s.note || "",
        now(),
        now()
      ]);
    });
    return jsonOk({ saved: true });
  }
}

/* =========================
   MOTIVAZIONI
========================= */

function handleMotivazioni(e, method) {
  const sh = getSheet(SHEETS.MOTIVAZIONI);

  if (method === "GET") return jsonOk(getRows(sh));

  if (method === "POST") {
    const d = parseBody(e);
    sh.appendRow([uid(), d.motivazione, true, now(), now()]);
    return jsonOk({ saved: true });
  }
}

/* =========================
   IVA CONFIG
========================= */

function getIvaConfig(cat) {
  const map = {
    CONTANTI: { aliquota: 0, detraibile: false },
    TASSA_SOGGIORNO: { aliquota: 0, detraibile: false },
    IVA_22: { aliquota: 0.22, detraibile: true },
    IVA_10: { aliquota: 0.10, detraibile: true },
    IVA_4: { aliquota: 0.04, detraibile: true }
  };
  return map[cat] || { aliquota: 0, detraibile: false };
}

/* =========================
   HELPERS
========================= */

function toISODate(v) {
  if (v instanceof Date) {
    return v.toISOString().slice(0, 10);
  }
  return String(v || "").slice(0, 10);
}

function getSheet(name) {
  return SpreadsheetApp.getActive().getSheetByName(name);
}

function getRows(sh) {
  const [h, ...rows] = sh.getDataRange().getValues();
  return rows.map(r => Object.fromEntries(h.map((k, i) => [k, r[i]])));
}

function deleteById(sh, id) {
  const rows = sh.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(id)) {
      sh.deleteRow(i + 1);
      return;
    }
  }
}

function deleteWhere(sh, col, val) {
  const rows = sh.getDataRange().getValues();
  const idx = rows[0].indexOf(col);
  for (let i = rows.length - 1; i > 0; i--) {
    if (rows[i][idx] === val) sh.deleteRow(i + 1);
  }
}

function parseBody(e) {
  return JSON.parse(e.postData.contents || "{}");
}

function uid() {
  return Utilities.getUuid();
}

function now() {
  return new Date().toISOString();
}

function round(n) {
  return Math.round(n * 100) / 100;
}

function roundObj(o) {
  Object.keys(o).forEach(k => o[k] = round(o[k]));
  return o;
}

function roundNested(o) {
  Object.keys(o).forEach(k => roundObj(o[k]));
  return o;
}

function jsonOk(data) {
  return ContentService.createTextOutput(
    JSON.stringify({ ok: true, data })
  ).setMimeType(ContentService.MimeType.JSON);
}

function jsonError(msg) {
  return ContentService.createTextOutput(
    JSON.stringify({ ok: false, error: msg })
  ).setMimeType(ContentService.MimeType.JSON);
}
