import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import authRoutes from '../../routes/auth/index.js';
import ApiError from '../../util/ApiError.js';
import Applicant from '../../models/users/applicant.js';
import Employee from '../../models/users/employee.js';
import SysAdmin from '../../models/users/sysadmin.js';
import jwtPlugin from '../../plugins/jwt.js';
import authPlugin from '../../plugins/auth.js';

vi.mock('dotenv', () => ({ default: { config: vi.fn() }, config: vi.fn() }));

const { login } = vi.hoisted(() => ({ login: vi.fn() }));

// Exercise the real route without database, email, JWT or external service calls.
vi.mock('../../services/auth/authController.js', () => ({
    default: class {
        login = login;
    },
}));

const credentials = { email: 'applicant@example.invalid', password: 'fixture-only-password' };
const userId = '000000000000000000000001';
const companyId = '000000000000000000000002';
let app;

beforeEach(async () => {
    login.mockReset();
    vi.stubEnv('JWT_SECRET', 'isolated-contract-test-secret');
    app = Fastify();
    await app.register(jwtPlugin);
    await app.register(authPlugin);
    await app.register(authRoutes, { prefix: '/auth' });
    await app.ready();
});

afterEach(async () => {
    await app.close();
    vi.unstubAllEnvs();
});

describe('Existing login HTTP contract (controller stubbed, not authentication acceptance)', () => {
    it.each(['Applicant', 'HR', 'SysAdmin', 'Admin'])(
        'preserves the %s response without role remapping',
        async (role) => {
            const user = { _id: userId, role, email: credentials.email };
            login.mockResolvedValue({ user, token: 'fixture-token-not-a-jwt' });
            const response = await app.inject({ method: 'POST', url: '/auth/login', payload: credentials });

            expect(response.statusCode).toBe(200);
            expect(response.headers['content-type']).toContain('application/json');
            expect(response.json()).toEqual({ user, token: 'fixture-token-not-a-jwt' });
            expect(login).toHaveBeenCalledTimes(1);
            expect(login).toHaveBeenCalledWith(credentials.email, credentials.password);
        },
    );

    it.each(['email', 'password'])('rejects missing %s before the controller', async (field) => {
        const payload = { ...credentials };
        delete payload[field];
        const response = await app.inject({ method: 'POST', url: '/auth/login', payload });

        expect(response.statusCode).toBe(400);
        expect(response.json()).toMatchObject({ statusCode: 400, error: 'Bad Request' });
        expect(response.json().message).toContain(field);
        expect(login).not.toHaveBeenCalled();
    });

    it.each(['Invalid email or password', 'Account not activated'])(
        'preserves the existing 401 error: %s',
        async (message) => {
            login.mockRejectedValue(new ApiError(401, message));
            const response = await app.inject({ method: 'POST', url: '/auth/login', payload: credentials });

            expect(response.statusCode).toBe(401);
            expect(response.json()).toEqual({ error: message });
        },
    );

    it('uses the existing fallback for an unexpected error without a message', async () => {
        login.mockRejectedValue(new Error());
        const response = await app.inject({ method: 'POST', url: '/auth/login', payload: credentials });

        expect(response.statusCode).toBe(500);
        expect(response.json()).toEqual({ error: 'Something went wrong' });
    });

    it('does not expose internal exception details', async () => {
        login.mockRejectedValue(new Error('Private database connection details'));
        const response = await app.inject({ method: 'POST', url: '/auth/login', payload: credentials });
        expect(response.statusCode).toBe(500);
        expect(response.json()).toEqual({ error: 'Something went wrong' });
    });

    it.each(['email', 'password'])('rejects empty %s before the controller', async (field) => {
        const response = await app.inject({
            method: 'POST',
            url: '/auth/login',
            payload: { ...credentials, [field]: '' },
        });
        expect(response.statusCode).toBe(400);
        expect(login).not.toHaveBeenCalled();
    });

    it('rejects malformed JSON before the controller', async () => {
        const response = await app.inject({
            method: 'POST',
            url: '/auth/login',
            headers: { 'content-type': 'application/json' },
            payload: '{',
        });
        expect(response.statusCode).toBe(400);
        expect(login).not.toHaveBeenCalled();
    });

    it('rejects a missing body before the controller', async () => {
        const response = await app.inject({ method: 'POST', url: '/auth/login' });
        expect(response.statusCode).toBe(400);
        expect(login).not.toHaveBeenCalled();
    });

    it('rejects unsupported content types before the controller', async () => {
        const response = await app.inject({
            method: 'POST',
            url: '/auth/login',
            headers: { 'content-type': 'application/xml' },
            payload: '<login/>',
        });
        expect(response.statusCode).toBe(415);
        expect(login).not.toHaveBeenCalled();
    });

    it('passes only credentials to the controller, not a client-supplied role or company', async () => {
        login.mockResolvedValue({ user: { _id: userId, role: 'Applicant' }, token: 'fixture-token-not-a-jwt' });
        const response = await app.inject({
            method: 'POST',
            url: '/auth/login',
            payload: { ...credentials, role: 'SysAdmin', company: companyId },
        });
        expect(response.statusCode).toBe(200);
        expect(login).toHaveBeenCalledTimes(1);
        expect(login).toHaveBeenCalledWith(credentials.email, credentials.password);
        expect(response.json().user.role).toBe('Applicant');
    });
});

describe('Existing user response projection (unsaved model instances)', () => {
    it.each([
        ['Applicant', Applicant, {}, 'Applicant'],
        ['SysAdmin', SysAdmin, {}, 'SysAdmin'],
        ['HR employee', Employee, { jobTitle: 'HR', company: companyId }, 'HR'],
        ['company administrator', Employee, { jobTitle: 'Admin', company: companyId }, 'Admin'],
    ])('omits password and preserves the %s role', (_label, Model, extra, role) => {
        const user = new Model({ _id: userId, ...credentials, ...extra });
        const result = user.getMe();
        expect(result.role).toBe(role);
        expect(String(result._id)).toBe(userId);
        expect(result).not.toHaveProperty('password');
        expect(result).not.toHaveProperty('__t');
    });
});
