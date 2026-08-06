import { readConfig, updateConfig } from './config.js';
import { encryptSecret, decryptSecret } from './crypto.js';
import { appendLog } from './paths.js';

/**
 * Integrazione WhatsApp Business Platform (Meta Cloud API ufficiale).
 * -------------------------------------------------------------------
 * Deliberatamente NON usiamo librerie che pilotano WhatsApp Web/Desktop
 * (tipo whatsapp-web.js): violano i Termini di Servizio di WhatsApp,
 * espongono il numero al rischio di ban immediato e senza preavviso, e non
 * sono adatte a un prodotto commerciale che deve garantire la consegna dei
 * solleciti di pagamento. La Cloud API è il canale ufficiale pensato
 * esattamente per notifiche transazionali verso i clienti di un servizio.
 *
 * Concetti chiave lato Meta:
 * - Fuori dalla finestra di 24h da un messaggio del cliente, si può scrivere
 *   SOLO usando un "message template" pre-approvato da Meta (nome, lingua,
 *   categoria, testo con placeholder posizionali {{1}}, {{2}}...).
 * - I nostri 2 template di default (vedi database.js) sono di categoria
 *   UTILITY: comunicazioni legate a un servizio già attivo (promemoria/
 *   solleciti), non promozionali - la categoria corretta per questo caso
 *   d'uso, che non richiede un opt-in di marketing separato.
 * - I template vanno creati una volta sul WhatsApp Business Account (WABA)
 *   via API e restano "in revisione" per un certo tempo (in genere minuti,
 *   talvolta più a lungo) prima di diventare APPROVED e quindi utilizzabili.
 */

function graphBase(apiVersion) {
  return `https://graph.facebook.com/${apiVersion || 'v20.0'}`;
}

export function getWhatsappSettings() {
  const config = readConfig();
  const wa = config.whatsapp || {};
  return {
    enabled: !!wa.enabled,
    phoneNumberId: wa.phoneNumberId || '',
    wabaId: wa.wabaId || '',
    hasAccessToken: !!wa.accessTokenEncrypted,
    displayName: wa.displayName || '',
    apiVersion: wa.apiVersion || 'v20.0',
    defaultCountryCode: wa.defaultCountryCode || '39',
  };
}

export function setWhatsappSettings({ phoneNumberId, wabaId, accessToken, displayName, apiVersion, defaultCountryCode, enabled }) {
  updateConfig((c) => {
    c.whatsapp = c.whatsapp || {};
    c.whatsapp.phoneNumberId = phoneNumberId ?? c.whatsapp.phoneNumberId;
    c.whatsapp.wabaId = wabaId ?? c.whatsapp.wabaId;
    c.whatsapp.displayName = displayName ?? c.whatsapp.displayName;
    c.whatsapp.apiVersion = apiVersion ?? c.whatsapp.apiVersion;
    c.whatsapp.defaultCountryCode = defaultCountryCode ?? c.whatsapp.defaultCountryCode;
    c.whatsapp.enabled = enabled ?? c.whatsapp.enabled;
    if (accessToken) {
      const secret = encryptSecret(accessToken);
      c.whatsapp.accessTokenEncrypted = secret.value;
      c.whatsapp.accessTokenProtection = secret.protection;
    }
  });
  return getWhatsappSettings();
}

function resolveCredentials(overrideSettings) {
  const config = readConfig();
  const wa = config.whatsapp || {};
  const phoneNumberId = overrideSettings?.phoneNumberId ?? wa.phoneNumberId;
  const wabaId = overrideSettings?.wabaId ?? wa.wabaId;
  const apiVersion = overrideSettings?.apiVersion ?? wa.apiVersion ?? 'v20.0';
  const accessToken = overrideSettings?.accessToken
    || decryptSecret({ protection: wa.accessTokenProtection, value: wa.accessTokenEncrypted });
  if (!phoneNumberId) throw new Error('Configurazione WhatsApp incompleta: Phone Number ID mancante.');
  if (!accessToken) throw new Error('Configurazione WhatsApp incompleta: Access Token mancante.');
  return { phoneNumberId, wabaId, accessToken, apiVersion };
}

async function graphFetch(url, options, accessToken) {
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(options?.headers || {}),
    },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = json?.error?.message || `Errore HTTP ${res.status} dalla Graph API.`;
    throw new Error(message);
  }
  return json;
}

/**
 * Normalizza un numero italiano/generico nel formato E.164 richiesto dalla
 * Cloud API (senza "+", solo cifre): "347 123 4567" -> "393471234567".
 * Se il numero ha già un prefisso internazionale (inizia con un + o è più
 * lungo di un numero locale) lo lascia intatto.
 */
export function normalizePhoneNumber(raw, defaultCountryCode = '39') {
  if (!raw) return '';
  const digits = String(raw).replace(/[^\d+]/g, '');
  const stripped = digits.replace(/^\+/, '');
  if (digits.startsWith('+') || stripped.startsWith(defaultCountryCode) || stripped.length > 10) {
    return stripped;
  }
  return `${defaultCountryCode}${stripped.replace(/^0+/, '')}`;
}

