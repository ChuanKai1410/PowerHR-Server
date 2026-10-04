import { afterEach, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import Jwt from '../../util/Jwt.js';
import jwtPlugin from '../../plugins/jwt.js';

vi.mock('dotenv', () => ({ default: { config: vi.fn() }, config: vi.fn() }));
afterEach(() => vi.unstubAllEnvs());

it.each(['', '   '])('fails closed for an unset or blank signing secret', async (secret) => {
    vi.stubEnv('JWT_SECRET', secret);
    expect(() => Jwt.generateToken({ type: 'access' }, '1d')).toThrow('JWT_SECRET is required');
    const app = Fastify();
    try {
        await expect(app.register(jwtPlugin).ready()).rejects.toThrow('JWT_SECRET is required');
    } finally {
        await app.close();
    }
});

it('uses one HS256 secret and a one-day expiry in both signing implementations', async () => {
    vi.stubEnv('JWT_SECRET', 'isolated-signing-contract-secret');
    const app = Fastify();
    try {
        await app.register(jwtPlugin);
        const payload = { id: '000000000000000000000001', type: 'access' };
        const claims = app.jwt.verify(Jwt.generateToken(payload, '1d'));
        expect(claims.exp - claims.iat).toBe(86400);
        expect(Jwt.verifyToken(app.jwt.sign(payload))).toMatchObject(payload);
        const pluginClaims = Jwt.verifyToken(app.jwt.sign(payload));
        expect(pluginClaims.exp - pluginClaims.iat).toBe(86400);
    } finally {
        await app.close();
    }
});
