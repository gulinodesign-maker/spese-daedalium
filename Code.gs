/*************************************************
 * dDAE Backend (Google Apps Script)
 * - Formato risposta: { ok:true, data:* }
 * - apiKey obbligatoria
 * - DELETE reale per ospiti/spese
 * - Report compatibile con UI (totals + byCategoria)
 * - Calcolo IVA automatico per spese
 *************************************************/

const API_KEY = "daedalium2026";

const SHEETS = {
  OSPITI: "ospiti",
  STANZE: "stanze",
  SPESE: "spese",
  MOTIVAZIONI: "motivazioni",
};

/* =========================
   ENTRY POINT
========================= */

function doGet(e) {
  return handleRequest_(e, "GET");
}

function doPost(e) {
  return handleRequest_(e, "POST");
}

function handleRequest_(e, method) {
  try {
    if (!e || !e.parameter) return jsonError_("Request non valida");

    if (String(e.parameter.apiKey || "") !== API_KEY) {
      return jsonError_("API key non valida");
    }

    // method override: PUT/DELETE via _method (frontend)
    const override = e.parameter._method;
    if (method === "POST" && override) method = String(override).toUpperCase();

    const action = String(e.parameter.action || "");
    if (!action) return jsonError_("Action mancante");

    switch (action) {
      case "ospiti":
        return handleOspiti_(e, method);
      case "stanze":
        return handleStanze_(e, method);
      case "spese":
        return handleSpese_(e, method);
      case "motivazioni":
        return handleMotivazioni_(e, method);
      case "report":
        return handleReport_(e);
      case "ping":
        return jsonOk_({ ts: new Date().toISOString() });
      default:
        return jsonError_("Action non valida: " + action);
    }
  } catch (err) {
    return jsonError_(errToString_(err));
  }
}

/* =========================
   RESPONSE
========================= */

function jsonOk_(data) {
  return ContentService.createTextOutput(
    JSON.stringify({ ok: true, data: data })
  ).setMimeType(ContentService.MimeType.JSON);
}

function jsonError_(msg) {
  return ContentService.createTextOutput(
    JSON.stringify({ ok: false, error: String(msg || "Errore") })
  ).setMimeType(ContentService.MimeType.JSON);
}

function errToString_(err) {
  try {
    if (!err) return "Errore sconosciuto";
    if (typeof err === "string") return err;
    if (err && err.stack) return err.stack;
    return JSON.stringify(err);
  } catch (_) {
    return String(err);
  }
}

/* =========================
   SHEET UTILS
========================= */

function getSheet_(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(name);
  if (!sh) throw new Error('Foglio mancante: "' + name + '"');
  return sh;
}

function readAll_(sh) {
  const values = sh.getDataRange().getValues();
  if (!values || values.length === 0) return { headers: [], rows: [], raw: [] };

  const headers = (values[0] || []).map(h => String(h).trim());
  const rows = [];
  for (let r = 1; r < values.length; r++) {
    const obj = {};
    for (let c = 0; c < headers.length; c++) obj[headers[c]] = values[r][c];
    rows.push(obj);
  }
  return { headers, rows, raw: values };
}

function buildRowFromHeaders_(headers, obj) {
  const row = new Array(headers.length).fill("");
  for (let c = 0; c < headers.length; c++) {
    const k = headers[c];
    if (k in obj) row[c] = obj[k];
  }
  return row;
}

