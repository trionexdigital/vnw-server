import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CATEGORY_CLASSIFIER_VERSION } from '../../pixels/api/categories/categoryClassifier';
import { reconcileAutomaticNumberCategories } from './mysqlDao';

interface InventoryRow {
    number_id: number;
    number_value: string;
}

class FakeMigrationPool {
    readonly calls: Array<{ sql: string; params: any[] }> = [];
    readonly currentVersions = new Map<number, number>();
    readonly mappingCounts = new Map<number, number>();
    migrationExists = false;
    failMappingInsert = false;
    connections = 0;
    commits = 0;
    rollbacks = 0;
    approvalRetirements = 0;
    uniqueIndexExists = false;

    constructor(readonly inventory: InventoryRow[]) { }

    async query(sql: string, params: any[] = []): Promise<any> {
        this.calls.push({ sql, params });
        if (/SELECT migration_key FROM schema_migrations/.test(sql)) {
            return [this.migrationExists ? [{ migration_key: 'automatic-number-categories-v2' }] : []];
        }
        if (/SELECT n\.number_id, n\.number_value/.test(sql)) {
            const lastId = Number(params[0]) || 0;
            const onlyMissing = sql.includes('NOT EXISTS');
            const rows = this.inventory
                .filter((row) => row.number_id > lastId)
                .filter((row) => !onlyMissing
                    || !/^\d{10}$/.test(row.number_value)
                    || (this.mappingCounts.get(row.number_id) ?? (this.currentVersions.has(row.number_id) ? 1 : 0)) !== 1
                    || this.currentVersions.get(row.number_id) !== CATEGORY_CLASSIFIER_VERSION)
                .sort((left, right) => left.number_id - right.number_id)
                .slice(0, 200);
            return [rows];
        }
        if (/COUNT\(vnc\.number_id\) AS mapping_count/.test(sql)) {
            const invalid = this.inventory.filter((row) => {
                const count = this.mappingCounts.get(row.number_id) ?? (this.currentVersions.has(row.number_id) ? 1 : 0);
                return count !== 1 || this.currentVersions.get(row.number_id) !== CATEGORY_CLASSIFIER_VERSION;
            }).map((row) => ({ number_id: row.number_id }));
            return [invalid];
        }
        if (/information_schema\.STATISTICS/.test(sql)) {
            return [this.uniqueIndexExists ? [{ INDEX_NAME: 'number_category_exclusive' }] : []];
        }
        if (/ALTER TABLE vip_number_categories ADD UNIQUE KEY/.test(sql)) {
            this.uniqueIndexExists = true;
            return [{ affectedRows: 0 }];
        }
        if (/UPDATE approval_requests/.test(sql)) {
            this.approvalRetirements += 1;
            return [{ affectedRows: 1 }];
        }
        if (/INSERT INTO schema_migrations/.test(sql)) {
            this.migrationExists = true;
            return [{ affectedRows: 1 }];
        }
        return [[]];
    }

    async getConnection() {
        this.connections += 1;
        const pool = this;
        return {
            beginTransaction: async () => undefined,
            commit: async () => { pool.commits += 1; },
            rollback: async () => { pool.rollbacks += 1; },
            release: () => undefined,
            query: async (sql: string, params: any[] = []) => {
                pool.calls.push({ sql, params });
                if (/DELETE FROM vip_number_categories/.test(sql)) {
                    pool.currentVersions.delete(Number(params[0]));
                    pool.mappingCounts.delete(Number(params[0]));
                    return [{ affectedRows: 1 }];
                }
                if (/UPDATE vip_numbers SET number_value/.test(sql)) {
                    const row = pool.inventory.find((candidate) => candidate.number_id === Number(params[1]));
                    if (row) row.number_value = String(params[0]);
                    return [{ affectedRows: row ? 1 : 0 }];
                }
                if (/INSERT INTO vip_number_categories/.test(sql)) {
                    if (pool.failMappingInsert) throw new Error('simulated mapping failure');
                    for (let index = 0; index < params.length; index += 3) {
                        pool.currentVersions.set(Number(params[index]), Number(params[index + 2]));
                        pool.mappingCounts.set(Number(params[index]), 1);
                    }
                    return [{ affectedRows: params.length / 3 }];
                }
                return [[]];
            },
        };
    }
}

test('migration preflight aborts with offending IDs before changing mappings', async () => {
    const pool = new FakeMigrationPool([
        { number_id: 4, number_value: '9193915915' },
        { number_id: 8, number_value: '12345' },
    ]);

    await assert.rejects(
        () => reconcileAutomaticNumberCategories(pool),
        /invalid vip_numbers IDs: 8/,
    );
    assert.equal(pool.connections, 0);
    assert.equal(pool.approvalRetirements, 0);
    assert.equal(pool.migrationExists, false);
});

