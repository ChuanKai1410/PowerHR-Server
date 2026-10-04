import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomBytes } from 'node:crypto';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import Fastify from 'fastify';
import jwt from 'jsonwebtoken';
import jwtPlugin from '../../plugins/jwt.js';
import authPlugin from '../../plugins/auth.js';
import routes from '../../routes/auth/index.js';
import AuthController from '../../services/auth/authController.js';
import Employee from '../../models/users/employee.js';
import Authentication from '../../models/auth/authentication.js';
import { fixtureDatabase, fixturePassword, seedLoginAccounts } from '../fixtures/login-accounts.js';

vi.mock('dotenv', () => ({ default: { config: vi.fn() }, config: vi.fn() }));
vi.mock('../../util/Email.js', () => ({
    default: {
        sendEmail: vi.fn(() => {
            throw new Error('Email disabled in tests');
        }),
    },
}));

const secret = randomBytes(32).toString('hex');
let app;
let mongod;
let seeded;

beforeAll(async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('JWT_SECRET', secret);
    mongod = await MongoMemoryServer.create({ instance: { dbName: fixtureDatabase, ip: '127.0.0.1' } });
    await mongoose.connect(mongod.getUri(), { dbName: fixtureDatabase });
    seeded = await seedLoginAccounts();
    app = Fastify();
    await app.register(jwtPlugin);
    await app.register(authPlugin);
    await app.register(routes, { prefix: '/auth' });
    await app.ready();
});

afterEach(() => vi.restoreAllMocks());
afterAll(async () => {
    try {
        if (app) await app.close();
    } finally {
        try {
            await mongoose.disconnect();
        } finally {
            if (mongod) await mongod.stop();
            vi.unstubAllEnvs();
        }
    }
});

function token(name = 'applicant', claims = {}, options = {}) {
    return jwt.sign({ id: String(seeded.accounts[name]._id), type: 'access', ...claims }, secret, {
        algorithm: 'HS256',
        expiresIn: '1d',
        ...options,
    });
}
function me(value) {
    return app.inject({ url: '/auth/me', headers: { authorization: `Bearer ${value}` } });
}
function register(value, payload = {}) {
    return app.inject({
        method: 'POST',
        url: '/auth/register/sysadmin',
        headers: value ? { authorization: `Bearer ${value}` } : {},
        payload,
    });
}

describe('Active database identity and access-token enforcement', () => {
    it.each(['applicant', 'hr', 'sysadmin', 'company-admin'])(
        'uses a real login token for %s and returns only public identity fields',
        async (name) => {
            const login = await app.inject({
                method: 'POST',
                url: '/auth/login',
                payload: {
                    email: `${name}@example.invalid`,
                    password: fixturePassword,
                },
            });
            expect(login.statusCode).toBe(200);
            const result = await me(login.json().token);
            expect(result.statusCode).toBe(200);
            expect(result.json().user).toEqual({
                _id: String(seeded.accounts[name]._id),
                firstName: 'FIXTURE',
                lastName: seeded.accounts[name].lastName,
                email: `${name}@example.invalid`,
                role: login.json().user.role,
                company: seeded.accounts[name].company ? String(seeded.accounts[name].company) : null,
            });
        },
    );
    it.each([undefined, '', 'Basic abc', 'Bearer', 'Bearer a b', 'Bearer malformed'])(
        'rejects absent or malformed authorization: %s',
        async (authorization) => {
            const result = await app.inject({
                url: '/auth/me',
                headers: authorization === undefined ? {} : { authorization },
            });
            expect(result.statusCode).toBe(401);
            expect(result.json()).toEqual({ error: 'Unauthorized' });
        },
    );
    it.each(['active', 'reset', 'other'])('rejects %s-purpose JWTs', async (type) => {
        expect((await me(token('applicant', { type }))).statusCode).toBe(401);
    });
    it('rejects expired tokens', async () => {
        expect((await me(token('applicant', {}, { expiresIn: -1 }))).statusCode).toBe(401);
    });
    it('rejects tokens without expiration', async () => {
        const value = jwt.sign({ id: String(seeded.accounts.applicant._id), type: 'access' }, secret);
        expect((await me(value)).statusCode).toBe(401);
    });
    it('rejects a different signing key', async () => {
        const value = jwt.sign({ id: String(seeded.accounts.applicant._id), type: 'access' }, 'untrusted-test-key', {
            expiresIn: '1d',
        });
        expect((await me(value)).statusCode).toBe(401);
    });
    it('rejects a different signing algorithm', async () => {
        expect((await me(token('applicant', {}, { algorithm: 'HS384' }))).statusCode).toBe(401);
    });
    it.each(['bad-id', null, 123])('rejects invalid user id %s', async (id) => {
        expect((await me(token('applicant', { id }))).statusCode).toBe(401);
    });
    it('does not accept cookie or query authentication', async () => {
        const value = token();
        const result = await app.inject({ url: `/auth/me?token=${value}`, headers: { cookie: `token=${value}` } });
        expect(result.statusCode).toBe(401);
    });
    it.each(['inactive', 'missing-auth'])('rejects %s accounts', async (name) => {
        expect((await me(token(name))).statusCode).toBe(401);
    });
    it('rejects missing users', async () => {
        expect((await me(token('applicant', { id: String(new mongoose.Types.ObjectId()) }))).statusCode).toBe(401);
    });
    it('rechecks activation after a token has been issued', async () => {
        const value = token();
        await Authentication.updateOne({ user: seeded.accounts.applicant._id }, { active: false });
        try {
            expect((await me(value)).statusCode).toBe(401);
        } finally {
            await Authentication.updateOne({ user: seeded.accounts.applicant._id }, { active: true });
        }
    });
    it('rejects an employee whose termination date has passed', async () => {
        await Employee.updateOne({ _id: seeded.accounts.hr._id }, { $set: { terminationDate: new Date(0) } });
        try {
            expect((await me(token('hr'))).statusCode).toBe(401);
        } finally {
            await Employee.updateOne({ _id: seeded.accounts.hr._id }, { $unset: { terminationDate: 1 } });
        }
    });
    it('uses current company data instead of stale or forged claims', async () => {
        const result = await me(token('hr', { company: String(seeded.companies[1]._id), role: 'SysAdmin' }));
        expect(result.statusCode).toBe(200);
        expect(result.json().user.company).toBe(String(seeded.companies[0]._id));
        expect(result.json().user.role).toBe('HR');
    });
    it('fails closed without leaking database errors', async () => {
        vi.spyOn(Authentication, 'exists').mockRejectedValue(new Error('Private database details'));
        const result = await me(token());
        expect(result.statusCode).toBe(503);
        expect(result.json()).toEqual({ error: 'Authentication unavailable' });
    });
});

