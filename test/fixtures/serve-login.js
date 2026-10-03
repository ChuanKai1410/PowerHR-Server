import { randomBytes } from 'node:crypto';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import Fastify from 'fastify';
import { fixtureDatabase, seedLoginAccounts } from './login-accounts.js';

// This process owns its database and accepts no external database URI.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = randomBytes(32).toString('hex');
const port = Number(process.env.POWERHR_FIXTURE_PORT || 3380);
let mongod;
let app;
let stopping;
async function stop() {
    if (stopping) return stopping;
    stopping = (async () => {
        try {
            if (app) await app.close();
        } finally {
            try {
                await mongoose.disconnect();
            } finally {
                if (mongod) await mongod.stop();
            }
        }
    })();
    return stopping;
}
process.once('SIGINT', () => {
    stop().catch(() => {
        process.exitCode = 1;
    });
});
process.once('SIGTERM', () => {
    stop().catch(() => {
        process.exitCode = 1;
    });
});
try {
    mongod = await MongoMemoryServer.create({ instance: { dbName: fixtureDatabase, ip: '127.0.0.1' } });
    await mongoose.connect(mongod.getUri(), { dbName: fixtureDatabase });
    await seedLoginAccounts();
    const { default: routes } = await import('../../routes/auth/index.js');
    app = Fastify();
    app.addHook('onRequest', async (request, reply) => {
        if (request.method !== 'POST' || request.url !== '/auth/login') {
            return reply.code(404).send({ error: 'Fixture server supports login only' });
        }
    });
    await app.register(routes, { prefix: '/auth' });
    await app.listen({ host: '127.0.0.1', port });
    console.log(`Disposable login fixture ready at http://127.0.0.1:${port}`);
} catch (error) {
    await stop();
    console.error(error.message);
    process.exitCode = 1;
}
