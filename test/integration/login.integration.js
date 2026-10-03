import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomBytes } from 'node:crypto';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import Fastify from 'fastify';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { fixtureDatabase, fixturePassword, seedLoginAccounts } from '../fixtures/login-accounts.js';

// Do not read local credentials or send email during the isolated database tests.
vi.mock('dotenv', () => ({ default: { config: vi.fn() }, config: vi.fn() }));
vi.mock('../../util/Email.js', () => ({
    default: {
        sendEmail: vi.fn(() => {
            throw new Error('Email disabled in tests');
        }),
    },
}));

let mongod;
let app;
let seeded;
let AuthController;
const secret = randomBytes(32).toString('hex');

beforeAll(async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('JWT_SECRET', secret);
    mongod = await MongoMemoryServer.create({ instance: { dbName: fixtureDatabase, ip: '127.0.0.1' } });
    await mongoose.connect(mongod.getUri(), { dbName: fixtureDatabase });
    seeded = await seedLoginAccounts();
    const { default: routes } = await import('../../routes/auth/index.js');
    ({ default: AuthController } = await import('../../services/auth/authController.js'));
    app = Fastify();
    await app.register(routes, { prefix: '/auth' });
    await app.ready();
});

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

function login(name, password = fixturePassword) {
    return app.inject({ method: 'POST', url: '/auth/login', payload: { email: `${name}@example.invalid`, password } });
}

describe('Real login with disposable MongoDB, bcrypt and JWT', () => {
    it.each([
        ['applicant', 'Applicant'],
        ['hr', 'HR'],
        ['sysadmin', 'SysAdmin'],
        ['company-admin', 'Admin'],
    ])('logs in %s without changing its role', async (name, role) => {
        const response = await login(name);
        expect(response.statusCode).toBe(200);
        const { user, token } = response.json();
        expect(user.role).toBe(role);
        expect(user._id).toBe(String(seeded.accounts[name]._id));
        expect(user).not.toHaveProperty('password');
        const claims = jwt.verify(token, secret);
        expect(claims.type).toBe('access');
        expect(claims.id).toBe(user._id);
        expect(claims.exp - claims.iat).toBe(86400);
        if (name === 'hr') expect(claims.company).toBe(String(seeded.companies[0]._id));
    });
    it.each(['unknown', 'inactive', 'missing-auth'])('rejects %s with 401', async (name) => {
        expect((await login(name)).statusCode).toBe(401);
    });
    it('rejects a wrong password', async () => {
        expect((await login('applicant', 'wrong')).statusCode).toBe(401);
    });
    it('normalizes email case and surrounding whitespace', async () => {
        const response = await app.inject({
            method: 'POST',
            url: '/auth/login',
            payload: { email: '  APPLICANT@EXAMPLE.INVALID  ', password: fixturePassword },
        });
        expect(response.statusCode).toBe(200);
    });
    it('stores hashed passwords and separate company fixtures', async () => {
        expect(seeded.accounts.applicant.password).not.toBe(fixturePassword);
        expect(await bcrypt.compare(fixturePassword, seeded.accounts.applicant.password)).toBe(true);
        expect(String(seeded.accounts.hr.company)).not.toBe(String(seeded.accounts['other-hr'].company));
    });
    it('refuses repeat seeding rather than overwriting data', async () => {
        await expect(seedLoginAccounts()).rejects.toThrow('nonempty');
    });
    it('does not convert a terminated employee before password verification', async () => {
        const controller = new AuthController();
        const user = seeded.accounts.hr;
        const find = vi.spyOn(controller.userFactory, 'findOne').mockResolvedValue({
            _id: user._id,
            __t: 'Employee',
            password: user.password,
            terminationDate: new Date(0),
        });
        const convert = vi.spyOn(controller.userFactory, 'convert').mockResolvedValue(undefined);
        try {
            await expect(controller.login(user.email, 'wrong')).rejects.toMatchObject({ statusCode: 401 });
            expect(convert).not.toHaveBeenCalled();
        } finally {
            find.mockRestore();
            convert.mockRestore();
        }
    });
});
