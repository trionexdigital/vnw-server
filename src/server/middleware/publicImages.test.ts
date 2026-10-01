import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import helmet from 'helmet';
import request from 'supertest';
import { router as auth } from './auth.middleware';

test('public client logos can be embedded across storefront/API origins without API auth headers', async () => {
  const app = express(); app.use(helmet()); app.use(auth);
  app.get('/vipnumberworld/site/trusted-clients/3/logo', (_req, res) => res.type('png').send(Buffer.from([137,80,78,71])));
  const response = await request(app).get('/vipnumberworld/site/trusted-clients/3/logo');
  assert.equal(response.status, 200);
  assert.equal(response.headers['cross-origin-resource-policy'], 'cross-origin');
  assert.match(response.headers['content-type'], /image\/png/);
  assert.equal(response.body.length, 4);
});
