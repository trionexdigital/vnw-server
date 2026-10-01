import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { OFFLINE_CATALOG_NAME, PrivateLinks, generatePrivateToken, hashPrivateToken, resolvePrivateLinkWithConnection } from './privateLinks';
import { Numbers } from '../numbers/numbers';

describe('private number links', () => {
  it('generates opaque tokens and stores deterministic hashes', () => {
    const left = generatePrivateToken(); const right = generatePrivateToken();
    assert.notEqual(left, right); assert.ok(left.length >= 40);
    assert.equal(hashPrivateToken(left), hashPrivateToken(left));
    assert.notEqual(hashPrivateToken(left), left);
    assert.match(hashPrivateToken(left), /^[a-f0-9]{64}$/);
  });

  it('binds validation to the one generic catalog and active token hash', async () => {
    const token = generatePrivateToken(); let captured: any[] = [];
    const connection = { query: async (_sql: string, params: any[]) => { captured = params; return [[{ private_link_id: 7, name: OFFLINE_CATALOG_NAME }]]; } };
    const link = await resolvePrivateLinkWithConnection(connection, token, 42);
    assert.equal(link.private_link_id, 7);
    assert.deepEqual(captured, [OFFLINE_CATALOG_NAME, hashPrivateToken(token)]);
  });

  it('adds the Online visibility boundary to every public catalog listing', async () => {
    const service = new Numbers(); const sql: string[] = [];
    (service as any).prebooks = { reconcile: async () => undefined };
    (service as any).dao = { executeQuery: async (query: string) => {
      sql.push(query); return query.includes('COUNT(*)') ? { status: 1, rows: [{ total: 0 }] } : { status: 1, rows: [] };
    } };
    const response: any = await service.list({});
    assert.equal(response.status, 1);
    assert.ok(sql.some((query) => /visibility_type\s*=\s*'ONLINE'/.test(query)));
  });

  it('pages all available Online and Offline inventory through the generic bearer link', async () => {
    const calls: Array<{ sql: string; params: any[] }> = [];
    const connection = {
      query: async (sql: string, params: any[]) => {
        calls.push({ sql, params });
        if (sql.includes('number_private_links')) return [[{ private_link_id: 4, name: OFFLINE_CATALOG_NAME }]];
        if (sql.includes('COUNT(*)')) return [[{ total: 62 }]];
        return [[{ number_id: 9, number_value: '9876543210', display_number: '9876 543 210', status: 'AVAILABLE', stock: 1, visibility_type: 'OFFLINE' }]];
      },
      release: () => undefined,
    };
    const service = new PrivateLinks();
    (service as any).dao = { getConnection: async () => connection };
    const response: any = await service.resolve({ token: 'bearer', page: 2, limit: 25 });
    assert.equal(response.status, 1);
    assert.equal(response.data.total, 62);
    assert.equal(response.data.items[0].visibility_type, 'OFFLINE');
    assert.deepEqual(calls.at(-1)?.params.slice(-2), [25, 25]);
    assert.doesNotMatch(calls.at(-1)?.sql || '', /visibility_type\s*=\s*'ONLINE'/);
  });
});
