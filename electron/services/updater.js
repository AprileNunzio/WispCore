import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { app, shell } from 'electron';
import { getAppPaths, appendLog } from './paths.js';
import { readConfig, updateConfig } from './config.js';

const REPO = 'AprileNunzio/WispCore';
const RELEASES_API = `https://api.github.com/repos/${REPO}/releases/latest`;

function parseVersion(v) {
  return String(v || '0')
    .replace(/^v/i, '')
    .trim()
    .split('.')
    .map((n) => parseInt(n, 10) || 0);
}

/** true se `latest` è una versione più recente di `current` (confronto numerico X.Y.Z). */
export function isNewerVersion(latest, current) {
  const a = parseVersion(latest);
  const b = parseVersion(current);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const x = a[i] || 0;
    const y = b[i] || 0;
    if (x > y) return true;
    if (x < y) return false;
  }
  return false;
}

export async function fetchLatestRelease() {
  const res = await fetch(RELEASES_API, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'WispCore-App' },
  });
  if (!res.ok) {
    throw new Error(res.status === 404 ? 'Nessuna release pubblicata su GitHub.' : `GitHub API: ${res.status}`);
  }
  const json = await res.json();
  return {
    tagName: json.tag_name || '',
    version: (json.tag_name || '').replace(/^v/i, ''),
    htmlUrl: json.html_url || null,
    publishedAt: json.published_at || null,
    assets: Array.isArray(json.assets) ? json.assets : [],
  };
}

/** Usato dal pulsante "Verifica Aggiornamenti" manuale in Impostazioni. */
export async function checkForUpdate() {
  const release = await fetchLatestRelease();
  const current = app.getVersion();
  return {
    currentVersion: current,
    latestVersion: release.version || null,
    isLatest: !release.version || !isNewerVersion(release.version, current),
    releaseUrl: release.htmlUrl,
    publishedAt: release.publishedAt,
  };
}

function pickWindowsInstallerAsset(assets) {
  return assets.find((a) => /\.exe$/i.test(a.name) && !/blockmap/i.test(a.name)) || null;
}

async function downloadAsset(asset, onProgress) {
  const dir = getAppPaths().updatesDir;
  const destPath = path.join(dir, asset.name);
  const partPath = `${destPath}.part`;

  const res = await fetch(asset.browser_download_url, {
    headers: { Accept: 'application/octet-stream', 'User-Agent': 'WispCore-App' },
  });
  if (!res.ok || !res.body) {
    throw new Error(`Download dell'aggiornamento fallito (HTTP ${res.status}).`);
  }

  const total = Number(res.headers.get('content-length')) || asset.size || 0;
  let downloaded = 0;

  const source = Readable.fromWeb(res.body);
  if (onProgress && total > 0) {
    source.on('data', (chunk) => {
      downloaded += chunk.length;
      onProgress(Math.min(99, Math.round((downloaded / total) * 100)));
    });
  }

  await pipeline(source, fs.createWriteStream(partPath));

  if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
  fs.renameSync(partPath, destPath);

  return destPath;
}

/**
 * Da chiamare una volta all'avvio (e opzionalmente su richiesta manuale).
 * Controlla su GitHub se c'è una release più recente e, se sì, scarica in
 * background l'installer Windows (.exe) tra gli asset della release.
 *
 * `send(payload)` riceve gli eventi di stato ({type: 'downloading' | 'progress'
 * | 'downloaded' | 'error', ...}) da inoltrare al renderer via IPC. Eventuali
 * errori (rete assente, release senza asset, ecc.) vengono solo loggati:
 * un controllo aggiornamenti fallito non deve mai bloccare o far crashare l'app.
 */
export async function checkAndDownloadUpdateInBackground(send) {
  try {
    const release = await fetchLatestRelease();
    const current = app.getVersion();

    if (!release.version || !isNewerVersion(release.version, current)) {
      return;
    }

    const config = readConfig();
    const already = config.updater || {};

    // Versione già scaricata in un avvio precedente e file ancora presente:
    // non riscaricare, richiedi solo di nuovo l'installazione.
    if (already.downloadedVersion === release.version && already.installerPath && fs.existsSync(already.installerPath)) {
      send({ type: 'downloaded', version: release.version, releaseUrl: release.htmlUrl });
      return;
    }

    const asset = pickWindowsInstallerAsset(release.assets);
    if (!asset) {
      appendLog(`Aggiornamento v${release.version} trovato ma nessun installer .exe negli asset della release.`);
      return;
    }

    send({ type: 'downloading', version: release.version });

    const installerPath = await downloadAsset(asset, (percent) => {
      send({ type: 'progress', version: release.version, percent });
    });

    updateConfig((c) => {
      c.updater = { downloadedVersion: release.version, installerPath };
    });

    appendLog(`Aggiornamento v${release.version} scaricato in ${installerPath}.`);
    send({ type: 'downloaded', version: release.version, releaseUrl: release.htmlUrl });
  } catch (err) {
    appendLog(`Auto-update fallito: ${err.message}`);
    send({ type: 'error', message: err.message });
  }
}

import { execFile } from 'child_process';

/** Avvia l'installer già scaricato in modalità silenziosa (/S) e chiude WispCore per permettere l'aggiornamento automatico. */
export function installDownloadedUpdate() {
  const config = readConfig();
  const info = config.updater;
  if (!info || !info.installerPath || !fs.existsSync(info.installerPath)) {
    throw new Error('Nessun aggiornamento scaricato pronto per l\'installazione.');
  }

  // Esegue l'installer NSIS con lo switch /S per l'installazione silenziosa in background
  execFile(info.installerPath, ['/S'], (err) => {
    if (err) appendLog(`Impossibile avviare l'installer silenzioso: ${err.message}`);
  });

  // Piccolo ritardo prima che WispCore si chiuda e rilasci i file di sistema
  setTimeout(() => app.quit(), 1000);
}
