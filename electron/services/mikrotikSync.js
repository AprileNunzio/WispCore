import { RouterOSClient } from 'routeros-client';
import { listBetaNasRouters } from './database.js';

export async function fetchMikrotikAccounts(nasId) {
  const routers = listBetaNasRouters();
  const nas = routers.find((r) => r.id === nasId);

  if (!nas) {
    throw new Error('NAS non trovato nel database');
  }

  if (!nas.ip_address || !nas.username || !nas.password) {
    throw new Error('Il NAS non ha IP, Username o Password configurati.');
  }

  // nas.password is decrypted by mapBetaNasRouter inside database.js
  const apiPort = nas.api_port || 8728;

  const client = new RouterOSClient({
    host: nas.ip_address,
    user: nas.username,
    password: nas.password,
    port: apiPort,
    timeout: 10000,
  });

  try {
    await client.connect();

    // Fetch PPPoE secrets
    const pppoeMenu = client.menu('/ppp/secret');
    let secrets = [];
    try {
        secrets = await pppoeMenu.get();
    } catch (e) {
        console.warn('Nessun secret PPPoE trovato o errore', e);
    }

    // Fetch DHCP Leases
    const dhcpMenu = client.menu('/ip/dhcp-server/lease');
    let leases = [];
    try {
      leases = await dhcpMenu.get();
    } catch (e) {
      console.warn('Nessun DHCP lease trovato o errore', e);
    }

    await client.close();

    const results = [];

    // Map PPPoE Secrets
    for (const sec of secrets) {
      results.push({
        id: sec['.id'],
        type: 'pppoe',
        name: sec.name || '',
        password: sec.password || '',
        profile: sec.profile || '',
        caller_id: sec['caller-id'] || '', // MAC Address if locked
        remote_address: sec['remote-address'] || '',
        comment: sec.comment || '',
      });
    }

    // Map DHCP Leases
    for (const lease of leases) {
      if (lease.dynamic === 'true') continue; // Skip dynamic leases
      results.push({
        id: lease['.id'],
        type: 'dhcp',
        name: lease.comment || lease['mac-address'] || '',
        password: '',
        profile: lease.server || '',
        caller_id: lease['mac-address'] || '',
        remote_address: lease.address || '',
        comment: lease.comment || '',
      });
    }

    return results;
  } catch (error) {
    throw new Error(`Errore di connessione Mikrotik API: ${error.message}`);
  }
}
