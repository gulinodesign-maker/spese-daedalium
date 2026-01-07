/**
 * dDAE Google Apps Script API
 * - Actions: ospiti, spese, motivazioni, report
 * - Auth: apiKey query param must match API_KEY
 * - Transport: GET/POST (web app). Supports method override via _method (DELETE/PUT) in query or JSON body.
 *
 * Recommended Script Timezone: Europe/Rome
 */

// ========= CONFIG =========
const API_KEY = "daedalium2026"; // must match your PWA config.js
const SHEET_NAMES = {
  ospiti: "ospiti",
  spese: "spese",
  motivazioni: "motivazioni",
  stanze: "stanze",
};
const AUTO_ADD_HEADERS = true; // if true, missing headers are appended automatically (safe for incremental evolution)

// ========= ENTRYPOINTS =========
function doGet(e) {
  return handle_(e, "GET");
}

function doPost(e) {
  // Web Apps support GET/POST only. Client can send _method=DELETE/PUT to simulate other verbs.
  return handle_(e, "POST");
}

// ========= ROUTER =========
function handle_(e, verbFromDoFn) {
  try {
    const p = (e && e.parameter) ? e.parameter : {};
    const action = String(p.action || "").trim();
    const apiKey = String(p.apiKey || "").trim();

    // Basic hard auth
    if (!apiKey || apiKey !== API_KEY) {
      return jsonOut_({ ok: false, error: "Unauthorized" }, 401);
    }

    // Support method override
    const body = parseBody_(e);
    const override = String(p._method || (body && body._method) || "").toUpperCase().trim();
    const method = override || verbFromDoFn;

    if (!action) {
      return jsonOut_({ ok: false, error: "Missing action" }, 400);
    }

    switch (action) {
      case "ospiti": return handleOspiti_(method, p, body);
      case "spese": return handleSpese_(method, p, body);
      case "motivazioni": return handleMotivazioni_(method, p, body);
      case "report": return handleReport_(method, p, body);
      case "stanze": return handleStanze_(method, p, body);
      default:
        return jsonOut_({ ok: false, error: "Unknown action: " + action }, 400);
    }
  } catch (err) {
    return jsonOut_({ ok: false, error: (err && err.message) ? err.message : String(err) }, 500);
  }
}

