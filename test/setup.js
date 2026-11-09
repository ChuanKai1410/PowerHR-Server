import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import fastify from 'fastify';
import { afterAll, beforeAll, afterEach } from 'vitest';

dotenv.config({ path: './test/.env.test' });

const app = fastify();
// Register the routes from your Fastify application
app.register(import('../app.js'));

let mongod;

//Set up database connection before tests
beforeAll(async () => {
    console.log('[TEST] Starting MongoMemoryServer...');

    mongod = new MongoMemoryServer();
    await mongod.start();

    console.log('[TEST] MongoMemoryServer started');

    await mongoose.connect(mongod.getUri());

    console.log('[TEST] Mongoose connected');

    await app.ready();

    console.log('[TEST] Fastify ready');
}, 120000);

afterEach(async () => {
    await mongoose.connection.db.dropDatabase();
});

// Clean up database after tests
afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
    await mongod.stop();
    await app.close();
});

export default app;
