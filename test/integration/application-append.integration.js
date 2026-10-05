import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import Fastify from 'fastify';
import routes from '../../routes/jobs/index.js';
import EnterpriseFacade from '../../services/enterprise/enterpriseFacade.js';
import Applicant from '../../models/users/applicant.js';
import Employee from '../../models/users/employee.js';
import { Application, Job, Posting } from '../../models/enterprise/job/index.js';
import { fixtureDatabase, seedLoginAccounts } from '../fixtures/login-accounts.js';

vi.mock('dotenv', () => ({ default: { config: vi.fn() }, config: vi.fn() }));
vi.mock('../../util/Email.js', () => ({
    default: {
        sendEmail: vi.fn(() => {
            throw new Error('Email disabled in tests');
        }),
    },
}));

let app;
let mongod;
let seeded;
let postings;
beforeAll(async () => {
    vi.stubEnv('NODE_ENV', 'test');
    mongod = await MongoMemoryServer.create({ instance: { dbName: fixtureDatabase, ip: '127.0.0.1' } });
    await mongoose.connect(mongod.getUri(), { dbName: fixtureDatabase });
    seeded = await seedLoginAccounts();
    const job = await Job.create({
        title: 'Fixture Engineer',
        employmentType: 'full-time',
        company: seeded.companies[0]._id,
        environment: 'Office',
        industry: 'technical',
    });
    postings = await Posting.create(
        [1, 2, 3].map((number) => ({
            job: job._id,
            createdBy: seeded.accounts.hr._id,
            description: `Fixture posting ${number}`,
            qualification: 'Degree',
        })),
    );
    app = Fastify();
    await app.register(routes, { prefix: '/jobs' });
    await app.ready();
});
beforeEach(async () => {
    // These collections belong only to this process's disposable fixture database.
    await Application.deleteMany({});
    await Applicant.updateMany({}, { $set: { appliedJobs: [] } });
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

function apply(index) {
    return app.inject({
        method: 'POST',
        url: '/jobs/applications',
        payload: {
            postingId: String(postings[index]._id),
            applicantId: String(seeded.accounts.applicant._id),
        },
    });
}

describe('Applicant application-list persistence (not recruitment authorization acceptance)', () => {
    it('persists the returned application ID and resolves it through the Applicant reference', async () => {
        const response = await apply(0);
        expect(response.statusCode).toBe(201);
        const id = response.json().application._id;
        expect(response.json()).toEqual({ message: 'Success create application', application: { _id: id } });
        const applicant = await Applicant.findById(seeded.accounts.applicant._id);
        expect(applicant.appliedJobs.map(String)).toEqual([id]);
        expect(applicant.password).toBe(seeded.accounts.applicant.password);
        const application = await Application.findById(id);
        expect(String(application.applicant)).toBe(String(applicant._id));
        expect(String(application.posting)).toBe(String(postings[0]._id));
        const populated = await Applicant.findById(applicant._id).populate('appliedJobs');
        expect(String(populated.appliedJobs[0]._id)).toBe(id);
        expect((await Applicant.findById(seeded.accounts['other-applicant']._id)).appliedJobs).toHaveLength(0);
    });
    it('preserves prior applications and does not lose concurrent appends', async () => {
        const first = await apply(0);
        const later = await Promise.all([apply(1), apply(2)]);
        for (const response of [first, ...later]) expect(response.statusCode).toBe(201);
        const ids = [first, ...later].map((response) => response.json().application._id).sort();
        const applicant = await Applicant.findById(seeded.accounts.applicant._id);
        expect(applicant.appliedJobs.map(String).sort()).toEqual(ids);
        expect(await Application.countDocuments({ applicant: applicant._id })).toBe(3);
    });
    it('does not update an Employee through the Applicant-specific helper', async () => {
        const before = await Employee.findById(seeded.accounts.hr._id).lean();
        const result = await new EnterpriseFacade().findByIdAndUpdateApplicant(before._id, {
            $push: { appliedJobs: new mongoose.Types.ObjectId() },
        });
        expect(result).toBeNull();
        expect(await Employee.findById(before._id).lean()).toEqual(before);
    });
    it('does not upsert a missing Applicant', async () => {
        const id = new mongoose.Types.ObjectId();
        const result = await new EnterpriseFacade().findByIdAndUpdateApplicant(id, {
            $push: { appliedJobs: new mongoose.Types.ObjectId() },
        });
        expect(result).toBeNull();
        expect(await Applicant.findById(id)).toBeNull();
    });
});
