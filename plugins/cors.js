import cors from '@fastify/cors';
import fp from 'fastify-plugin';

export default fp(async (fastify) => {
    fastify.register(cors, {
        origin: ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://192.168.56.1:5173', 'https://power-hr.vercel.app', 'https://power-hr-development.vercel.app'],
        credentials: true,
    });
});