// ========= OSPITI =========
function handleOspiti_(method, params, body) {
  const sh = getSheet_(SHEET_NAMES.ospiti);
  ensureHeaders_(sh, [
    "id","nome","adulti","bambini_u10","check_in","check_out",
    "importo_prenotazione","importo_booking","acconto_importo","acconto_tipo",
    "saldo_pagato","saldo_tipo","matrimonio","ps_registrato","istat_registrato",
    "created_at","updated_at","createdAt","updatedAt","importo_prenota"
  ]);

  if (method === "GET") {
    const from = String(params.from || "").trim();
    const to = String(params.to || "").trim();

    const rows = readAll_(sh);
    const filtered = filterByDateOverlap_(rows, from, to, "check_in", "check_out");
    // Map to app-friendly keys expected by app.js
    const data = filtered.map(r => ({
      id: r.id || "",
      name: r.nome || "",
      adults: toInt_(r.adulti),
      kidsU10: toInt_(r.bambini_u10),
      checkIn: toIsoDate_(r.check_in),
      checkOut: toIsoDate_(r.check_out),
      rooms: toInt_(r.stanze),
      // app uses "total" as importo prenotazione
      total: toNum_(firstNonEmpty_(r.importo_prenotazione, r.importo_prenota)),
      booking: toNum_(r.importo_booking),
      deposit: toNum_(r.acconto_importo),
      depositType: r.acconto_tipo || "",
      matrimonio: toBool_(r.matrimonio),
      // passthrough flags if present
      ps_registrato: toBool_(r.ps_registrato),
      istat_registrato: toBool_(r.istat_registrato),
      // keep extra useful fields in case UI expands
      letto_tipologia: r.letto_tipologia || "",
      letti_matrimoniali: toInt_(r.letti_matrimoniali),
      letti_singoli: toInt_(r.letti_singoli),
      culle: toInt_(r.culle),
      letti_per_stanza: r.letti_per_stanza || "",
      saldo_pagato: toNum_(r.saldo_pagato),
      saldo_tipo: r.saldo_tipo || "",
      created_at: r.created_at || "",
      updated_at: r.updated_at || "",
      createdAt: r.createdAt || "",
    }));

    return jsonOut_({ ok: true, data: data });
  }

  if (method === "POST" || method === "PUT") {
    if (!body) return jsonOut_({ ok: false, error: "Missing body" }, 400);

    // Accept app payload keys (English-ish) and map to sheet headers (Italian)
    const nowIso = new Date().toISOString();
    const incomingId = String(body.id || "").trim();
    const id = incomingId || newId_();

    const record = {
      id: id,
      nome: body.name || body.nome || "",
      adulti: toInt_(body.adults ?? body.adulti),
      bambini_u10: toInt_(body.kidsU10 ?? body.bambini_u10),
      check_in: body.checkIn || body.check_in || "",
      check_out: body.checkOut || body.check_out || "",
      stanze: toInt_(body.rooms ?? body.stanze),
      importo_prenotazione: toNum_(body.total ?? body.importo_prenotazione ?? body.importo_prenota),
      importo_booking: toNum_(body.booking ?? body.importo_booking),
      acconto_importo: toNum_(body.deposit ?? body.acconto_importo),
      acconto_tipo: body.depositType || body.acconto_tipo || "",
      matrimonio: toBool_(body.matrimonio),
      ps_registrato: toBool_(body.ps_registrato),
      istat_registrato: toBool_(body.istat_registrato),
      // optional extended fields
      letto_tipologia: body.letto_tipologia || "",
      letti_matrimoniali: toInt_(body.letti_matrimoniali),
      letti_singoli: toInt_(body.letti_singoli),
      culle: toInt_(body.culle),
      letti_per_stanza: body.letti_per_stanza || "",
      saldo_pagato: toNum_(body.saldo_pagato),
      saldo_tipo: body.saldo_tipo || "",
      updated_at: nowIso,
      updatedAt: nowIso, // some people prefer camelCase; doesn't hurt if header exists
    };

    // created fields only for new records
    const isNew = !incomingId;
    if (isNew) {
      record.created_at = nowIso;
      record.createdAt = nowIso;
    }

    upsertById_(sh, "id", id, record);

    // Compatibilità: se arrivano stanze/letti dal client, salva anche nel foglio "stanze"
    try {
      if (body && (body.rooms || body.stanze || body.lettiPerStanza || body.letti_per_stanza || body.stanzeRows || body.stanze_rows)) {
        saveStanzeForOspiteFromBody_(id, body);
      }
    } catch (_) {}

    return jsonOut_({ ok: true, data: { id: id } });
  }

  if (method === "DELETE") {
    const id = String(params.id || "").trim();
    if (!id) return jsonOut_({ ok: false, error: "Missing id" }, 400);

    deleteById_(sh, "id", id);
    try { deleteStanzeByOspiteId_(id); } catch (_) {}
    return jsonOut_({ ok: true, data: { id: id } });
  }

  return jsonOut_({ ok: false, error: "Unsupported method for ospiti: " + method }, 405);
}


