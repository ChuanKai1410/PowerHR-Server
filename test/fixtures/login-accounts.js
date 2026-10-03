import mongoose from 'mongoose';
import Applicant from '../../models/users/applicant.js';
import Employee from '../../models/users/employee.js';
import SysAdmin from '../../models/users/sysadmin.js';
import User from '../../models/users/user.js';
import Company from '../../models/enterprise/company/company.js';
import Authentication from '../../models/auth/authentication.js';

export const fixtureDatabase = 'powerhr_psm_test';
// Deliberately public test-only credentials. Never seed these into a shared database.
export const fixturePassword = 'PsmFixture-Only!42';

export async function seedLoginAccounts() {
    const connection = mongoose.connection;
    if (
        process.env.NODE_ENV !== 'test' ||
        connection.readyState !== 1 ||
        connection.name !== fixtureDatabase ||
        !['127.0.0.1', 'localhost', '::1'].includes(connection.host)
    ) {
        throw new Error('Login fixtures require the dedicated local test database.');
    }
    if ((await User.exists({})) || (await Company.exists({})) || (await Authentication.exists({}))) {
        throw new Error('Refusing to seed a nonempty test database.');
    }
    const companies = await Company.create([
        { name: 'Fixture Company A', email: 'company-a@example.invalid' },
        { name: 'Fixture Company B', email: 'company-b@example.invalid' },
    ]);
    const accounts = {};
    for (const [name, Model, extra, active] of [
        ['applicant', Applicant, {}, true],
        ['other-applicant', Applicant, {}, true],
        ['hr', Employee, { company: companies[0]._id, jobTitle: 'HR', salary: 1000 }, true],
        ['other-hr', Employee, { company: companies[1]._id, jobTitle: 'HR', salary: 1000 }, true],
        ['sysadmin', SysAdmin, {}, true],
        ['company-admin', Employee, { company: companies[0]._id, jobTitle: 'Admin', salary: 1000 }, true],
        ['inactive', Applicant, {}, false],
        ['missing-auth', Applicant, {}, null],
    ]) {
        const email = `${name}@example.invalid`;
        const user = await Model.create({
            firstName: 'Fixture',
            lastName: name,
            gender: 'Prefer not to say',
            email,
            personalEmail: email,
            password: fixturePassword,
            ...extra,
        });
        if (active !== null) await Authentication.create({ user: user._id, active });
        accounts[name] = user;
    }
    return { accounts, companies };
}