function upsertById_(sh, obj, idField) {
  idField = idField || "id";
  const data = sh.getDataRange().getValues();
  const headers = (data[0] || []).map(h => String(h).trim());
  const idCol = headers.indexOf(idField);

  if (idCol < 0) {
    sh.appendRow(buildRowFromHeaders_(headers, obj));
    return { mode: "append_no_idcol", id: obj[idField] || "" };
  }

  const idVal = String(obj[idField] || "").trim();
  if (!idVal) {
    sh.appendRow(buildRowFromHeaders_(headers, obj));
    return { mode: "append_no_idval", id: "" };
  }

  let foundRow = -1;
  for (let r = 1; r < data.length; r++) {
    if (String(data[r][idCol]).trim() === idVal) {
      foundRow = r;
      break;
    }
  }

  if (foundRow === -1) {
    sh.appendRow(buildRowFromHeaders_(headers, obj));
    return { mode: "append", id: idVal };
  }

  const newRow = data[foundRow].slice();
  for (let c = 0; c < headers.length; c++) {
    const key = headers[c];
    if (key in obj) newRow[c] = obj[key];
  }

  sh.getRange(foundRow + 1, 1, 1, headers.length).setValues([newRow]);
  return { mode: "update", id: idVal, row: foundRow + 1 };
}

function deleteById_(sh, idValue, idField) {
  idField = idField || "id";
  const data = sh.getDataRange().getValues();
  const headers = (data[0] || []).map(h => String(h).trim());
  const idCol = headers.indexOf(idField);
  if (idCol < 0) return 0;

  const toDelete = [];
  for (let r = 1; r < data.length; r++) {
    if (String(data[r][idCol]).trim() === String(idValue).trim()) {
      toDelete.push(r + 1);
    }
  }

  toDelete.sort((a, b) => b - a).forEach(rowNum => sh.deleteRow(rowNum));
  return toDelete.length;
}

function deleteWhere_(sh, colName, value) {
  const data = sh.getDataRange().getValues();
  const headers = (data[0] || []).map(h => String(h).trim());
  const idx = headers.indexOf(colName);
  if (idx < 0) return 0;

  const toDelete = [];
  for (let r = 1; r < data.length; r++) {
    if (String(data[r][idx]).trim() === String(value).trim()) {
      toDelete.push(r + 1);
    }
  }

  toDelete.sort((a, b) => b - a).forEach(rowNum => sh.deleteRow(rowNum));
  return toDelete.length;
}

/* =========================
   BODY / TYPE UTILS
========================= */

function parseBody_(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) return {};
    const txt = String(e.postData.contents || "").trim();
    if (!txt) return {};
    return JSON.parse(txt);
  } catch (err) {
    Logger.log("parseBody_ error: " + errToString_(err));
    return {};
  }
}

function pick_(/*...vals*/) {
  for (let i = 0; i < arguments.length; i++) {
    const v = arguments[i];
    if (v !== undefined && v !== null && String(v).trim() !== "") return v;
  }
  return "";
}

function toNumOrEmpty_(v) {
  if (v === undefined || v === null) return "";
  const s = String(v).trim();
  if (!s) return "";
  const n = Number(s.replace(",", "."));
  return isNaN(n) ? "" : n;
}

// ✅ NUOVO: converte toggle/boolean in 1 oppure ""
function toOneOrEmpty_(v) {
  if (v === true) return 1;
  if (v === false) return "";
  if (v === 1 || v === "1") return 1;
  if (v === 0 || v === "0") return "";

  const s = String(v ?? "").trim().toLowerCase();
  if (!s) return "";
  if (s === "true" || s === "on" || s === "yes" || s === "si" || s === "sì") return 1;
  if (s === "false" || s === "off" || s === "no") return "";

  const n = Number(s.replace(",", "."));
  if (!isNaN(n) && n > 0) return 1;

  return "";
}

function normalizeDateCell_(v) {
  if (v === undefined || v === null) return "";
  if (Object.prototype.toString.call(v) === "[object Date]" && !isNaN(v.getTime())) return v;

  const s = String(v).trim();
  if (!s) return "";

  const m1 = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m1) {
    const y = Number(m1[1]), mo = Number(m1[2]) - 1, d = Number(m1[3]);
    const dt = new Date(Date.UTC(y, mo, d));
    if (!isNaN(dt.getTime())) return dt;
  }

  const dt2 = new Date(s);
  if (!isNaN(dt2.getTime())) return dt2;

  return s;
}

/* =========================
   OSPITI
========================= */

