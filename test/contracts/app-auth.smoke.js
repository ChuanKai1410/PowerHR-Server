import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import Fastify from 'fastify';
import dotenv from 'dotenv';

// Native imports exercise production autoload without Vitest's separate module cache.
// No local environment file, external database, email or listening socket is used.
dotenv.config = () => ({});
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = randomBytes(32).toString('hex');
const { default: application } = await import('../../app.js');
const { default: Jwt } = await import('../../util/Jwt.js');
const app = Fastify();
before(async () => {
    await app.register(application);
    await app.ready();
});
after(async () => app.close());

test('production autoload preserves the public root without a token', async () => {
    assert.equal((await app.inject('/')).statusCode, 200);
});
test('production autoload protects current identity without querying the database', async () => {
    assert.equal((await app.inject('/auth/me')).statusCode, 401);
});
test('production autoload protects SysAdmin provisioning before body validation', async () => {
    assert.equal((await app.inject({ method: 'POST', url: '/auth/register/sysadmin', payload: {} })).statusCode, 401);
});
test('global optional-header verification rejects non-access JWTs', async () => {
    const token = Jwt.generateToken({ id: '000000000000000000000001', type: 'active' }, '1d');
    assert.equal((await app.inject({ url: '/', headers: { authorization: `Bearer ${token}` } })).statusCode, 401);
});
test('global optional-header verification accepts a correctly signed access JWT', async () => {
    const token = Jwt.generateToken({ id: '000000000000000000000001', type: 'access' }, '1d');
    assert.equal((await app.inject({ url: '/', headers: { authorization: `Bearer ${token}` } })).statusCode, 200);
});
test('global optional-header verification rejects expired access JWTs', async () => {
    const token = Jwt.generateToken({ id: '000000000000000000000001', type: 'access' }, -1);
    assert.equal((await app.inject({ url: '/', headers: { authorization: `Bearer ${token}` } })).statusCode, 401);
});