// ========= STANZE =========
// Sheet "stanze": 1 riga = 1 stanza per 1 ospite/prenotazione
function handleStanze_(method, params, body) {
  const sh = getSheet_(SHEET_NAMES.stanze);
  ensureHeaders_(sh, ["id","ospite_id","stanza_num","letto_m","letto_s","culla","note","createdAt","updatedAt"]);

  if (method === "GET") {
    const ospite_id = String(params.ospite_id || "").trim();
    const ospite_ids = String(params.ospite_ids || "").trim(); // comma-separated

    let wanted = null;
    if (ospite_ids) {
      wanted = new Set(ospite_ids.split(/[,+\s]+/).map(s=>String(s||"").trim()).filter(Boolean));
    } else if (ospite_id) {
      wanted = new Set([ospite_id]);
    }

    const rows = readAll_(sh);
    const data = rows
      .filter(r => {
        const oid = String(r.ospite_id || "").trim();
        if (!oid) return false;
        if (wanted && !wanted.has(oid)) return false;
        return true;
      })
      .map(r => ({
        id: r.id || "",
        ospite_id: String(r.ospite_id || "").trim(),
        stanza_num: toInt_(r.stanza_num),
        letto_m: toBool_(r.letto_m),
        letto_s: toInt_(r.letto_s),
        culla: toBool_(r.culla),
        note: r.note || "",
        createdAt: r.createdAt || "",
        updatedAt: r.updatedAt || ""
      }))
      .sort((a,b)=> (a.ospite_id===b.ospite_id ? (a.stanza_num-b.stanza_num) : String(a.ospite_id).localeCompare(String(b.ospite_id))));

    return jsonOut_({ ok: true, data: data });
  }

  if (method === "POST" || method === "PUT") {
    if (!body) return jsonOut_({ ok: false, error: "Missing body" }, 400);

    const ospite_id = String(body.ospite_id || body.ospiteId || body.guest_id || "").trim();
    if (!ospite_id) return jsonOut_({ ok: false, error: "Missing ospite_id" }, 400);

    let arr = [];
    if (Array.isArray(body.stanze)) {
      arr = body.stanze;
    } else {
      const rooms = parseRooms_(body.rooms || body.stanze);
      const lp = parseLettiPerStanza_(body.lettiPerStanza || body.letti_per_stanza);
      arr = rooms.map(n => {
        const d = lp[String(n)] || lp[n] || {};
        return { stanza_num: n, letto_m: !!d.matrimoniale, letto_s: toInt_(d.singoli), culla: !!d.culla, note: d.note || "" };
      });
    }

    const norm = [];
    (arr || []).forEach(x => {
      const n = toInt_(x.stanza_num ?? x.stanzaNum ?? x.room ?? x.stanza);
      if (!isFinite(n) || n<=0) return;
      norm.push({
        stanza_num: n,
        letto_m: toBool_(x.letto_m ?? x.lettoM ?? x.matrimoniale),
        letto_s: toInt_(x.letto_s ?? x.lettoS ?? x.singoli),
        culla: toBool_(x.culla),
        note: x.note || ""
      });
    });
    norm.sort((a,b)=>a.stanza_num-b.stanza_num);

    replaceStanzeForOspite_(ospite_id, norm);

    return jsonOut_({ ok: true, data: { ospite_id: ospite_id, count: norm.length } });
  }

  if (method === "DELETE") {
    const ospite_id = String(params.ospite_id || "").trim();
    if (!ospite_id) return jsonOut_({ ok: false, error: "Missing ospite_id" }, 400);
    deleteStanzeByOspiteId_(ospite_id);
    return jsonOut_({ ok: true, data: { ospite_id: ospite_id } });
  }

  return jsonOut_({ ok: false, error: "Unsupported method for stanze: " + method }, 405);
}

function deleteStanzeByOspiteId_(ospite_id){
  let sh;
  try { sh = getSheet_(SHEET_NAMES.stanze); } catch (_) { return; }
  ensureHeaders_(sh, ["id","ospite_id","stanza_num","letto_m","letto_s","culla","note","createdAt","updatedAt"]);

  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();
  if (lastRow < 2) return;

  const headers = sh.getRange(1,1,1,lastCol).getValues()[0].map(h => String(h||"").trim());
  const col = headers.indexOf("ospite_id") + 1;
  if (col < 1) throw new Error('Missing "ospite_id" header in stanze');

  const values = sh.getRange(2, col, lastRow-1, 1).getValues().map(r => String(r[0]||"").trim());
  const toDelete = [];
  values.forEach((v, i) => { if (v === String(ospite_id)) toDelete.push(i+2); });
  toDelete.sort((a,b)=>b-a).forEach(rn => sh.deleteRow(rn));
}