function handleOspiti_(e, method) {
  const sh = getSheet_(SHEETS.OSPITI);

  if (method === "GET") {
    const { rows } = readAll_(sh);
    return jsonOk_(rows);
  }

  if (method === "POST" || method === "PUT") {
    const payload = parseBody_(e);
    const items = Array.isArray(payload) ? payload : [payload];

    const results = [];
    for (const item of items) {
      const obj = normalizeOspite_(item);
      results.push(upsertById_(sh, obj, "id"));
    }
    return jsonOk_({ saved: results.length, results: results });
  }

  if (method === "DELETE") {
    const id = String(e.parameter.id || "").trim();
    if (!id) return jsonError_("Parametro id mancante (DELETE ospiti)");

    const deleted = deleteById_(sh, id, "id");

    // elimina anche le stanze collegate
    const shSt = getSheet_(SHEETS.STANZE);
    const deletedRooms = deleteWhere_(shSt, "ospite_id", id);

    return jsonOk_({ deleted: deleted, deletedRooms: deletedRooms, id: id });
  }

  return jsonError_("Metodo non supportato per ospiti: " + method);
}

function normalizeOspite_(d) {
  d = d || {};
  const nowIso = new Date().toISOString();

  const id = String(pick_(
    d.id, d.ID, d.ospite_id, d.ospiteId, d.guest_id, d.guestId,
    ("o_" + Date.now() + "_" + Math.floor(Math.random() * 100000))
  ));

  const nome = String(pick_(d.nome, d.name, d.nominativo, d.fullname, d.fullName));
  const adulti = toNumOrEmpty_(pick_(d.adulti, d.adults, d.num_adulti, d.numAdulti));
  const bambini = toNumOrEmpty_(pick_(d.bambini_u10, d.bambiniU10, d.children_u10, d.childrenU10));

  const checkIn = normalizeDateCell_(pick_(d.check_in, d.checkIn, d.checkin, d.check_in_date, d.checkInDate));
  const checkOut = normalizeDateCell_(pick_(d.check_out, d.checkOut, d.checkout, d.check_out_date, d.checkOutDate));

  const importoPrenota = toNumOrEmpty_(pick_(d.importo_prenotazione, d.importo_prenota, d.importoPrenotazione, d.importoPrenota));
  const importoBooking = toNumOrEmpty_(pick_(d.importo_booking, d.importoBooking));

  const accontoImporto = toNumOrEmpty_(pick_(d.acconto_importo, d.accontoImporto));
  const accontoTipo = String(pick_(d.acconto_tipo, d.accontoTipo));


  const accontoRicevuta = toOneOrEmpty_(pick_(d.acconto_ricevuta, d.accontoRicevuta, d.ricevuta_acconto, d.ricevutaAcconto, d.acconto_ricevutain));

  const saldoPagato = toNumOrEmpty_(pick_(d.saldo_pagato, d.saldoPagato));
  const saldoTipo = String(pick_(d.saldo_tipo, d.saldoTipo));


  const saldoRicevuta = toOneOrEmpty_(pick_(d.saldo_ricevuta, d.saldoRicevuta, d.ricevuta_saldo, d.ricevutaSaldo, d.saldo_ricevutain));

  const matrimonio = String(pick_(d.matrimonio, d.wedding));
  const psRegistrato = String(pick_(d.ps_registrato, d.psRegistrato));
  const istatRegistrato = String(pick_(d.istat_registrato, d.istatRegistrato));

  let stanzeField = pick_(d.stanze, d.rooms);
  if (typeof stanzeField === "object" && stanzeField !== null) stanzeField = JSON.stringify(stanzeField);
  stanzeField = String(stanzeField || "");

  const createdAt = String(pick_(d.created_at, d.createdAt, nowIso));

  return {
    id: id,
    nome: nome,
    adulti: adulti,
    bambini_u10: bambini,
    check_in: checkIn,
    check_out: checkOut,

    importo_prenotazione: importoPrenota,
    importo_prenota: importoPrenota,
    importo_booking: importoBooking,

    acconto_importo: accontoImporto,
    acconto_tipo: accontoTipo,

    acconto_ricevuta: accontoRicevuta,

    saldo_pagato: saldoPagato,
    saldo_tipo: saldoTipo,

    saldo_ricevuta: saldoRicevuta,
    saldo_ricevutain: saldoRicevuta,

    matrimonio: matrimonio,
    ps_registrato: psRegistrato,
    istat_registrato: istatRegistrato,

    stanze: stanzeField,

    created_at: createdAt,
    updated_at: nowIso,
    createdAt: createdAt,
    updatedAt: nowIso,
  };
}