describe('SysAdmin provisioning boundary (provisioning itself stubbed)', () => {
    it('rejects anonymous registration before body validation or provisioning', async () => {
        const provision = vi.spyOn(AuthController.prototype, 'register');
        expect((await register()).statusCode).toBe(401);
        expect(provision).not.toHaveBeenCalled();
    });
    it.each(['applicant', 'hr', 'company-admin'])('denies %s despite forged role claims', async (name) => {
        const provision = vi.spyOn(AuthController.prototype, 'register');
        expect((await register(token(name, { role: 'SysAdmin', __t: 'SysAdmin' }))).statusCode).toBe(403);
        expect(provision).not.toHaveBeenCalled();
    });
    it('does not grant SysAdmin permission to an employee with that job title', async () => {
        await Employee.updateOne({ _id: seeded.accounts.hr._id }, { jobTitle: 'SysAdmin' });
        try {
            expect((await register(token('hr'))).statusCode).toBe(403);
        } finally {
            await Employee.updateOne({ _id: seeded.accounts.hr._id }, { jobTitle: 'HR' });
        }
    });
    it('denies an inactive stored SysAdmin', async () => {
        await Authentication.updateOne({ user: seeded.accounts.sysadmin._id }, { active: false });
        try {
            expect((await register(token('sysadmin'))).statusCode).toBe(401);
        } finally {
            await Authentication.updateOne({ user: seeded.accounts.sysadmin._id }, { active: true });
        }
    });
    it('awaits provisioning for an active stored SysAdmin', async () => {
        const provision = vi.spyOn(AuthController.prototype, 'register').mockResolvedValue({ _id: 'fixture-id' });
        const payload = {
            email: 'new@example.invalid',
            firstName: 'New',
            lastName: 'Admin',
            gender: 'Prefer not to say',
            password: fixturePassword,
        };
        const result = await register(token('sysadmin'), payload);
        expect(result.statusCode).toBe(201);
        expect(provision).toHaveBeenCalledWith('sysadmin', payload);
    });
    it('handles asynchronous provisioning failure without reporting success', async () => {
        vi.spyOn(AuthController.prototype, 'register').mockRejectedValue(new Error('Provisioning failed'));
        const result = await register(token('sysadmin'), {
            email: 'new@example.invalid',
            firstName: 'New',
            lastName: 'Admin',
            gender: 'Prefer not to say',
            password: fixturePassword,
        });
        expect(result.statusCode).toBe(500);
        expect(result.json()).toEqual({ error: 'Something went wrong' });
    });
});