function replaceStanzeForOspite_(ospite_id, stanzeArr){
  deleteStanzeByOspiteId_(ospite_id);

  const sh = getSheet_(SHEET_NAMES.stanze);
  const nowIso = new Date().toISOString();

  const lastCol = sh.getLastColumn();
  const headers = sh.getRange(1,1,1,lastCol).getValues()[0].map(h => String(h||"").trim());

  const rowFromObj = (obj) => headers.map(h => {
    if (h === "id") return obj.id;
    if (h === "ospite_id") return obj.ospite_id;
    if (h === "stanza_num") return obj.stanza_num;
    if (h === "letto_m") return !!obj.letto_m;
    if (h === "letto_s") return toInt_(obj.letto_s);
    if (h === "culla") return !!obj.culla;
    if (h === "note") return obj.note || "";
    if (h === "createdAt") return obj.createdAt;
    if (h === "updatedAt") return obj.updatedAt;
    return "";
  });

  const rows = (stanzeArr || []).map(s => ({
    id: newId_(),
    ospite_id: String(ospite_id),
    stanza_num: toInt_(s.stanza_num),
    letto_m: toBool_(s.letto_m),
    letto_s: toInt_(s.letto_s),
    culla: toBool_(s.culla),
    note: s.note || "",
    createdAt: nowIso,
    updatedAt: nowIso
  }));

  if (!rows.length) return;

  const startRow = sh.getLastRow() + 1;
  sh.getRange(startRow, 1, rows.length, headers.length).setValues(rows.map(rowFromObj));
}

function saveStanzeForOspiteFromBody_(ospite_id, body){
  const payload = {
    ospite_id,
    stanze: Array.isArray(body.stanze) ? body.stanze : null,
    rooms: body.rooms || body.stanze,
    lettiPerStanza: body.lettiPerStanza || body.letti_per_stanza
  };

  let arr = [];
  if (Array.isArray(payload.stanze)) {
    arr = payload.stanze;
  } else {
    const rooms = parseRooms_(payload.rooms);
    const lp = parseLettiPerStanza_(payload.lettiPerStanza);
    arr = rooms.map(n => {
      const d = lp[String(n)] || lp[n] || {};
      return { stanza_num: n, letto_m: !!d.matrimoniale, letto_s: toInt_(d.singoli), culla: !!d.culla, note: d.note || "" };
    });
  }

  const norm = [];
  (arr || []).forEach(x => {
    const n = toInt_(x.stanza_num ?? x.stanzaNum ?? x.room ?? x.stanza);
    if (!isFinite(n) || n<=0) return;
    norm.push({
      stanza_num: n,
      letto_m: toBool_(x.letto_m ?? x.lettoM ?? x.matrimoniale),
      letto_s: toInt_(x.letto_s ?? x.lettoS ?? x.singoli),
      culla: toBool_(x.culla),
      note: x.note || ""
    });
  });
  norm.sort((a,b)=>a.stanza_num-b.stanza_num);

  replaceStanzeForOspite_(ospite_id, norm);
}

