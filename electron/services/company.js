import { readConfig, updateConfig } from './config.js';

/**
 * Anagrafica della società (WISP/rivenditore che usa WispCore, non il cliente
 * finale). Dati non segreti (a differenza di SMTP/WhatsApp non serve cifrarli):
 * oggi servono solo a firmare le comunicazioni email/WhatsApp con il nome
 * reale dell'azienda invece del generico "Team Tecnico WISP", ma il modello
 * è già pronto per una futura generazione di fatture/documenti.
 */
export function getCompanySettings() {
  const config = readConfig();
  return { ...config.company };
}

export function setCompanySettings(data) {
  updateConfig((c) => {
    c.company = { ...c.company, ...data };
  });
  return getCompanySettings();
}
