# WispCore — Enterprise Management Suite per WISP

**Versione 1.0.20 · Windows Desktop · Electron + React 19 + TypeScript**

WispCore è un gestionale enterprise per Wireless Internet Service Provider (WISP): copre l'intero ciclo di vita del cliente (anagrafica tecnica, contratti, fatturazione, provvigioni), l'infrastruttura di rete (nodi BTS/ripetitori, copertura geografica), la business intelligence (churn, ARPU, LTV) e la gestione multi-utente con ruoli — il tutto in un'applicazione desktop **offline-first**, con database locale **cifrato at-rest**, backup ridondati e sincronizzazione multi-sede opzionale.

Non è un prototipo: è costruito con un modello di sicurezza a più livelli (cifratura, hardening del processo Electron, controllo accessi basato su ruoli, audit trail) pensato per contenere dati sensibili di clienti reali — credenziali di rete, dati anagrafici, movimenti finanziari.

---

## Indice

1. [Panoramica architetturale](#panoramica-architetturale)
2. [Funzionalità](#funzionalità)
   - [Dashboard Operativa](#dashboard-operativa)
   - [Gestione Anagrafica (CRM Cliente)](#gestione-anagrafica-crm-cliente)
   - [Piani Internet](#piani-internet)
   - [Collaboratori & Provvigioni](#collaboratori--provvigioni)
   - [Modulo Finanziario](#modulo-finanziario)
   - [Scadenzario Dettagliato](#scadenzario-dettagliato)
   - [Copertura & Rete](#copertura--rete)
   - [Report & Business Intelligence](#report--business-intelligence)
   - [Template Email](#template-email)
   - [Impostazioni & Sync](#impostazioni--sync)
   - [Multi-Utente & Ruoli](#multi-utente--ruoli)
   - [Ricerca Globale & Centro Notifiche](#ricerca-globale--centro-notifiche)
   - [Finestra & Auto-Update](#finestra--auto-update)
3. [Modello di Sicurezza](#modello-di-sicurezza)
   - [Cifratura dei dati at-rest](#1-cifratura-dei-dati-at-rest)
   - [Autenticazione & controllo accessi](#2-autenticazione--controllo-accessi)
   - [Hardening del processo Electron](#3-hardening-del-processo-electron)
   - [Backup & disaster recovery](#4-backup--disaster-recovery)
   - [Sincronizzazione multi-sede](#5-sincronizzazione-multi-sede)
   - [Audit trail](#6-audit-trail)
   - [Aggiornamenti software](#7-aggiornamenti-software)
   - [Privacy & gestione dati](#8-privacy--gestione-dati)
4. [Stack Tecnologico](#stack-tecnologico)
5. [Struttura del Progetto](#struttura-del-progetto)
6. [Modello Dati](#modello-dati)
7. [Sviluppo](#sviluppo)
8. [Limiti Noti & Roadmap](#limiti-noti--roadmap)
9. [Licenza](#licenza)

---

## Panoramica architetturale

WispCore è un'applicazione **Electron a due processi**, con una separazione netta e non negoziabile tra interfaccia e logica sensibile:

```
┌─────────────────────────────┐         IPC (contextBridge)        ┌──────────────────────────────┐
│   RENDERER (sandboxed)      │ ◄─────────────────────────────────► │   MAIN PROCESS (Node.js)      │
│   React 19 + TypeScript     │   Unico canale, API tipizzata      │   Electron privilegiato        │
│   nessun accesso Node/FS    │   enumerata in preload.cjs          │   Filesystem, cifratura, DB    │
└─────────────────────────────┘                                     └──────────────────────────────┘
```

Il renderer (tutto ciò che l'utente vede) **non ha mai** accesso diretto a Node.js, al filesystem o al database: ogni singola operazione — dal salvataggio di un cliente alla generazione di un report PDF — passa attraverso un canale IPC esplicito, dichiarato una volta in `electron/preload.cjs` ed esposto in modo tipizzato al codice React tramite `src/dbService.ts`. Non esiste un canale "generico" o `eval`-like: se un'operazione non è nell'elenco, il renderer non può richiederla.

---

## Funzionalità

### Dashboard Operativa

- **KPI in tempo reale**: MRR (Ricavo Mensile Ricorrente, normalizzato al ciclo di fatturazione reale del cliente e calcolato sui soli clienti Attivi), Incasso Totale, Insoluti, Provvigioni Pendenti.
- **Range analytics configurabile**: 3, 6, 12, 24 o 36 mesi, con **badge di variazione % automatico** rispetto al periodo immediatamente precedente della stessa durata.
- **Drill-down "da terminale"**: click su una card apre un pannello con metriche derivate (ARPU, ARR proiettato, tasso insoluti, ecc.) e un grafico dedicato.
- **Grafici**: andamento entrate reali (area chart), nuovi clienti acquisiti per mese (bar chart).
- **Ricerca tecnica istantanea**: cerca un cliente per IP assegnato, MAC Address o username PPPoE direttamente dalla dashboard.
- **Scadenzario attivo**: lista live di pagamenti in scadenza/insoluti.
- **Classifiche**: Top 5 clienti per fatturato, provvigioni per collaboratore.

### Gestione Anagrafica (CRM Cliente)

- **Anagrafica completa**: dati fiscali, contatti, indirizzo.
- **Dati tecnici WISP**: credenziali PPPoE (password mascherata di default, cifrata a livello di campo), IP statico assegnato, MAC Address, modello CPE.
- **Ciclo di vita del cliente**: stato **Attivo / Sospeso / Disdetto / Prospect**, con motivo di disdetta registrato.
- **Gestione contrattuale**: data inizio/fine contratto, note (durata minima, penali), **allegato documento** (PDF/immagine) copiato in modo sicuro nella cartella dati locale e apribile con un click nell'applicazione predefinita del sistema.
- **Storico piano automatico**: ogni cambio di piano o di canone viene registrato da solo in una tabella di storico dedicata (`client_plan_history`), consultabile dalla scheda cliente.
- **Ciclo di fatturazione reale**: mensile, bimestrale, trimestrale, semestrale, annuale — non solo un'etichetta, incide sul calcolo dell'MRR e sul rinnovo automatico.
- **Rinnovo automatico dei canoni**: quando un pagamento ricorrente viene segnato come saldato, WispCore calcola da solo la prossima scadenza in base al ciclo di fatturazione del cliente e **genera già il pagamento successivo** in stato "In Attesa" — nessun reinserimento manuale ogni mese.
- **Transizione automatica a Insoluto**: un job schedulato (all'avvio e ogni ora) marca automaticamente come "Insoluto" ogni pagamento in attesa la cui scadenza è passata.
- **Geolocalizzazione**: coordinate cliente utilizzate nella vista Copertura & Rete.
- **Assegnazione a nodo di rete** (BTS/ripetitore).
- **Filtri avanzati**: per stato, piano, collaboratore, oltre alla ricerca libera (nome, IP, MAC, PPPoE, codice fiscale).
- **Export/Import CSV**: esportazione completa dell'anagrafica per contabilità/reportistica, import massivo per migrazioni da altri gestionali o fogli Excel.
- **Contatto rapido**: bottone WhatsApp diretto (deep-link `wa.me`) e apertura dell'indirizzo su Google Maps, sempre nel browser di sistema, mai dentro la finestra dell'app.
- **Scheda dettaglio 360°**: storico pagamenti completo, provvigioni generate, storico piano, dati contrattuali e di disdetta.

### Piani Internet

Catalogo delle offerte commerciali (nome, canone, costo di installazione, banda down/up, stato attivo/disattivo), riutilizzabile in fase di attivazione cliente per precompilare automaticamente canone e installazione.

### Collaboratori & Provvigioni

- Anagrafica tecnici/commerciali esterni.
- **Provvigione non fissa**: ogni collaboratore ha un "guadagno di default" proposto automaticamente, ma **ogni cliente assegnato può avere un compenso personalizzato** — lo stesso collaboratore può guadagnare cifre diverse su clienti diversi.
- **Generazione automatica della provvigione** ad ogni pagamento ricorrente saldato, per il cliente e l'importo configurati.
- **Vista a 360° per collaboratore**: guadagno totale/liquidato/da liquidare, andamento mensile (12 mesi, grafico), elenco clienti assegnati con il compenso specifico, storico completo delle provvigioni con possibilità di segnarle liquidate.
- **Accesso self-service**: un account con ruolo *Collaboratore*, collegato a un record specifico, vede **solo** la propria scheda 360° — nessun accesso al resto del gestionale.

### Modulo Finanziario

Registro pagamenti (canone ricorrente, installazione una-tantum, intervento tecnico extra) con stato Saldato/In Attesa/Insoluto, ricerca cliente live in fase di registrazione, filtri per stato.

### Scadenzario Dettagliato

Vista trasversale di tutte le scadenze di tutti i clienti, filtrabile per stato, collaboratore e intervallo di date, con **invio email di sollecito** con un click (template configurabili, invio via SMTP).

### Copertura & Rete

- **Anagrafica nodi di rete** (BTS/ripetitori): nome, coordinate, capacità massima, calcolo automatico della **% di saturazione** in base ai clienti attivi assegnati.
- **Mappa di copertura offline**: proiezione a dispersione (scatter plot) delle coordinate reali di clienti e nodi, **senza alcun servizio di mappe esterno** — coerente con l'impostazione offline-first dell'applicazione, nessuna dipendenza da internet o da API di terze parti per funzionare. Punti colorati per stato cliente, click per navigare alla relativa scheda.
- Elenco dei clienti attivi privi di coordinate, per completare la mappatura.

### Report & Business Intelligence

Metriche pensate per la crescita del business, non solo per la contabilità quotidiana:

- **Churn Rate mensile**: calcolato per coorte (base clienti attivi a inizio mese vs. disdette nel mese), con serie storica e **motivazioni di disdetta** aggregate.
- **ARPU** (Average Revenue Per User): ricavo medio mensile per cliente attivo.
- **LTV stimato** (Lifetime Value): formula SaaS `ARPU / tasso di abbandono mensile`, con fallback su `ARPU × anzianità media` quando non ci sono ancora disdette registrate nel periodo.
- **Saturazione per nodo di rete**, per pianificare potenziamenti dell'infrastruttura.
- **Export CSV** di clienti, pagamenti, provvigioni.
- **Report PDF di periodo**: generato nativamente tramite il motore di rendering di Chromium (nessuna libreria PDF di terze parti), con KPI, andamento mensile, top clienti, saturazione rete e motivazioni di disdetta.

### Template Email

Motore a placeholder (`{{nome_cliente}}`, `{{importo}}`, `{{scadenza}}`, `{{tipo_pagamento}}`) con **5 template professionali precaricati automaticamente al primo avvio**, scritti in gergo tecnico WISP (CPE, NOC, traffic shaping, saturazione del canale radio): promemoria pagamento, secondo sollecito, preavviso di sospensione, conferma attivazione, avviso di manutenzione programmata.

### Impostazioni & Sync

- **Albero directory locale** con rilevamento automatico di OneDrive (i dati vengono replicati in cloud senza configurazione).
- **Backup primario**: automatico giornaliero + manuale on-demand, checksum SHA-256, retention 30 giornalieri + 12 mensili, ripristino guidato con snapshot di sicurezza pre-ripristino.
- **Backup secondario**: replica indipendente su una cartella esterna a scelta (NAS, disco USB, unità di rete), stessa retention e integrità del primario; un fallimento del secondario **non compromette mai** il backup locale.
- **Sincronizzazione multi-sede (MariaDB)**: collega più postazioni a un server centrale; sync **event-driven** (parte entro pochi secondi da ogni modifica) con un fallback di sicurezza a intervallo fisso (default 1 minuto); impostazioni applicate a caldo, senza riavviare l'app; **Chiave di Organizzazione** condivisa per mantenere le credenziali PPPoE leggibili su tutte le sedi collegate.
- **Configurazione SMTP** con test di connessione.
- **Auto-update**: controllo automatico delle GitHub Release all'avvio, download dell'installer in background, richiesta esplicita di conferma prima di installare.
- **Utenti & Ruoli** (vedi sotto).
- **Registro Audit**: consultazione delle ultime operazioni sensibili registrate nel sistema.

### Multi-Utente & Ruoli

- **Un solo campo PIN** allo sblocco: WispCore verifica l'hash su ogni account registrato finché ne trova uno corrispondente — nessun selettore di username da esporre a schermo.
- **Quattro ruoli**, con sidebar e funzionalità filtrate di conseguenza:
  - **Super Admin** — accesso completo, incluse Impostazioni, Sync e gestione utenti.
  - **Tecnico** — Anagrafica, Piani Internet, Copertura & Rete.
  - **Commerciale** — Anagrafica, Piani, Collaboratori, Finanziario, Scadenzario, Report & BI, Template Email.
  - **Collaboratore** — accesso self-service alla sola propria scheda provvigioni.
- Gestione utenti (creazione/modifica/eliminazione) da Impostazioni, con protezione contro l'eliminazione dell'ultimo Super Admin rimasto.

### Ricerca Globale & Centro Notifiche

- **Palette di ricerca (Ctrl/Cmd+K)**: naviga tra sezioni, clienti e collaboratori senza staccare le mani dalla tastiera.
- **Centro notifiche interne**: aggrega in un unico pannello ciò che oggi richiederebbe di aprire più schermate — pagamenti insoluti, scadenze imminenti, contratti in scadenza nei 30 giorni, provvigioni da liquidare, errori di backup secondario o sync ferma da giorni, aggiornamento pronto per l'installazione.

### Finestra & Auto-Update

- Avvio **massimizzato** (non fullscreen "kiosk"): barra del titolo e pulsanti riduci/ingrandisci/chiudi sempre visibili.
- Schermata di sblocco moderna: indicatore PIN a puntini, tastierino numerico touch-friendly, toggle mostra/nascondi.
- Tema chiaro, layout responsive (sidebar a scomparsa sotto la soglia mobile).

---

## Modello di Sicurezza

WispCore tratta per natura dati sensibili — credenziali di accesso alla rete dei clienti, dati anagrafici, movimenti finanziari. Il modello di sicurezza è stratificato su otto livelli indipendenti:

### 1. Cifratura dei dati at-rest

- **Intero database cifrato con AES-256-GCM**: il file `wisp_data.db` su disco non è mai leggibile in chiaro, nemmeno copiandolo su un'altra macchina. Formato contenitore custom: `[magic 'WC01'][IV 12B][auth tag 16B][ciphertext]`, con verifica di autenticità (GCM) prima di ogni decifratura.
- **Cifratura di campo aggiuntiva** (defense-in-depth) sulle credenziali PPPoE, indipendente dalla cifratura dell'intero file.
- **Gerarchia delle chiavi**:
  - *Data Encryption Key (DEK)*: 256 bit, generata casualmente una sola volta per installazione, protetta tramite `safeStorage` di Electron (su Windows delega a **DPAPI**, legata all'account utente del sistema operativo). **Deliberatamente non derivata dal PIN di sblocco**: se lo fosse, un PIN dimenticato equivarrebbe a una perdita irreversibile di tutti i dati clienti — un compromesso inaccettabile per un database business-critical.
  - *Organization Data Key (ODK)*: chiave separata, condivisa tra tutte le sedi della stessa organizzazione, usata esclusivamente per i campi che devono restare leggibili anche dopo la sincronizzazione multi-sede (credenziali PPPoE). Generata una volta e distribuita alle altre postazioni come stringa da copiare in Impostazioni.
  - Se il keychain del sistema operativo non è disponibile, l'app degrada a un fallback tracciato e loggato esplicitamente, non fallisce silenziosamente.
- **Segreti applicativi** (password SMTP, credenziali MariaDB) cifrati singolarmente con lo stesso meccanismo `safeStorage`, mai salvati in chiaro nel file di configurazione.

### 2. Autenticazione & controllo accessi

- **Hashing Argon2id** (via `hash-wasm`, WASM puro — nessuna dipendenza nativa da compilare): 64 MB di costo di memoria, 4 iterazioni, output a 32 byte. Parametri scelti per resistere ad attacchi con GPU/ASIC pur restando utilizzabili su una schermata di sblocco.
- **Verifica multi-account sequenziale**: con più utenti configurati, l'hash del PIN inserito viene confrontato con ogni account registrato finché non se ne trova uno valido — costo delimitato, nessuna divulgazione di quale username stia tentando l'accesso.
- **Lockout automatico**: 5 tentativi falliti consecutivi bloccano l'accesso per 5 minuti.
- **Controllo accessi basato su ruoli (RBAC)**: 4 ruoli che filtrano sidebar, tab e operazioni disponibili; lo stato di sessione (chi è loggato, con che ruolo) vive **solo in memoria nel processo main**, mai persistito su disco, e viene azzerato al blocco sessione.
- Il ruolo *Collaboratore* è vincolato a un singolo record collegato: non può in alcun modo vedere dati di altri collaboratori, clienti non assegnati o il modulo finanziario.

### 3. Hardening del processo Electron

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` sul renderer: il codice React **non ha mai** accesso diretto a Node.js, al filesystem o a moduli nativi.
- **Un solo bridge IPC esplicito** (`electron/preload.cjs`), con ogni canale enumerato singolarmente: non esiste un meccanismo generico per invocare funzioni arbitrarie del processo main dal renderer.
- **Content-Security-Policy rigorosa** in produzione: `default-src 'self'`, nessuno script remoto ammesso, `connect-src` limitato a se stesso e all'API di GitHub (necessaria solo per il controllo aggiornamenti).
- **Apertura di link esterni controllata**: WhatsApp e Google Maps vengono aperti esclusivamente tramite `shell.openExternal`, con un controllo che ammette solo URL `https://` — mai eseguiti dentro la finestra dell'app, mai in grado di veicolare schemi `file://` o `javascript:`.
- Finestra applicativa con `requestedExecutionLevel: asInvoker` (nessun privilegio elevato richiesto per l'uso quotidiano).

### 4. Backup & disaster recovery

- Backup automatico giornaliero (controllato all'avvio e ogni ora) più backup manuale on-demand, con **checksum SHA-256** calcolato e verificato ad ogni operazione.
- **Verifica di decifrabilità** prima di applicare qualunque ripristino: un file di backup corrotto o incompatibile viene rifiutato prima di toccare il database live.
- **Snapshot di sicurezza automatico** del database corrente immediatamente prima di sovrascriverlo con un ripristino.
- **Backup secondario indipendente** su cartella esterna (NAS, disco rimovibile, unità di rete): stessa politica di retention e integrità del primario; se la destinazione secondaria non è raggiungibile, l'errore viene isolato e segnalato — il backup primario, già completato, non viene mai compromesso.
- Export/import manuale in JSON per migrazioni tra macchine o archiviazione a lungo termine.

### 5. Sincronizzazione multi-sede

- Connessione a MariaDB tramite driver nativo, con credenziali cifrate localmente (mai salvate in chiaro) e supporto TLS opzionale verso il server.
- Strategia **last-write-wins basata su timestamp**, con pattern **outbox** lato client: ogni scrittura locale viene accodata e propagata esattamente una volta, sopravvivendo a disconnessioni temporanee.
- Sincronizzazione **event-driven** (debounce di pochi secondi dopo ogni modifica) con fallback a intervallo fisso, per minimizzare la finestra di disallineamento tra sedi senza sovraccaricare il server con polling continuo.

### 6. Audit trail

Ogni operazione sensibile — login/logout, creazione/modifica/eliminazione di clienti, collaboratori, pagamenti, provvigioni e utenti, sincronizzazioni, transizioni automatiche a insoluto — viene registrata in un log di audit append-only con attore, timestamp e dettagli, consultabile dalle Impostazioni.

### 7. Aggiornamenti software

- Gli aggiornamenti vengono verificati **esclusivamente** contro le GitHub Release del repository ufficiale, via HTTPS.
- Gli eseguibili di distribuzione sono firmati digitalmente in fase di build.
- **Nessuna installazione automatica non presidiata**: il download avviene in background, ma l'installazione richiede sempre una conferma esplicita dell'utente, che può anche rimandarla.

### 8. Privacy & gestione dati

- **Nessuna telemetria** e nessun invio di dati clienti a servizi cloud di terze parti.
- La vista Copertura & Rete non dipende da alcun servizio di mappe esterno: le coordinate restano sul dispositivo.
- Database, log applicativi e file di configurazione locale sono esclusi a livello di `.gitignore` dal controllo versione: nessun dato cliente reale può finire accidentalmente nel repository sorgente.

---

## Stack Tecnologico

| Livello | Tecnologia |
|---|---|
| Shell applicativa | Electron 43 |
| UI | React 19 + TypeScript, Tailwind CSS 4 |
| Build / Dev server | Vite 8 |
| Database locale | SQLite via `sql.js` (WASM), cifrato at-rest |
| Crittografia | Node `crypto` (AES-256-GCM), `hash-wasm` (Argon2id), Electron `safeStorage` (DPAPI) |
| Grafici | Recharts |
| Icone | Lucide React |
| Sync multi-sede | MariaDB (driver `mariadb`) |
| Email | Nodemailer (SMTP) |
| Packaging | electron-builder (target NSIS, installer Windows firmato) |
| Linting | oxlint |

---

## Struttura del Progetto

```
electron/
  main.js                    # ciclo di vita app, finestra, CSP, job schedulati
  preload.cjs                # unico bridge IPC esposto al renderer (contextBridge)
  ipc/
    handlers.js               # handler IPC: collegano i canali ai servizi
  services/
    paths.js                    # rilevamento cartella Documenti/OneDrive, struttura dati
    config.js                    # config.json applicativo (chiavi, impostazioni)
    crypto.js                     # cifratura AES-256-GCM, gestione chiavi (DEK/ODK)
    auth.js                        # hashing Argon2id, lockout, sessione utente
    database.js                     # schema SQLite, migrazioni, tutta la logica dati
    backup.js                        # backup/restore primario e secondario
    csv.js                             # export/import CSV
    report.js                          # generazione report PDF (printToPDF)
    updater.js                          # auto-update da GitHub Releases
    email.js                             # invio email SMTP, motore template
    sync/
      mariadb.js                         # motore di sincronizzazione multi-sede
      scheduler.js                        # scheduling event-driven + fallback della sync
src/
  dbService.ts                # wrapper async tipizzato verso il bridge IPC
  electronBridge.d.ts           # contratto TypeScript del bridge preload
  types.ts                        # tipi di dominio condivisi
  App.tsx                           # shell applicativa, routing, sessione, RBAC
  components/                        # viste React (Dashboard, Anagrafica, Collaboratori, ...)
build/
  icon.png / icon.ico            # icona applicativa (multi-risoluzione per l'installer NSIS)
scripts/
  increment-version.js             # auto-incremento versione ad ogni build
  make-ico.ps1                       # generazione .ico multi-risoluzione da PNG sorgente
```

Il renderer non ha **mai** accesso diretto al filesystem o a Node.js: ogni operazione passa da un canale IPC esplicito e tipizzato.

---

## Modello Dati

Database SQLite unico, con le seguenti entità principali:

| Tabella | Contenuto |
|---|---|
| `admins` | Account staff, ruolo, hash del PIN, eventuale collegamento a un collaboratore |
| `clients` | Anagrafica, dati tecnici, stato, contratto, coordinate, ciclo di fatturazione |
| `client_plan_history` | Storico automatico dei cambi piano/canone per cliente |
| `collaborators` | Tecnici/commerciali esterni e guadagno di default |
| `plans` | Catalogo offerte internet |
| `network_nodes` | Nodi di rete (BTS/ripetitori), capacità e saturazione |
| `payments` | Registro pagamenti (ricorrenti, installazione, extra) |
| `commissions` | Provvigioni generate per collaboratore/cliente |
| `email_templates` | Template email con placeholder |
| `audit_log` | Registro immutabile delle operazioni sensibili |
| `outbox` | Coda delle modifiche da propagare alla sincronizzazione multi-sede |

---

## Sviluppo

### Prerequisiti
- Node.js 18+ e npm
- Windows (target di build primario; NSIS installer)

### Avvio in sviluppo (solo interfaccia, nel browser)
```bash
npm install
npm run dev
```

### Avvio in sviluppo (app Electron completa, con backend nativo)
```bash
npm run dev:electron
```

### Build di produzione (installer Windows NSIS)
```bash
npm run build
```
Lo script `build`:
1. incrementa automaticamente la versione (`scripts/increment-version.js`, sincronizzata tra `package.json` e `src/version.ts`);
2. compila TypeScript (`tsc -b`);
3. genera il bundle di produzione (`vite build`);
4. impacchetta l'installer Windows firmato con `electron-builder` (target `nsis`), pubblicato in `release/`.

### Lint
```bash
npm run lint
```

---

## Limiti Noti & Roadmap

- La sincronizzazione multi-sede MariaDB propaga ancora lo schema cliente precedente: i campi introdotti con il CRM esteso (stato, contratto, coordinate, nodo di rete) **non vengono al momento sincronizzati tra sedi** — restano validi e funzionanti sulla singola postazione. Estensione dello schema remoto pianificata per una prossima iterazione.
- La generazione automatica dei canoni ricorrenti è **event-driven** (scatta alla registrazione di un pagamento saldato), non un job schedulato che genera in blocco tutte le fatture di un mese: scelta deliberata per evitare generazioni "alla cieca" senza controllo dell'operatore.
- La mappa di Copertura & Rete è una proiezione relativa delle coordinate, non un vero mappamondo con vie/quartieri: nessuna dipendenza da servizi di mappe esterni, a scapito del contesto stradale.

---

## Licenza

Software proprietario — NunzioTech per Alynet. Tutti i diritti riservati. Non distribuito con licenza open-source; il codice sorgente non è destinato alla ridistribuzione pubblica.