// ========= SPESE =========
function handleSpese_(method, params, body) {
  const sh = getSheet_(SHEET_NAMES.spese);
  ensureHeaders_(sh, [
    "id","createdAt","dataSpesa","categoria","motivazione","importoLordo",
    "aliquotaIva","imponibile","iva","ivaDetraibile","note","isDeleted","updatedAt"
  ]);

  if (method === "GET") {
    const from = String(params.from || "").trim();
    const to = String(params.to || "").trim();

    const rows = readAll_(sh).filter(r => !toBool_(r.isDeleted));
    const filtered = filterByDateRange_(rows, from, to, "dataSpesa");
    const data = filtered.map(r => ({
      id: r.id || "",
      createdAt: r.createdAt || "",
      dataSpesa: toIsoDate_(r.dataSpesa),
      categoria: r.categoria || "",
      motivazione: r.motivazione || "",
      importoLordo: toNum_(r.importoLordo),
      aliquotaIva: toNum_(r.aliquotaIva),
      imponibile: toNum_(r.imponibile),
      iva: toNum_(r.iva),
      ivaDetraibile: toNum_(r.ivaDetraibile),
      note: r.note || "",
      isDeleted: toBool_(r.isDeleted),
      updatedAt: r.updatedAt || "",
    }));

    // Sort by date desc (newest first) for nicer UX
    data.sort((a,b)=> String(b.dataSpesa||"").localeCompare(String(a.dataSpesa||"")));
    return jsonOut_({ ok: true, data: data });
  }

  if (method === "POST" || method === "PUT") {
    if (!body) return jsonOut_({ ok: false, error: "Missing body" }, 400);

    const nowIso = new Date().toISOString();
    const incomingId = String(body.id || "").trim();
    const id = incomingId || newId_();

    const importoLordo = toNum_(body.importoLordo);
    const aliquotaIva = (body.aliquotaIva !== undefined && body.aliquotaIva !== null && body.aliquotaIva !== "")
      ? toNum_(body.aliquotaIva) : 0;

    const calc = calcIva_(importoLordo, aliquotaIva);

    const record = {
      id: id,
      createdAt: incomingId ? undefined : nowIso,
      dataSpesa: body.dataSpesa || "",
      categoria: body.categoria || "",
      motivazione: body.motivazione || "",
      importoLordo: importoLordo,
      aliquotaIva: aliquotaIva,
      imponibile: calc.imponibile,
      iva: calc.iva,
      ivaDetraibile: (body.ivaDetraibile !== undefined && body.ivaDetraibile !== null && body.ivaDetraibile !== "")
        ? toNum_(body.ivaDetraibile) : calc.iva,
      note: body.note || "",
      isDeleted: false,
      updatedAt: nowIso,
    };

    // Remove undefined so we don't overwrite createdAt when updating
    Object.keys(record).forEach(k => { if (record[k] === undefined) delete record[k]; });

    upsertById_(sh, "id", id, record);

    // Compatibilità: se arrivano stanze/letti dal client, salva anche nel foglio "stanze"
    try {
      if (body && (body.rooms || body.stanze || body.lettiPerStanza || body.letti_per_stanza || body.stanzeRows || body.stanze_rows)) {
        saveStanzeForOspiteFromBody_(id, body);
      }
    } catch (_) {}

    return jsonOut_({ ok: true, data: { id: id } });
  }

  if (method === "DELETE") {
    const id = String(params.id || "").trim();
    if (!id) return jsonOut_({ ok: false, error: "Missing id" }, 400);

    // Soft delete: set isDeleted = true
    const nowIso = new Date().toISOString();
    upsertById_(sh, "id", id, { id: id, isDeleted: true, updatedAt: nowIso });
    return jsonOut_({ ok: true, data: { id: id } });
  }

  return jsonOut_({ ok: false, error: "Unsupported method for spese: " + method }, 405);
}