/* =========================
   STANZE
========================= */

function handleStanze_(e, method) {
  const sh = getSheet_(SHEETS.STANZE);

  if (method === "GET") {
    const { rows } = readAll_(sh);
    return jsonOk_(rows);
  }

  if (method === "POST" || method === "PUT") {
    const payload = parseBody_(e) || {};
    const ospiteId = String(pick_(payload.ospite_id, payload.ospiteId, payload.guest_id, payload.guestId, payload.id)).trim();
    if (!ospiteId) return jsonError_("ospite_id mancante in payload stanze");

    const stanzeArr = Array.isArray(payload.stanze) ? payload.stanze
      : Array.isArray(payload.rooms) ? payload.rooms
      : [];

    deleteWhere_(sh, "ospite_id", ospiteId);

    const headers = readAll_(sh).headers;
    let inserted = 0;

    for (const room of stanzeArr) {
      const obj = normalizeStanza_(room, ospiteId);
      sh.appendRow(buildRowFromHeaders_(headers, obj));
      inserted++;
    }

    return jsonOk_({ ospite_id: ospiteId, inserted: inserted });
  }

  return jsonError_("Metodo non supportato per stanze: " + method);
}

function normalizeStanza_(d, ospiteId) {
  d = d || {};
  const nowIso = new Date().toISOString();

  const id = String(pick_(d.id, d.ID, ("r_" + Date.now() + "_" + Math.floor(Math.random() * 100000))));
  const stanzaNum = String(pick_(d.stanza_num, d.stanzaNum, d.room_number, d.roomNumber));

  // ✅ MATRIMONIALE -> salva 1 quando è selezionato (true)
  const lettoM_raw = pick_(
    d.letto_m, d.lettoM,
    d.matrimoniale, d.letto_matrimoniale, d.lettoMatrimoniale,
    d.double_bed, d.doubleBed
  );
  const lettoM = toOneOrEmpty_(lettoM_raw);

  // letti singoli come prima (numerico)
  const lettoS = toNumOrEmpty_(pick_(d.letto_s, d.lettoS, d.single_bed, d.singleBed));

  // ✅ CULLA -> salva 1 quando è selezionata (true)
  const culla_raw = pick_(d.culla, d.crib, d.cullaPresente, d.hasCulla);
  const culla = toOneOrEmpty_(culla_raw);

  const note = String(pick_(d.note, d.notes));
  const createdAt = String(pick_(d.created_at, d.createdAt, nowIso));

  return {
    id: id,
    ospite_id: String(ospiteId),
    stanza_num: stanzaNum,
    letto_m: lettoM,
    letto_s: lettoS,
    culla: culla,
    note: note,
    created_at: createdAt,
    updated_at: nowIso,
    createdAt: createdAt,
    updatedAt: nowIso,
  };
}

/* =========================
   SPESE
========================= */

function handleSpese_(e, method) {
  const sh = getSheet_(SHEETS.SPESE);

  if (method === "GET") {
    const { rows } = readAll_(sh);

    const from = String((e.parameter && e.parameter.from) ? e.parameter.from : "").trim();
    const to = String((e.parameter && e.parameter.to) ? e.parameter.to : "").trim();

    const filtered = filterByDateRange_(rows, from, to, ["dataSpesa", "data_spesa", "data", "date"]);
    const clean = filtered.filter(r => String(r.isDeleted || r.is_deleted || "false").toLowerCase() !== "true");

    return jsonOk_(clean);
  }

  if (method === "POST" || method === "PUT") {
    const payload = parseBody_(e);
    const items = Array.isArray(payload) ? payload : [payload];

    const results = [];
    for (const item of items) {
      const obj = normalizeSpesa_(item);
      results.push(upsertById_(sh, obj, "id"));
    }
    return jsonOk_({ saved: results.length, results: results });
  }

  if (method === "DELETE") {
    const id = String(e.parameter.id || "").trim();
    if (!id) return jsonError_("Parametro id mancante (DELETE spese)");
    const deleted = deleteById_(sh, id, "id");
    return jsonOk_({ deleted: deleted, id: id });
  }

  return jsonError_("Metodo non supportato per spese: " + method);
}

