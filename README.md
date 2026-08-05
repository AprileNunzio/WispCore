# WispCore - Software Gestionale WISP per Alynet

WispCore è un gestionale desktop enterprise per Wireless Internet Service Provider (WISP), costruito con **Electron + React 19 + TypeScript + Tailwind CSS 4**. Gira nativamente su Windows con un vero database locale cifrato, backup automatici e sincronizzazione multi-sede opzionale via MariaDB.

---

## 🌟 Caratteristiche Principali

### 1. Sicurezza Zero-Trust reale
- **PIN protetto con Argon2id** (via `hash-wasm`, WASM puro, nessuna compilazione nativa richiesta).
- **Database cifrato at-rest** (AES-256-GCM) — il file `wisp_data.db` su disco non è mai leggibile in chiaro.
- Chiave di cifratura protetta dal keychain del sistema operativo (DPAPI su Windows, via `safeStorage` di Electron).
- Lockout automatico dopo tentativi di PIN falliti ripetuti.
- Nessun accesso Node.js diretto dal renderer (`contextIsolation` + `sandbox` attivi, comunicazione solo via IPC tipizzato).

### 2. Dati sempre al sicuro
- Il database viene creato **automaticamente nella cartella Documenti sincronizzata con OneDrive** (se rilevata), così i dati non si perdono mai anche in caso di guasto del PC.
- **Backup automatico giornaliero** del file cifrato, con checksum SHA-256 e retention (30 giornalieri + 12 mensili).
- Ripristino guidato da un qualsiasi backup direttamente dalle Impostazioni.
- Export/import manuale in JSON per migrazioni o archiviazione.

### 3. Modulo Tecnico WISP & Anagrafica
- Gestione dati cliente: Anagrafica, Codice Fiscale, Indirizzo.
- Dettagli Tecnici WISP: Credenziali PPPoE (mascherate di default), Indirizzo IP Statico, MAC Address CPE, Modello Apparato.
- Ciclo di Fatturazione Dinamico: Mensile, Annuale o Personalizzato.

### 4. Modulo Finanziario & Provvigioni Collaboratori
- Tracciamento canoni ricorrenti e costi di installazione una-tantum.
- Gestione collaboratori sul campo con calcolo automatico delle provvigioni.
- Registro liquidazione provvigioni e audit log di ogni operazione.

### 5. Sincronizzazione Multi-Sede (MariaDB)
- Collega più postazioni/tecnici a un server MariaDB centrale online.
- Sync bidirezionale con strategia last-write-wins basata su timestamp.
- Chiave di Organizzazione condivisa per mantenere le credenziali PPPoE leggibili su tutte le sedi collegate.

### 6. Dashboard Operativa & Analytics
- Ricerca Rapida Tecnico-Operativa: filtro istantaneo per IP, MAC o credenziali PPPoE.
- Scadenzario Attivo: clienti in regola, in scadenza e insoluti.
- Grafici in tempo reale di entrate e MRR (Ricavo Mensile Ricorrente).

### 7. Auto-Update
- Verifica reale delle GitHub Releases del repository `AprileNunzio/WispCore`.

---

## 🏗️ Architettura

```
electron/
  main.js              # ciclo di vita app, finestra, CSP, job in background
  preload.cjs           # unico bridge IPC esposto al renderer (contextBridge)
  ipc/handlers.js         # handler IPC che collegano renderer <-> servizi
  services/
    paths.js               # rilevamento cartella Documenti/OneDrive
    config.js                # config.json applicativo (chiavi, impostazioni sync)
    crypto.js                  # cifratura AES-256-GCM + gestione chiavi
    auth.js                     # hashing Argon2id + lockout
    database.js                  # database SQLite (sql.js) cifrato su disco
    backup.js                     # backup/restore automatico
    sync/mariadb.js                # motore di sincronizzazione multi-sede
src/
  dbService.ts            # wrapper async verso il bridge IPC
  components/               # viste React (Dashboard, Clienti, Collaboratori, ...)
```

Il renderer non ha **mai** accesso diretto al filesystem o a Node.js: ogni operazione passa da un canale IPC esplicito e tipizzato definito in `electron/preload.cjs`.

---

## 🚀 Guida allo Sviluppo

### Prerequisiti
- Node.js v18+ e npm.

### Avvio in Sviluppo (solo interfaccia, nel browser)
```bash
npm install
npm run dev
```

### Avvio in Sviluppo (app Electron completa, con backend nativo)
```bash
npm run dev:electron
```

### Build per Produzione (installer Windows NSIS)
```bash
npm run build
```
L'installer viene generato in `release/`.

---

## 🔒 Nota sulla privacy dei dati

Il database contiene dati sensibili di clienti reali (credenziali di rete, dati anagrafici). Il file locale non viene mai incluso nel repository (vedi `.gitignore`) e non lascia mai il PC dell'utente se non tramite la sincronizzazione MariaDB esplicitamente configurata dall'amministratore.
