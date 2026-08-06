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
    openExternal: (url) => invoke('system:openExternal', url),
  },
  auth: {
    isFirstRun: () => invoke('auth:isFirstRun'),
    registerSuperAdmin: (username, pin) => invoke('auth:registerSuperAdmin', username, pin),
    verifyPin: (pin) => invoke('auth:verifyPin', pin),
    lockSession: () => invoke('auth:lockSession'),
    getAdminUsername: () => invoke('auth:getAdminUsername'),
    getLockoutState: () => invoke('auth:getLockoutState'),
  },
  admins: {
    list: () => invoke('admins:list'),
    create: (data) => invoke('admins:create', data),
    update: (data) => invoke('admins:update', data),
    delete: (id) => invoke('admins:delete', id),
  },
  clients: {
    list: () => invoke('clients:list'),
    save: (data) => invoke('clients:save', data),
    delete: (id) => invoke('clients:delete', id),
    getDetail: (id) => invoke('clients:getDetail', id),
    search: (query, limit) => invoke('clients:search', query, limit),
    attachContractDocument: (id) => invoke('clients:attachContractDocument', id),
    openContractDocument: (id) => invoke('clients:openContractDocument', id),
    getInstallationSplits: (id) => invoke('clients:getInstallationSplits', id),
  },
  networkNodes: {
    list: () => invoke('networkNodes:list'),
    save: (data) => invoke('networkNodes:save', data),
    delete: (id) => invoke('networkNodes:delete', id),
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
    delete: (id) => invoke('commissions:delete', id),
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
    bi: (months) => invoke('analytics:bi', months),
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
    getSecondarySettings: () => invoke('backup:getSecondarySettings'),
    pickSecondaryDir: () => invoke('backup:pickSecondaryDir'),
    setSecondarySettings: (settings) => invoke('backup:setSecondarySettings', settings),
  },
  csv: {
    exportClients: () => invoke('csv:exportClients'),
    exportPayments: () => invoke('csv:exportPayments'),
    exportCommissions: () => invoke('csv:exportCommissions'),
    importClients: () => invoke('csv:importClients'),
  },
  report: {
    generatePeriodPdf: (months) => invoke('report:generatePeriodPdf', months),
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
    downloadNow: () => invoke('update:downloadNow'),
    install: () => invoke('update:install'),
    // Sottoscrizione agli eventi push del ciclo di auto-update (downloading /
    // progress / downloaded / error) inviati dal main process. Ritorna una
    // funzione di cleanup per rimuovere il listener.
    onEvent: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on('update:event', listener);
      return () => ipcRenderer.removeListener('update:event', listener);
    },
  },
  migrate: {
    legacyLocalStorage: (payload) => invoke('migrate:legacyLocalStorage', payload),
  },
  beta: {
    nasRouters: {
      list: () => invoke('beta:nasRouters:list'),
      save: (data) => invoke('beta:nasRouters:save', data),
      delete: (id) => invoke('beta:nasRouters:delete', id),
    },
    nms: {
      fetchAccounts: (nasId) => invoke('beta:nms:fetchAccounts', nasId),
    },
    ipamSubnets: {
      list: () => invoke('beta:ipamSubnets:list'),
      save: (data) => invoke('beta:ipamSubnets:save', data),
    },
    radiusSettings: {
      get: () => invoke('beta:radiusSettings:get'),
      save: (settings) => invoke('beta:radiusSettings:save', settings),
    },
    cpeCredentials: {
      get: () => invoke('beta:cpeCredentials:get'),
      save: (settings) => invoke('beta:cpeCredentials:save', settings),
    }
  },
  invoke: (channel, ...args) => invoke(channel, ...args)
});