function normalizeSpesa_(d) {
  d = d || {};
  const nowIso = new Date().toISOString();

  const id = String(pick_(d.id, d.ID, ("s_" + Date.now() + "_" + Math.floor(Math.random() * 100000))));
  const createdAt = String(pick_(d.createdAt, d.created_at, nowIso));

  const categoria = String(pick_(d.categoria, d.category));
  const motivazione = String(pick_(d.motivazione, d.reason));
  const note = String(pick_(d.note, d.notes, ""));

  const importoLordo = toNumOrEmpty_(pick_(d.importoLordo, d.importo_lordo, d.gross));

  const aliquota = inferAliquotaIvaFromCategoria_(categoria, d);
  const calc = calcIva_(importoLordo, aliquota, categoria);

  return {
    id: id,
    createdAt: createdAt,
    updatedAt: nowIso,

    dataSpesa: normalizeDateCell_(pick_(d.dataSpesa, d.data_spesa, d.data, d.date)),
    categoria: categoria,
    motivazione: motivazione,

    importoLordo: importoLordo,
    aliquotaIva: calc.aliquotaIva,
    imponibile: calc.imponibile,
    iva: calc.iva,
    ivaDetraibile: calc.ivaDetraibile,

    note: note,
    isDeleted: String(pick_(d.isDeleted, d.is_deleted, "false")),
  };
}

function inferAliquotaIvaFromCategoria_(categoria, d) {
  const passed = toNumOrEmpty_(pick_(d.aliquotaIva, d.aliquota_iva, d.vatRate));
  if (passed !== "") return passed;

  const c = String(categoria || "").toUpperCase();
  if (c.includes("IVA_22")) return 22;
  if (c.includes("IVA_10")) return 10;
  if (c.includes("IVA_4")) return 4;
  return 0;
}

function calcIva_(importoLordo, aliquotaIva, categoria) {
  const lordo = Number(importoLordo || 0) || 0;
  const aliq = Number(aliquotaIva || 0) || 0;

  let imponibile = 0;
  let iva = 0;

  if (aliq > 0) {
    imponibile = lordo / (1 + aliq / 100);
    iva = lordo - imponibile;
  } else {
    imponibile = lordo;
    iva = 0;
  }

  const c = String(categoria || "").toUpperCase();
  const ivaDetraibile = (c.includes("IVA_")) ? iva : 0;

  imponibile = round2_(imponibile);
  iva = round2_(iva);

  return {
    aliquotaIva: aliq,
    imponibile: imponibile,
    iva: iva,
    ivaDetraibile: round2_(ivaDetraibile),
  };
}

function round2_(n) {
  const x = Number(n || 0) || 0;
  return Math.round(x * 100) / 100;
}

/* =========================
   MOTIVAZIONI
========================= */

function handleMotivazioni_(e, method) {
  const sh = getSheet_(SHEETS.MOTIVAZIONI);

  if (method === "GET") {
    const { rows } = readAll_(sh);
    const clean = rows.filter(r => String(r.attiva || r.active || "true").toLowerCase() !== "false");
    return jsonOk_(clean);
  }

  if (method === "POST" || method === "PUT") {
    const payload = parseBody_(e);
    const items = Array.isArray(payload) ? payload : [payload];

    const results = [];
    for (const item of items) {
      const obj = normalizeMotivazione_(item);
      results.push(upsertById_(sh, obj, "id"));
    }
    return jsonOk_({ saved: results.length, results: results });
  }

  return jsonError_("Metodo non supportato per motivazioni: " + method);
}

