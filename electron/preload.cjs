// CommonJS on purpose (.cjs extension): preload scripts are the most
// sensitive boundary in the app, so we keep them on the most conservative,
// best-documented loading path regardless of the "type": "module" set in
// package.json for the rest of the project.
const { contextBridge, ipcRenderer } = require('electron');

function invoke(channel, ...args) {
  return ipcRenderer.invoke(channel, ...args).then((res) => {
    if (res && res.ok) return res.data;
    throw new Error((res && res.error) || 'Errore sconosciuto nel processo principale.');
  });
}

contextBridge.exposeInMainWorld('wispcore', {
  system: {
    getPaths: () => invoke('system:getPaths'),
    getVersion: () => invoke('system:getVersion'),
  },
  auth: {
    isFirstRun: () => invoke('auth:isFirstRun'),
    registerSuperAdmin: (username, pin) => invoke('auth:registerSuperAdmin', username, pin),
    verifyPin: (pin) => invoke('auth:verifyPin', pin),
    getAdminUsername: () => invoke('auth:getAdminUsername'),
    getLockoutState: () => invoke('auth:getLockoutState'),
  },
  clients: {
    list: () => invoke('clients:list'),
    save: (data) => invoke('clients:save', data),
    delete: (id) => invoke('clients:delete', id),
    getDetail: (id) => invoke('clients:getDetail', id),
    search: (query, limit) => invoke('clients:search', query, limit),
  },
  collaborators: {
    list: () => invoke('collaborators:list'),
    save: (data) => invoke('collaborators:save', data),
  },
  payments: {
    list: () => invoke('payments:list'),
    add: (data) => invoke('payments:add', data),
    updateStatus: (id, status) => invoke('payments:updateStatus', id, status),
  },
  commissions: {
    list: () => invoke('commissions:list'),
    add: (data) => invoke('commissions:add', data),
    updateStatus: (id, status) => invoke('commissions:updateStatus', id, status),
    byCollaborator: () => invoke('commissions:byCollaborator'),
  },
  plans: {
    list: () => invoke('plans:list'),
    save: (data) => invoke('plans:save', data),
    delete: (id) => invoke('plans:delete', id),
  },
  analytics: {
    monthly: (months) => invoke('analytics:monthly', months),
    topClients: (limit) => invoke('analytics:topClients', limit),
  },
  emailTemplates: {
    list: () => invoke('emailTemplates:list'),
    save: (data) => invoke('emailTemplates:save', data),
    delete: (id) => invoke('emailTemplates:delete', id),
  },
  smtp: {
    getSettings: () => invoke('smtp:getSettings'),
    setSettings: (settings) => invoke('smtp:setSettings', settings),
    test: (settings) => invoke('smtp:test', settings),
  },
  email: {
    sendPaymentReminder: (paymentId, templateId) => invoke('email:sendPaymentReminder', { paymentId, templateId }),
  },
  backup: {
    list: () => invoke('backup:list'),
    run: () => invoke('backup:run'),
    restore: (fileName) => invoke('backup:restore', fileName),
    exportToFile: () => invoke('backup:exportToFile'),
    importFromFile: () => invoke('backup:importFromFile'),
  },
  sync: {
    getSettings: () => invoke('sync:getSettings'),
    setSettings: (settings) => invoke('sync:setSettings', settings),
    test: (settings) => invoke('sync:test', settings),
    run: () => invoke('sync:run'),
    generateOrgKey: () => invoke('sync:generateOrgKey'),
    importOrgKey: (key) => invoke('sync:importOrgKey', key),
  },
  audit: {
    list: (limit) => invoke('audit:list', limit),
  },
  update: {
    check: () => invoke('update:check'),
  },
  migrate: {
    legacyLocalStorage: (payload) => invoke('migrate:legacyLocalStorage', payload),
  },
});
