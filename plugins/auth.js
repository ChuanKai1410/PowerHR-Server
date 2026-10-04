import auth from '@fastify/auth';
import fp from 'fastify-plugin';
import User from '../models/users/user.js';
import Authentication from '../models/auth/authentication.js';

export default fp(async (fastify) => {
    fastify.decorateRequest('principal', null);

    fastify.decorate('verifyAccessToken', async function (request, reply) {
        if (!/^Bearer [^\s]+$/i.test(request.headers.authorization || '')) {
            return reply.code(401).send({ error: 'Unauthorized' });
        }
        try {
            const claims = await request.jwtVerify();
            if (
                claims.type !== 'access' ||
                typeof claims.id !== 'string' ||
                !/^[a-f\d]{24}$/i.test(claims.id) ||
                !Number.isFinite(claims.exp)
            ) {
                return reply.code(401).send({ error: 'Unauthorized' });
            }
        } catch {
            return reply.code(401).send({ error: 'Unauthorized' });
        }
    });

    fastify.decorate('requireUser', async function (request, reply) {
        await fastify.verifyAccessToken(request, reply);
        if (reply.sent) return;
        try {
            const user = await User.findById(request.user.id)
                .select('_id firstName lastName email __t jobTitle company terminationDate')
                .lean();
            const active = user && (await Authentication.exists({ user: user._id, active: true }));
            if (!active || (user.terminationDate && new Date(user.terminationDate) <= new Date())) {
                return reply.code(401).send({ error: 'Unauthorized' });
            }
            request.principal = user;
        } catch (error) {
            request.log.error(error);
            return reply.code(503).send({ error: 'Authentication unavailable' });
        }
    });

    fastify.decorate('requireSysAdmin', async function (request, reply) {
        await fastify.requireUser(request, reply);
        if (reply.sent) return;
        // Employee job titles and JWT role claims are not authorization grants.
        if (request.principal.__t !== 'SysAdmin') {
            return reply.code(403).send({ error: 'Forbidden' });
        }
    });

    fastify.decorate('verifyToken', async function (request, reply) {
        const { token } = request.cookies;

        if (!token) {
            return reply.code(401).send({ error: 'No token provided' });
        }

        try {
            await request.jwtVerify({ onlyCookie: true });
        } catch (err) {
            return reply.code(401).send({ error: 'Expired token' });
        }
    });

    fastify.register(auth);
});