// ========= MOTIVAZIONI =========
// (not requested explicitly, but your app calls it; provided for completeness)
function handleMotivazioni_(method, params, body) {
  const sh = getSheet_(SHEET_NAMES.motivazioni);
  ensureHeaders_(sh, ["id","motivazione","attiva","updatedAt","createdAt"]);

  if (method === "GET") {
    const rows = readAll_(sh);
    const data = rows
      .filter(r => r.motivazione && toBool_(r.attiva) !== false)
      .map(r => ({
        id: r.id || "",
        motivazione: r.motivazione || "",
        attiva: toBool_(r.attiva) !== false,
        updatedAt: r.updatedAt || "",
        createdAt: r.createdAt || "",
      }))
      .sort((a,b)=> String(a.motivazione).localeCompare(String(b.motivazione)));
    return jsonOut_({ ok: true, data: data });
  }

  if (method === "POST" || method === "PUT") {
    if (!body) return jsonOut_({ ok: false, error: "Missing body" }, 400);
    const nowIso = new Date().toISOString();
    const motivazione = String(body.motivazione || "").trim();
    if (!motivazione) return jsonOut_({ ok: false, error: "Missing motivazione" }, 400);

    // If exists (case-insensitive), just ensure active
    const existing = findRowByValue_(sh, "motivazione", motivazione, true);
    if (existing) {
      upsertById_(sh, "id", existing.id, { id: existing.id, motivazione: existing.motivazione, attiva: true, updatedAt: nowIso });
      return jsonOut_({ ok: true, data: { id: existing.id } });
    }

    const id = newId_();
    upsertById_(sh, "id", id, { id, motivazione, attiva: true, createdAt: nowIso, updatedAt: nowIso });
    return jsonOut_({ ok: true, data: { id } });
  }

  return jsonOut_({ ok: false, error: "Unsupported method for motivazioni: " + method }, 405);
}

// ========= REPORT =========
// (not requested explicitly, but your app loads it at startup)
function handleReport_(method, params, body) {
  if (method !== "GET") return jsonOut_({ ok: false, error: "Unsupported method for report: " + method }, 405);

  const from = String(params.from || "").trim();
  const to = String(params.to || "").trim();

  const sh = getSheet_(SHEET_NAMES.spese);
  ensureHeaders_(sh, [
    "id","createdAt","dataSpesa","categoria","motivazione","importoLordo",
    "aliquotaIva","imponibile","iva","ivaDetraibile","note","isDeleted","updatedAt"
  ]);

  const rows = readAll_(sh).filter(r => !toBool_(r.isDeleted));
  const filtered = filterByDateRange_(rows, from, to, "dataSpesa");

  const totals = {
    importoLordo: 0,
    imponibile: 0,
    ivaDetraibile: 0,
  };
  const byCategoria = {};

  filtered.forEach(r => {
    const cat = String(r.categoria || "ALTRO").trim() || "ALTRO";
    const impLordo = toNum_(r.importoLordo);
    const imp = toNum_(r.imponibile);
    const ivaDet = toNum_(r.ivaDetraibile);

    totals.importoLordo += impLordo;
    totals.imponibile += imp;
    totals.ivaDetraibile += ivaDet;

    if (!byCategoria[cat]) byCategoria[cat] = { importoLordo: 0 };
    byCategoria[cat].importoLordo += impLordo;
  });

  // round to 2 decimals
  Object.keys(totals).forEach(k => totals[k] = round2_(totals[k]));
  Object.keys(byCategoria).forEach(k => byCategoria[k].importoLordo = round2_(byCategoria[k].importoLordo));

  return jsonOut_({ ok: true, data: { totals, byCategoria } });
}

// ========= HELPERS =========
function jsonOut_(obj, statusCode) {
  // Apps Script WebApp ignores custom status codes in most contexts; we keep it for clarity in payload
  if (statusCode) obj._status = statusCode;

  const out = ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);

  return out;
}

function parseBody_(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) return null;
    const txt = e.postData.contents;
    if (!txt) return null;
    return JSON.parse(txt);
  } catch (_) {
    return null;
  }
}

function getSheet_(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet(); // preferred: container-bound script
  const sh = ss.getSheetByName(name);
  if (!sh) throw new Error("Sheet not found: " + name);
  return sh;
}

