import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { generatePrivateToken, hashPrivateToken, resolvePrivateLinkWithConnection } from './privateLinks';
import { Numbers } from '../numbers/numbers';

describe('private number links', () => {
  it('generates opaque tokens and stores deterministic hashes', () => {
    const left = generatePrivateToken(); const right = generatePrivateToken();
    assert.notEqual(left, right); assert.ok(left.length >= 40);
    assert.equal(hashPrivateToken(left), hashPrivateToken(left));
    assert.notEqual(hashPrivateToken(left), left);
    assert.match(hashPrivateToken(left), /^[a-f0-9]{64}$/);
  });

  it('binds validation to the requested number and active token hash', async () => {
    const token = generatePrivateToken(); let captured: any[] = [];
    const connection = { query: async (_sql: string, params: any[]) => { captured = params; return [[{ private_link_id: 7, name: 'Private stock' }]]; } };
    const link = await resolvePrivateLinkWithConnection(connection, token, 42);
    assert.equal(link.private_link_id, 7);
    assert.deepEqual(captured, [42, hashPrivateToken(token)]);
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
});
