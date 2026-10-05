import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomBytes } from 'node:crypto';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import Fastify from 'fastify';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import jwtPlugin from '../../plugins/jwt.js';
import authPlugin from '../../plugins/auth.js';
import authRoutes from '../../routes/auth/index.js';
import userRoutes from '../../routes/users/index.js';
import companyRoutes from '../../routes/company/index.js';
import AuthController from '../../services/auth/authController.js';
import UserFactory from '../../services/users/userFactory.js';
import User from '../../models/users/user.js';
import Applicant from '../../models/users/applicant.js';
import Authentication from '../../models/auth/authentication.js';
import Email from '../../util/Email.js';
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
const newPassword = 'Changed-Fixture!43';
const body = { oldPassword: fixturePassword, newPassword, confirmPassword: newPassword };
let app;
let mongod;
let seeded;

beforeAll(async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('JWT_SECRET', secret);
    // A single-node disposable replica set supports the legacy profile transaction.
    mongod = await MongoMemoryReplSet.create({ replSet: { count: 1, dbName: fixtureDatabase, ip: '127.0.0.1' } });
    await mongoose.connect(mongod.getUri(), { dbName: fixtureDatabase });
    seeded = await seedLoginAccounts();
    app = Fastify();
    await app.register(jwtPlugin);
    await app.register(authPlugin);
    await app.register(authRoutes, { prefix: '/auth' });
    await app.register(userRoutes, { prefix: '/users' });
    await app.register(companyRoutes, { prefix: '/company' });
    await app.ready();
});