function ensureHeaders_(sheet, headers) {
  const lastCol = sheet.getLastColumn();
  const row1 = lastCol ? sheet.getRange(1,1,1,lastCol).getValues()[0] : [];
  const existing = row1.map(h => String(h || "").trim()).filter(Boolean);

  if (!existing.length) {
    sheet.getRange(1,1,1,headers.length).setValues([headers]);
    return;
  }

  if (!AUTO_ADD_HEADERS) return;

  const missing = headers.filter(h => existing.indexOf(h) === -1);
  if (missing.length) {
    sheet.getRange(1, existing.length + 1, 1, missing.length).setValues([missing]);
  }
}

function readAll_(sheet) {
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return [];

  const values = sheet.getRange(1,1,lastRow,lastCol).getValues();
  const headers = values[0].map(h => String(h || "").trim());

  const out = [];
  for (let r=1; r<values.length; r++){
    const row = values[r];
    // skip totally empty rows
    let nonEmpty = false;
    for (let c=0; c<row.length; c++){ if (row[c] !== "" && row[c] !== null) { nonEmpty = true; break; } }
    if (!nonEmpty) continue;

    const obj = {};
    for (let c=0; c<headers.length; c++){
      const key = headers[c];
      if (!key) continue;
      obj[key] = row[c];
    }
    out.push(obj);
  }
  return out;
}

function upsertById_(sheet, idHeader, idValue, record) {
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastCol < 1) throw new Error("Sheet has no columns: " + sheet.getName());

  const headers = sheet.getRange(1,1,1,lastCol).getValues()[0].map(h => String(h || "").trim());
  const idCol = headers.indexOf(idHeader) + 1;
  if (idCol < 1) throw new Error("Missing id header '" + idHeader + "' in sheet " + sheet.getName());

  let targetRow = -1;
  if (lastRow >= 2) {
    const ids = sheet.getRange(2, idCol, lastRow-1, 1).getValues().map(x => String(x[0] || ""));
    const idx = ids.indexOf(String(idValue));
    if (idx >= 0) targetRow = idx + 2;
  }

  if (targetRow === -1) {
    // append new
    targetRow = lastRow + 1;
    sheet.insertRowAfter(lastRow);
  }

  // write only provided fields (do not blank others)
  const rowRange = sheet.getRange(targetRow, 1, 1, lastCol);
  const current = rowRange.getValues()[0];

  headers.forEach((h, i) => {
    if (!h) return;
    if (record.hasOwnProperty(h)) {
      current[i] = normalizeSheetValue_(h, record[h]);
    }
  });

  rowRange.setValues([current]);
}

function deleteById_(sheet, idHeader, idValue) {
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 2) throw new Error("No data to delete");
  const headers = sheet.getRange(1,1,1,lastCol).getValues()[0].map(h => String(h || "").trim());
  const idCol = headers.indexOf(idHeader) + 1;
  if (idCol < 1) throw new Error("Missing id header '" + idHeader + "' in sheet " + sheet.getName());

  const ids = sheet.getRange(2, idCol, lastRow-1, 1).getValues().map(x => String(x[0] || ""));
  const idx = ids.indexOf(String(idValue));
  if (idx < 0) throw new Error("Not found: " + idValue);

  const rowNum = idx + 2;
  sheet.deleteRow(rowNum);
}

function findRowByValue_(sheet, header, value, caseInsensitive) {
  const rows = readAll_(sheet);
  const target = caseInsensitive ? String(value).trim().toLowerCase() : String(value).trim();
  for (let i=0;i<rows.length;i++){
    const v = caseInsensitive ? String(rows[i][header]||"").trim().toLowerCase() : String(rows[i][header]||"").trim();
    if (v && v === target) return rows[i];
  }
  return null;
}

function filterByDateRange_(rows, from, to, field) {
  const f = parseIso_(from);
  const t = parseIso_(to);
  if (!f && !t) return rows;

  return rows.filter(r => {
    const d = parseIso_(toIsoDate_(r[field]));
    if (!d) return true;
    if (f && d < f) return false;
    if (t && d > t) return false;
    return true;
  });
}

