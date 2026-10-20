import assert from 'node:assert/strict';
import { it } from 'node:test';
import express from 'express';
import request from 'supertest';
import { dealerManagementRouter } from './routes';
it('module API uses the verified login, ignores forged actor IDs and requires authentication', async () => {
  const calls: any[] = [];
  const service: any = {
    execute: async (...args: any[]) => {
      calls.push(args);
      return {
        saved: true
      };
    },
    capabilities: async (user: number) => ({
      enabled: true,
      user
    })
  };
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    if (req.headers['x-test-login']) (req as any).authUserId = Number(req.headers['x-test-login']);
    next();
  });
  app.use('/dealer-management', dealerManagementRouter(service));
  const rejected = await request(app).post('/dealer-management/dealerSave').send({
    user_id: 1
  });
  assert.equal(rejected.body.status, -1);
  assert.equal(calls.length, 0);
  const accepted = await request(app).post('/dealer-management/dealerSave').set('x-test-login', '3').send({
    user_id: 1,
    role: 'ADMIN'
  });
  assert.equal(accepted.body.status, 1);
  assert.equal(calls[0][0], 3);
  const caps = await request(app).post('/dealer-management/capabilities').set('x-test-login', '4').send({
    user_id: 1
  });
  assert.equal(caps.body.data.user, 4);
});
it('module API does not expose database error details', async () => {
  const service: any = {
    execute: async () => {
      throw Object.assign(new Error('SQL details including internal connection'), {
        code: 'ECONNREFUSED'
      });
    }
  };
  const app = express();
  app.use((req, _res, next) => {
    (req as any).authUserId = 1;
    next();
  });
  app.use('/dealer-management', dealerManagementRouter(service));
  const response = await request(app).post('/dealer-management/stock');
  assert.equal(response.body.status, -1);
  assert.ok(!response.body.info.includes('internal connection'));
});
