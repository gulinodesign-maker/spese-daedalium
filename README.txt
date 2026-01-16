TEMPLATE CLIENT dDAE (build 1.195)

1) Pubblica lo script Apps Script come Web App.
2) Copia l'URL del deploy e incollalo in config.js -> API_URL
3) Carica questa cartella su GitHub Pages.

Chiamate API:
- Login:
  POST ?apiKey=...&action=auth_login
  body: {"username":"...","password":"..."}
  -> ritorna token

- Tutte le altre:
  aggiungi ?token=... (o body.token)
  backend filtra automaticamente per user_id e anno_attivo.

IMPOSTAZIONI:
- Aggiungi riga globale con user_id=0 e key=anno_attivo
