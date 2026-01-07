# dDAE Apps Script API (ospiti / spese)

## Come usare
1. Apri Google Sheets con le tab `ospiti`, `spese`, `motivazioni`.
2. Estensioni → Apps Script.
3. Incolla **Code.gs** (sostituisci quello esistente) e salva.
4. Imposta il fuso orario progetto su **Europe/Rome** (opzionale se già).
5. Deploy → **New deployment** → **Web app**:
   - Execute as: **Me**
   - Who has access: **Anyone** (o "Anyone with the link")
6. Copia l'URL `/exec` e mettilo in `config.js` della tua PWA.

## API (client)
Tutte le chiamate includono:
- `?action=ospiti|spese|report|motivazioni`
- `&apiKey=daedalium2026`

Metodi:
- GET: lista
- POST: inserisci/aggiorna (se `id` presente)
- DELETE: via `_method=DELETE` o param `_method` nel body/query (la tua app già lo gestisce)

Esempi:
- GET ospiti: `...?action=ospiti&apiKey=...&from=2026-01-01&to=2026-01-31`
- POST spesa: `...?action=spese&apiKey=...` body JSON `{dataSpesa,categoria,motivazione,importoLordo,note}`
- DELETE spesa: `...?action=spese&apiKey=...&_method=DELETE&id=...`