function normalizeMotivazione_(d) {
  d = d || {};
  const nowIso = new Date().toISOString();

  const id = String(pick_(d.id, d.ID, ("m_" + Date.now() + "_" + Math.floor(Math.random() * 100000))));
  const createdAt = String(pick_(d.createdAt, d.created_at, nowIso));
  const updatedAt = nowIso;

  return {
    id: id,
    motivazione: String(pick_(d.motivazione, d.reason, d.nome, d.name)),
    attiva: String(pick_(d.attiva, d.active, "true")),
    createdAt: createdAt,
    updatedAt: updatedAt,
  };
}

/* =========================
   REPORT (compatibile UI)
========================= */

function handleReport_(e) {
  const shS = getSheet_(SHEETS.SPESE);
  const speseAll = readAll_(shS).rows;

  const from = String((e.parameter && e.parameter.from) ? e.parameter.from : "").trim();
  const to = String((e.parameter && e.parameter.to) ? e.parameter.to : "").trim();

  const spese = filterByDateRange_(speseAll, from, to, ["dataSpesa", "data_spesa", "data", "date"])
    .filter(r => String(r.isDeleted || r.is_deleted || "false").toLowerCase() !== "true");

  const totals = {
    importoLordo: 0,
    imponibile: 0,
    iva: 0,
    ivaDetraibile: 0,
  };

  const byCategoria = {};

  for (const s of spese) {
    const cat = String(s.categoria || "").toUpperCase() || "SENZA_CATEGORIA";

    const lordo = Number(s.importoLordo || 0) || 0;
    const imp = Number(s.imponibile || 0) || 0;
    const iva = Number(s.iva || 0) || 0;
    const ivaDet = Number(s.ivaDetraibile || 0) || 0;

    totals.importoLordo += lordo;
    totals.imponibile += imp;
    totals.iva += iva;
    totals.ivaDetraibile += ivaDet;

    if (!byCategoria[cat]) {
      byCategoria[cat] = { importoLordo: 0, imponibile: 0, iva: 0, ivaDetraibile: 0 };
    }
    byCategoria[cat].importoLordo += lordo;
    byCategoria[cat].imponibile += imp;
    byCategoria[cat].iva += iva;
    byCategoria[cat].ivaDetraibile += ivaDet;
  }

  totals.importoLordo = round2_(totals.importoLordo);
  totals.imponibile = round2_(totals.imponibile);
  totals.iva = round2_(totals.iva);
  totals.ivaDetraibile = round2_(totals.ivaDetraibile);

  Object.keys(byCategoria).forEach(k => {
    byCategoria[k].importoLordo = round2_(byCategoria[k].importoLordo);
    byCategoria[k].imponibile = round2_(byCategoria[k].imponibile);
    byCategoria[k].iva = round2_(byCategoria[k].iva);
    byCategoria[k].ivaDetraibile = round2_(byCategoria[k].ivaDetraibile);
  });

  return jsonOk_({
    totals: totals,
    byCategoria: byCategoria,
  });
}

/* =========================
   FILTER UTILS
========================= */

function filterByDateRange_(rows, from, to, dateFieldCandidates) {
  if (!from && !to) return rows;

  const fromD = from ? new Date(from) : null;
  const toD = to ? new Date(to) : null;

  const hasFrom = fromD && !isNaN(fromD.getTime());
  const hasTo = toD && !isNaN(toD.getTime());

  return rows.filter(r => {
    let v = "";
    for (const f of dateFieldCandidates) {
      if (r && r[f] !== undefined && r[f] !== null && String(r[f]).trim() !== "") {
        v = r[f];
        break;
      }
    }
    if (!v) return true;

    const dt = new Date(v);
    if (isNaN(dt.getTime())) return true;

    if (hasFrom && dt < fromD) return false;
    if (hasTo && dt > toD) return false;
    return true;
  });
}
