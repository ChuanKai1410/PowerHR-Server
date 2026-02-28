import path from 'path';
import AutoLoad from '@fastify/autoload';
import fastifyStatic from '@fastify/static';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import Ajv from 'ajv';

dotenv.config();
const ENV = process.env.NODE_ENV;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Pass --options via CLI arguments in command to enable these options.
export const options = {};

export default async function (fastify, opts) {
    // Place here your custom code!

    const ajv = new Ajv({
        useDefaults: true,
        coerceTypes: true,
        $data: true,
        extendRefs: true,
    });

    ajv.addKeyword('isFile', {
        compile: (schema, parent) => {
            parent.type = 'file';
            delete parent.isFileType;
            return () => true;
        },
    });

    fastify.setValidatorCompiler(function (schemaDefinition) {
        const { schema } = schemaDefinition;
        return ajv.compile(schema);
    });

    if (ENV !== 'test') {
        //const { default: Firebase } = await import('./util/Firebase.js');
        //await Firebase.getInstance();

        const DB_URL = process.env.DB_URL;
        await mongoose
            .connect(DB_URL)
            .then(() => {
                console.log('Connected to MongoDB');
            })
            .catch((err) => {
                console.log('Failed to connect to MongoDB');
                console.error(err);
                throw err;
            });
    }

    // Do not touch the following lines

    // Serve uploaded files (ticket attachments) as static assets at /uploads/...
    fastify.register(fastifyStatic, {
        root: path.join(__dirname, 'public'),
        prefix: '/public/',
        decorateReply: false,
    });

    // This loads all plugins defined in plugins
    // those should be support plugins that are reused
    // through your application

    fastify.register(AutoLoad, {
        dir: path.join(__dirname, 'plugins'),
        options: Object.assign({}, opts),
    });

    // Routes that must NOT block on expired/missing JWT
    const PUBLIC_PATHS = [
        '/company/register',
        '/company/check',
        '/auth/login',
        '/auth/register',
        '/auth/forgot-password',
        '/auth/activate',
        '/auth/reset-password',
        '/job',          // public job listings
    ];

    //Read bearer token from request header
    fastify.addHook('preHandler', async (request, reply) => {
        const isPublic = PUBLIC_PATHS.some((path) => request.url.startsWith(path));
        try {
            const { authorization } = request.headers;

            if (authorization) {
                // request.jwtVerify() reads the Bearer token from the
                // Authorization header automatically — do NOT pass the token string manually
                const data = await request.jwtVerify();
                request.user = data;
            }
        } catch (error) {
            if (isPublic) {
                // Don't block public routes — the frontend sends stale tokens here too
                return;
            }
            request.log.error(error);
            reply.status(401).send({ error: 'Unauthorized' });
        }
    });

    // This loads all plugins defined in routes
    // define your routes in one of these
    fastify.register(AutoLoad, {
        dir: path.join(__dirname, 'routes'),
        options: Object.assign({}, opts),
    });
}
