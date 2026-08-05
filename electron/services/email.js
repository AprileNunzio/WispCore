import nodemailer from 'nodemailer';
import { readConfig, updateConfig } from './config.js';
import { encryptSecret, decryptSecret } from './crypto.js';
import { appendLog } from './paths.js';

export function getSmtpSettings() {
  const config = readConfig();
  const smtp = config.smtp || {};
  return {
    enabled: !!smtp.enabled,
    host: smtp.host || '',
    port: smtp.port || 587,
    secure: !!smtp.secure,
    user: smtp.user || '',
    hasPassword: !!smtp.passwordEncrypted,
    fromName: smtp.fromName || 'WispCore',
    fromEmail: smtp.fromEmail || '',
  };
}

export function setSmtpSettings({ host, port, secure, user, password, fromName, fromEmail, enabled }) {
  updateConfig((c) => {
    c.smtp = c.smtp || {};
    c.smtp.host = host ?? c.smtp.host;
    c.smtp.port = port ?? c.smtp.port;
    c.smtp.secure = secure ?? c.smtp.secure;
    c.smtp.user = user ?? c.smtp.user;
    c.smtp.fromName = fromName ?? c.smtp.fromName;
    c.smtp.fromEmail = fromEmail ?? c.smtp.fromEmail;
    c.smtp.enabled = enabled ?? c.smtp.enabled;
    if (password) {
      const secret = encryptSecret(password);
      c.smtp.passwordEncrypted = secret.value;
      c.smtp.passwordProtection = secret.protection;
    }
  });
  return getSmtpSettings();
}

function buildTransportConfig(overrideSettings) {
  if (overrideSettings) {
    return {
      host: overrideSettings.host,
      port: overrideSettings.port || 587,
      secure: !!overrideSettings.secure,
      auth: overrideSettings.user ? { user: overrideSettings.user, pass: overrideSettings.password } : undefined,
    };
  }
  const config = readConfig();
  const smtp = config.smtp || {};
  if (!smtp.host) throw new Error('Configurazione SMTP incompleta: host mancante.');
  return {
    host: smtp.host,
    port: smtp.port || 587,
    secure: !!smtp.secure,
    auth: smtp.user ? { user: smtp.user, pass: decryptSecret({ protection: smtp.passwordProtection, value: smtp.passwordEncrypted }) } : undefined,
  };
}

export async function testSmtpConnection(overrideSettings) {
  try {
    const transporter = nodemailer.createTransport(buildTransportConfig(overrideSettings));
    await transporter.verify();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/** Replaces {{variabile}} placeholders in a template with real values. */
export function renderTemplate(text, variables) {
  return (text || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => (variables[key] !== undefined ? String(variables[key]) : ''));
}

export async function sendEmail({ to, subject, html }) {
  const config = readConfig();
  const smtp = config.smtp || {};
  if (!smtp.enabled) throw new Error('L\'invio email non è attivo. Configuralo nelle Impostazioni.');

  const transporter = nodemailer.createTransport(buildTransportConfig());
  const info = await transporter.sendMail({
    from: `"${smtp.fromName || 'WispCore'}" <${smtp.fromEmail || smtp.user}>`,
    to,
    subject,
    html,
  });
  appendLog(`Email inviata a ${to}: ${subject}`);
  return { messageId: info.messageId };
}
