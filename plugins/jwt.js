import jwt from '@fastify/jwt';
import fp from 'fastify-plugin';

import { getJwtSecret } from '../util/Jwt.js';

export default fp(async (fastify) => {
    fastify.register(jwt, {
        secret: getJwtSecret(),
        verify: { algorithms: ['HS256'] },
        cookie: {
            cookieName: 'token',
            signed: false,
        },
        sign: {
            algorithm: 'HS256',
            expiresIn: '1d',
        },
    });
});