/** Verifica che le credenziali configurate funzionino davvero, leggendo l'anagrafica del numero. */
export async function testWhatsappConnection(overrideSettings) {
  try {
    const { phoneNumberId, accessToken, apiVersion } = resolveCredentials(overrideSettings);
    const json = await graphFetch(
      `${graphBase(apiVersion)}/${phoneNumberId}?fields=verified_name,display_phone_number,quality_rating`,
      { method: 'GET' },
      accessToken
    );
    return { ok: true, verifiedName: json.verified_name, displayPhoneNumber: json.display_phone_number, qualityRating: json.quality_rating };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/** true se esiste già un template con questo nome sul WABA (evita di riproporlo e farlo rigettare come duplicato). */
async function findExistingTemplate(wabaId, name, accessToken, apiVersion) {
  const json = await graphFetch(
    `${graphBase(apiVersion)}/${wabaId}/message_templates?name=${encodeURIComponent(name)}&limit=1`,
    { method: 'GET' },
    accessToken
  );
  return json?.data?.[0] || null;
}

/**
 * Crea (o rileva già esistenti) i template WhatsApp sul WABA configurato e
 * ne restituisce lo stato reale per ciascuno. Va richiamata dall'operatore
 * dal pulsante "Sincronizza Template su Meta" nelle Impostazioni - non in
 * automatico, perché richiede che WABA ID e Access Token siano già stati
 * inseriti e verificati.
 */
export async function syncTemplatesToMeta(templates) {
  const { wabaId, accessToken, apiVersion } = resolveCredentials();
  if (!wabaId) throw new Error('WhatsApp Business Account ID (WABA ID) mancante: inseriscilo nelle Impostazioni prima di sincronizzare i template.');

  const results = [];
  for (const t of templates) {
    try {
      const existing = await findExistingTemplate(wabaId, t.template_key, accessToken, apiVersion);
      if (existing) {
        results.push({ templateKey: t.template_key, status: existing.status, rejectionReason: existing.rejected_reason || null });
        continue;
      }

      // Meta richiede un "example" con valori plausibili per ogni placeholder
      // posizionale, usato dai revisori umani per capire il contesto d'uso.
      const exampleValues = ['Mario Rossi', 'Canone Ricorrente', '29.90', '15/09/2026'];
      const paramCount = (t.body_text.match(/\{\{\d+\}\}/g) || []).length;

      const created = await graphFetch(
        `${graphBase(apiVersion)}/${wabaId}/message_templates`,
        {
          method: 'POST',
          body: JSON.stringify({
            name: t.template_key,
            language: t.language || 'it',
            category: t.category || 'UTILITY',
            components: [
              {
                type: 'BODY',
                text: t.body_text,
                example: { body_text: [exampleValues.slice(0, paramCount)] },
              },
            ],
          }),
        },
        accessToken
      );
      results.push({ templateKey: t.template_key, status: created.status || 'PENDING', rejectionReason: null });
      appendLog(`Template WhatsApp "${t.template_key}" inviato a Meta per approvazione.`);
    } catch (err) {
      results.push({ templateKey: t.template_key, status: 'ERRORE', rejectionReason: err.message });
    }
  }
  return results;
}

/** Ricontrolla lo stato di approvazione corrente su Meta senza tentare di ricrearli. */
export async function refreshTemplatesStatus(templates) {
  const { wabaId, accessToken, apiVersion } = resolveCredentials();
  if (!wabaId) throw new Error('WhatsApp Business Account ID (WABA ID) mancante.');

  const results = [];
  for (const t of templates) {
    try {
      const existing = await findExistingTemplate(wabaId, t.template_key, accessToken, apiVersion);
      results.push({
        templateKey: t.template_key,
        status: existing ? existing.status : 'NON_SINCRONIZZATO',
        rejectionReason: existing?.rejected_reason || null,
      });
    } catch (err) {
      results.push({ templateKey: t.template_key, status: t.meta_status, rejectionReason: err.message });
    }
  }
  return results;
}

/** Invia un messaggio basato su un template già approvato. `params` è l'array ordinato dei valori per {{1}}, {{2}}... */
export async function sendTemplateMessage({ to, templateName, languageCode, params }) {
  const { phoneNumberId, accessToken, apiVersion } = resolveCredentials();
  const config = readConfig();
  const normalizedTo = normalizePhoneNumber(to, config.whatsapp?.defaultCountryCode || '39');

  const json = await graphFetch(
    `${graphBase(apiVersion)}/${phoneNumberId}/messages`,
    {
      method: 'POST',
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: normalizedTo,
        type: 'template',
        template: {
          name: templateName,
          language: { code: languageCode || 'it' },
          components: [
            {
              type: 'body',
              parameters: (params || []).map((value) => ({ type: 'text', text: String(value) })),
            },
          ],
        },
      }),
    },
    accessToken
  );
  appendLog(`WhatsApp inviato a ${normalizedTo} (template: ${templateName}).`);
  return { messageId: json?.messages?.[0]?.id || null };
}

/** Sostituisce {{1}}, {{2}}... con i valori posizionali di `values`, per l'anteprima nell'interfaccia. */
export function renderPreview(bodyText, values) {
  return (bodyText || '').replace(/\{\{(\d+)\}\}/g, (_, idx) => {
    const value = values[Number(idx) - 1];
    return value !== undefined ? String(value) : `{{${idx}}}`;
  });
}