// Overlap between [from,to] and [startField,endField]
function filterByDateOverlap_(rows, from, to, startField, endField) {
  const f = parseIso_(from);
  const t = parseIso_(to);
  if (!f && !t) return rows;

  return rows.filter(r => {
    const s = parseIso_(toIsoDate_(r[startField]));
    const e = parseIso_(toIsoDate_(r[endField]));
    if (!s && !e) return true;

    // if only one date is available, fallback to simple range check
    const start = s || e;
    const end = e || s;

    if (f && end && end < f) return false;
    if (t && start && start > t) return false;
    return true;
  });
}

function normalizeSheetValue_(header, v) {
  // Store booleans as TRUE/FALSE
  if (typeof v === "boolean") return v;

  // Date fields: try to convert YYYY-MM-DD into Date so Sheets can format/sort properly
  const h = String(header || "").toLowerCase();
  const isDateField = (h.indexOf("check_") === 0) || (h.indexOf("dataspesa") >= 0);
  if (isDateField) {
    const d = parseIso_(String(v || "").trim());
    if (d) return d; // Date object
    return v || "";
  }

  return (v === undefined || v === null) ? "" : v;
}

function newId_() {
  // short stable-ish id (timestamp + random)
  const now = new Date();
  const t = Utilities.formatDate(now, Session.getScriptTimeZone(), "yyyyMMddHHmmss");
  const rnd = Math.floor(Math.random()*1e6).toString().padStart(6,"0");
  return "id_" + t + "_" + rnd;
}

function parseIso_(s) {
  const str = String(s || "").trim();
  if (!str) return null;
  // Accept YYYY-MM-DD
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(str);
  if (m) {
    const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
    if (y && mo && d) return new Date(Date.UTC(y, mo-1, d, 0,0,0));
  }
  // Accept Date objects
  if (Object.prototype.toString.call(s) === "[object Date]" && !isNaN(s.getTime())) return s;
  // Fallback
  const dt = new Date(str);
  if (!isNaN(dt.getTime())) return dt;
  return null;
}

function toIsoDate_(v) {
  if (!v) return "";
  if (Object.prototype.toString.call(v) === "[object Date]" && !isNaN(v.getTime())) {
    // Use script timezone for consistent UI dates
    return Utilities.formatDate(v, Session.getScriptTimeZone(), "yyyy-MM-dd");
  }
  const s = String(v).trim();
  // If already yyyy-mm-dd, keep
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = parseIso_(s);
  if (d) return Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM-dd");
  return s;
}

function toNum_(v) {
  if (v === "" || v === null || v === undefined) return 0;
  if (typeof v === "number") return round2_(v);
  const s = String(v).replace(",", ".").replace(/[^\d.\-]/g, "");
  const n = Number(s);
  return isNaN(n) ? 0 : round2_(n);
}
function toInt_(v) {
  const n = toNum_(v);
  return Math.round(n);
}
function toBool_(v) {
  if (v === true) return true;
  if (v === false) return false;
  const s = String(v || "").trim().toLowerCase();
  if (!s) return false;
  return (s === "true" || s === "1" || s === "yes" || s === "si" || s === "sì" || s === "x" || s === "y");
}
function round2_(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}
function firstNonEmpty_() {
  for (let i=0;i<arguments.length;i++){
    const v = arguments[i];
    if (v !== undefined && v !== null && String(v).trim() !== "") return v;
  }
  return "";
}
function calcIva_(importoLordo, aliquota) {
  const a = Number(aliquota) || 0;
  if (!a) return { imponibile: round2_(importoLordo), iva: 0 };
  const imponibile = importoLordo / (1 + a/100);
  const iva = importoLordo - imponibile;
  return { imponibile: round2_(imponibile), iva: round2_(iva) };
}