afterEach(async () => {
    vi.restoreAllMocks();
    if (seeded) {
        for (const user of Object.values(seeded.accounts)) {
            await User.updateOne({ _id: user._id }, { $set: { password: user.password, firstName: user.firstName } });
        }
    }
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

function token(name, claims = {}, options = {}) {
    return jwt.sign({ id: String(seeded.accounts[name]._id), type: 'access', ...claims }, secret, {
        expiresIn: '1d',
        ...options,
    });
}
function login(name, password) {
    return app.inject({ method: 'POST', url: '/auth/login', payload: { email: `${name}@example.invalid`, password } });
}
function change(name = 'applicant', payload = body, target = name, value = token(name)) {
    return app.inject({
        method: 'POST',
        url: `/auth/change-password/${seeded.accounts[target]?._id || target}`,
        headers: value ? { authorization: `Bearer ${value}` } : {},
        payload,
    });
}
async function expectUnchanged(name = 'applicant') {
    expect((await User.findById(seeded.accounts[name]._id)).password).toBe(seeded.accounts[name].password);
}

describe('Authenticated self-service password changes', () => {
    it.each(['applicant', 'hr', 'sysadmin', 'company-admin'])(
        'changes only the authenticated %s password',
        async (name) => {
            const signedIn = await login(name, fixturePassword);
            expect(signedIn.statusCode).toBe(200);
            const result = await change(name, body, name, signedIn.json().token);
            expect(result.statusCode).toBe(200);
            expect(result.json()).toEqual({ message: 'Password changed' });
            const saved = await User.findById(seeded.accounts[name]._id);
            expect(saved.password).not.toBe(newPassword);
            expect(await bcrypt.compare(newPassword, saved.password)).toBe(true);
            expect((await login(name, fixturePassword)).statusCode).toBe(401);
            expect((await login(name, newPassword)).statusCode).toBe(200);
            await expectUnchanged('other-applicant');
        },
    );
    it('rejects anonymous writes before body validation', async () => {
        expect((await change('applicant', {}, 'applicant', null)).statusCode).toBe(401);
        await expectUnchanged();
    });
    it.each(['active', 'reset'])('rejects %s tokens as authorization', async (type) => {
        expect((await change('applicant', body, 'applicant', token('applicant', { type }))).statusCode).toBe(401);
        await expectUnchanged();
    });
    it('rejects expired access tokens', async () => {
        expect(
            (await change('applicant', body, 'applicant', token('applicant', {}, { expiresIn: -1 }))).statusCode,
        ).toBe(401);
        await expectUnchanged();
    });
    it.each(['inactive', 'missing-auth'])('rejects the %s account', async (name) => {
        expect((await change(name)).statusCode).toBe(401);
        await expectUnchanged(name);
    });
    it.each([
        ['applicant', 'other-applicant'],
        ['hr', 'other-hr'],
        ['sysadmin', 'applicant'],
    ])('denies %s changing %s even with the correct target password', async (actor, target) => {
        const result = await change(
            actor,
            { ...body, id: String(seeded.accounts[target]._id), role: 'SysAdmin' },
            target,
            token(actor, { role: 'SysAdmin', company: String(seeded.companies[1]._id) }),
        );
        expect(result.statusCode).toBe(403);
        await expectUnchanged(actor);
        await expectUnchanged(target);
    });
    it('rejects a malformed target id', async () => {
        expect((await change('applicant', body, 'not-an-id')).statusCode).toBe(400);
    });
    it('handles a canonical uppercase ObjectId as the same owner', async () => {
        const id = String(seeded.accounts.applicant._id).toUpperCase();
        expect((await change('applicant', body, id)).statusCode).toBe(200);
    });
    it.each(['oldPassword', 'newPassword', 'confirmPassword'])('rejects a missing %s', async (field) => {
        const payload = { ...body };
        delete payload[field];
        expect((await change('applicant', payload)).statusCode).toBe(400);
        await expectUnchanged();
    });
    it.each(['', null, 'wrong-password'])(
        'rejects an empty, null or wrong current password: %s',
        async (oldPassword) => {
            expect((await change('applicant', { ...body, oldPassword })).statusCode).toBe(400);
            await expectUnchanged();
        },
    );
    it('rejects a confirmation mismatch', async () => {
        expect((await change('applicant', { ...body, confirmPassword: 'Different!123' })).statusCode).toBe(400);
        await expectUnchanged();
    });
    it.each(['Short1!', 'alllowercase123', 'A'.repeat(69) + 'a1!!', 'Aa1!' + '\u00e9'.repeat(35)])(
        'rejects a weak or oversized new password',
        async (password) => {
            expect(
                (await change('applicant', { ...body, newPassword: password, confirmPassword: password })).statusCode,
            ).toBe(400);
            await expectUnchanged();
        },
    );
    it('accepts the 72-byte bcrypt boundary', async () => {
        const password = 'Aa1!' + 'x'.repeat(68);
        expect(
            (await change('applicant', { ...body, newPassword: password, confirmPassword: password })).statusCode,
        ).toBe(200);
        expect((await login('applicant', password)).statusCode).toBe(200);
    });
    it('hashes plaintext with a stored-hash-like prefix instead of saving it verbatim', async () => {
        const password = '$2b$NotAnEncodedHash!42';
        expect(
            (await change('applicant', { ...body, newPassword: password, confirmPassword: password })).statusCode,
        ).toBe(200);
        const user = await User.findById(seeded.accounts.applicant._id);
        expect(user.password).not.toBe(password);
        expect(await bcrypt.compare(password, user.password)).toBe(true);
        expect((await login('applicant', password)).statusCode).toBe(200);
    });
    it('fails closed when current account verification is unavailable', async () => {
        vi.spyOn(Authentication, 'exists').mockRejectedValue(new Error('Private database details'));
        const result = await change();
        expect(result.statusCode).toBe(503);
        expect(result.json()).toEqual({ error: 'Authentication unavailable' });
        await expectUnchanged();
    });
    it('sanitizes unexpected password-write failures', async () => {
        vi.spyOn(UserFactory.prototype, 'changePassword').mockRejectedValue(new Error('Private database details'));
        const result = await change();
        expect(result.statusCode).toBe(500);
        expect(result.json()).toEqual({ error: 'Something went wrong' });
        await expectUnchanged();
    });
    it('does not trust a body id to select another user', async () => {
        expect(
            (await change('applicant', { ...body, id: String(seeded.accounts['other-applicant']._id) })).statusCode,
        ).toBe(200);
        await expectUnchanged('other-applicant');
    });
});

describe('Credential writes cannot use generic profile update paths', () => {
    it.each([
        { password: 'injected-hash' },
        { $set: { password: 'injected-hash' } },
        { $rename: { email: 'password' } },
        { 'password.value': 'injected-hash' },
    ])('rejects password fields and Mongo update syntax before any transaction', async (user) => {
        const session = vi.spyOn(mongoose, 'startSession');
        const result = await app.inject({
            method: 'PUT',
            url: `/users/applicant/${seeded.accounts.applicant._id}`,
            payload: { user },
        });
        expect(result.statusCode).toBe(400);
        expect(result.json()).toEqual({ error: 'Invalid profile update' });
        expect(session).not.toHaveBeenCalled();
        await expectUnchanged();
    });
    it.each(['user', 'employee', 'sysadmin'])('rejects a password update for the %s path', async (role) => {
        const result = await app.inject({
            method: 'PUT',
            url: `/users/${role}/${seeded.accounts.applicant._id}`,
            payload: { user: { password: 'injected-hash' } },
        });
        expect(result.statusCode).toBe(400);
        await expectUnchanged();
    });
    it('rejects a password update through the company employee facade', async () => {
        const result = await app.inject({
            method: 'PUT',
            url: `/company/${seeded.companies[0]._id}/employees/${seeded.accounts.hr._id}`,
            payload: { __t: 'Employee', password: 'injected-hash' },
        });
        expect(result.statusCode).toBe(400);
        await expectUnchanged('hr');
    });
    it('preserves an ordinary profile update with its legacy transaction', async () => {
        const result = await app.inject({
            method: 'PUT',
            url: `/users/applicant/${seeded.accounts.applicant._id}`,
            headers: { authorization: `Bearer ${token('applicant')}` },
            payload: { user: { firstName: 'Updated' } },
        });
        expect(result.statusCode).toBe(200);
        expect(result.json().firstName).toBe('Updated');
        expect(result.json()).not.toHaveProperty('password');
        await expectUnchanged();
    });
    it('persists an application reference without changing the password', async () => {
        const applicationId = new mongoose.Types.ObjectId();
        const update = { $push: { appliedJobs: applicationId } };
        await new UserFactory().findByIdAndUpdateApplicant(seeded.accounts.applicant._id, update);
        const applicant = await Applicant.findById(seeded.accounts.applicant._id);
        expect(applicant.appliedJobs.map(String)).toContain(String(applicationId));
        await expectUnchanged();
    });
});

describe('Shared password service compatibility', () => {
    it.each([undefined, null, '', 0])(
        'requires a current password at the self-service controller',
        async (oldPassword) => {
            const controller = new AuthController();
            const write = vi.spyOn(controller.userFactory, 'changePassword');
            await expect(
                controller.changePassword(seeded.accounts.applicant._id, newPassword, newPassword, oldPassword),
            ).rejects.toMatchObject({ statusCode: 400 });
            expect(write).not.toHaveBeenCalled();
        },
    );
    it('keeps token-based password reset working without a current password', async () => {
        const value = token('applicant', { type: 'reset' });
        await Authentication.updateOne({ user: seeded.accounts.applicant._id }, { 'token.reset.token': value });
        const result = await app.inject({
            method: 'POST',
            url: '/auth/reset-password',
            payload: { token: value, password: newPassword, confirmPassword: newPassword },
        });
        expect(result.statusCode).toBe(200);
        expect((await login('applicant', newPassword)).statusCode).toBe(200);
        const replay = await app.inject({
            method: 'POST',
            url: '/auth/reset-password',
            payload: { token: value, password: fixturePassword, confirmPassword: fixturePassword },
        });
        expect(replay.statusCode).toBe(400);
    });
    it('returns a controlled error if the user disappears before the password write', async () => {
        await expect(
            new UserFactory().changePassword(new mongoose.Types.ObjectId(), newPassword, newPassword, fixturePassword),
        ).rejects.toMatchObject({ statusCode: 404 });
    });
    it('keeps activation-time password setup working without a current password', async () => {
        const value = token('inactive', { type: 'active' });
        await Authentication.updateOne(
            { user: seeded.accounts.inactive._id },
            {
                'token.activate.token': value,
                'token.activate.changePassword': true,
            },
        );
        Email.sendEmail.mockResolvedValueOnce(undefined);
        try {
            const result = await app.inject({
                method: 'POST',
                url: `/auth/activate-account?token=${value}`,
                payload: { password: newPassword, confirmPassword: newPassword },
            });
            expect(result.statusCode).toBe(200);
            expect((await login('inactive', newPassword)).statusCode).toBe(200);
            const authentication = await Authentication.findOne({ user: seeded.accounts.inactive._id });
            expect(authentication.token.activate.token).toBeUndefined();
            expect(authentication.token.activate.changePassword).toBe(false);
        } finally {
            await Authentication.updateOne({ user: seeded.accounts.inactive._id }, { active: false });
        }
    });
});