test('migration preflight rejects canonical duplicates without discarding either record', async () => {
    const pool = new FakeMigrationPool([
        { number_id: 11, number_value: '9193915915' },
        { number_id: 12, number_value: '+91 91939 15915' },
    ]);

    await assert.rejects(
        () => reconcileAutomaticNumberCategories(pool),
        /duplicate canonical vip_numbers IDs: 11, 12/,
    );
    assert.equal(pool.connections, 0);
    assert.equal(pool.inventory[0].number_value, '9193915915');
    assert.equal(pool.inventory[1].number_value, '+91 91939 15915');
});

test('backfill is batched, transactional, records the ledger, and is idempotent', async () => {
    const pool = new FakeMigrationPool([
        { number_id: 1, number_value: '7693976939' },
        { number_id: 2, number_value: '9777777771' },
    ]);
    pool.migrationExists = true;
    pool.currentVersions.set(1, CATEGORY_CLASSIFIER_VERSION);

    await reconcileAutomaticNumberCategories(pool);
    assert.equal(pool.currentVersions.get(1), CATEGORY_CLASSIFIER_VERSION);
    assert.equal(pool.currentVersions.get(2), CATEGORY_CLASSIFIER_VERSION);
    assert.equal(pool.connections, 1);
    assert.equal(pool.commits, 1);
    assert.equal(pool.rollbacks, 0);
    assert.equal(pool.approvalRetirements, 1);
    assert.equal(pool.uniqueIndexExists, true);
    assert.ok(pool.calls.some((call) => /categories\.save/.test(call.sql)));

    await reconcileAutomaticNumberCategories(pool);
    assert.equal(pool.connections, 1, 'a second run must not rewrite current mappings');
    assert.equal(pool.commits, 1);

    const indexLookup = pool.calls.find((call) => /information_schema\.STATISTICS/.test(call.sql));
    assert.ok(indexLookup);
    assert.match(indexLookup.sql, /WHERE[\s\S]*s\.NON_UNIQUE = 0/);
    assert.doesNotMatch(indexLookup.sql, /HAVING\s+s\.NON_UNIQUE/);
});

test('v2 rebuild collapses legacy multi-category rows before enforcing the unique number index', async () => {
    const pool = new FakeMigrationPool([{ number_id: 6, number_value: '9006622121' }]);
    pool.currentVersions.set(6, 1);
    pool.mappingCounts.set(6, 4);

    await reconcileAutomaticNumberCategories(pool);

    assert.equal(pool.currentVersions.get(6), CATEGORY_CLASSIFIER_VERSION);
    assert.equal(pool.mappingCounts.get(6), 1);
    assert.equal(pool.uniqueIndexExists, true);
    assert.ok(pool.calls.some((call) => /DELETE FROM vip_number_categories/.test(call.sql)));
    assert.ok(pool.calls.some((call) => /ADD UNIQUE KEY number_category_exclusive/.test(call.sql)));
});

test('a failed mapping batch rolls back and never records a completed migration', async () => {
    const pool = new FakeMigrationPool([{ number_id: 3, number_value: '9193915915' }]);
    pool.migrationExists = true;
    pool.failMappingInsert = true;

    await assert.rejects(() => reconcileAutomaticNumberCategories(pool), /simulated mapping failure/);
    assert.equal(pool.commits, 0);
    assert.equal(pool.rollbacks, 1);
    assert.equal(pool.approvalRetirements, 0);
    const ledgerWrites = pool.calls.filter((call) => /INSERT INTO schema_migrations/.test(call.sql));
    assert.equal(ledgerWrites.length, 0);
});

test('a valid formatted legacy value is canonicalized with its derived rows', async () => {
    const pool = new FakeMigrationPool([{ number_id: 5, number_value: '+91 (91939) 15915' }]);
    pool.migrationExists = true;
    pool.currentVersions.set(5, CATEGORY_CLASSIFIER_VERSION);

    await reconcileAutomaticNumberCategories(pool);
    assert.equal(pool.inventory[0].number_value, '9193915915');
    assert.equal(pool.currentVersions.get(5), CATEGORY_CLASSIFIER_VERSION);
    assert.equal(pool.commits, 1);
    assert.ok(pool.calls.some((call) => /UPDATE vip_numbers SET number_value/.test(call.sql)));
});

test('number-facing runtime services contain no SQL against the legacy category master', () => {
    const runtimeFiles = [
        'src/server/pixels/api/categories/categories.ts',
        'src/server/pixels/api/numbers/numbers.ts',
        'src/server/pixels/api/cart/cart.ts',
        'src/server/pixels/api/wishlist/wishlist.ts',
        'src/server/pixels/api/orders/orders.ts',
        'src/server/pixels/api/sell/sell.ts',
    ];
    const legacySql = /\b(?:FROM|JOIN|INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+`?categories`?\b/i;
    for (const relativePath of runtimeFiles) {
        const source = readFileSync(resolve(process.cwd(), relativePath), 'utf8');
        assert.doesNotMatch(source, legacySql, `${relativePath} still references the legacy category table`);
    }
});
