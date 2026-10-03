# PSM Foundation Tests

Day 4/5 work executed on 3 October 2026, preparing the Week 2 shared API and JWT work.
Requirements: PSM1 physical PDF 24 and 244-245 (shared JWT, REST/JSON, three roles).

## Commands

Run from this repository with installed dependencies:

```powershell
node node_modules/vitest/vitest.mjs run --config test/contracts/vitest.config.js
node node_modules/vitest/vitest.mjs run --config test/integration/vitest.config.js
node test/fixtures/serve-login.js
```

The dedicated configurations bypass the legacy MongoDB global setup and model-autoload
conflict. Contract tests stub the controller. Integration tests use real Mongoose models,
bcrypt, auth controller, JWT signer and route serialization against a disposable local
MongoDB. The MongoDB binary must be cached or downloadable by mongodb-memory-server.
No production packages or test framework upgrades are required.

## Fixture Accounts

The fixture process creates two synthetic companies and eight synthetic accounts:
`applicant`, `other-applicant`, `hr`, `other-hr`, `sysadmin`, `company-admin`, `inactive`,
and `missing-auth`, all with the suffix `@example.invalid`. Their deliberately public,
test-only password is `PsmFixture-Only!42`. It must never be used in real environments.
Password hashing uses the existing model hook. No email or registration workflow is called.

`serve-login.js` binds only to `127.0.0.1:3380`; set `POWERHR_FIXTURE_PORT` for another
unused port. It generates a fresh test JWT secret, owns its temporary database and
accepts no external database URI. Only POST `/auth/login` is accessible. Stop with Ctrl+C;
the HTTP server, Mongoose connection and temporary MongoDB close together. Accounts are
discarded, not provisioned into Atlas. The seed helper also refuses a nonempty database,
the wrong database name, a nonlocal host, or a non-test environment.

Use the fixture server for the Mobile command in its README. These fixtures are testing
infrastructure, not an alternative deployment database. Production persistence remains MongoDB Atlas.

## Narrow Behavior Changes

Login normalizes email whitespace/case, rejects empty credentials, returns 401 for a
missing authentication record, checks the password before employee conversion, and
returns a generic 500 error instead of exception details. The successful `{ user, token }`
shape is unchanged. Existing company `Admin` is not renamed to `SysAdmin`.

## Limits

The integration harness registers auth routes directly, not all production plugins/hooks.
Passing login tests does not establish route authorization, token-purpose enforcement,
revocation, logout, cross-company restrictions, production availability, or any STD case.
Privileged registration and other Day 3 security gaps still need P03 remediation before
public deployment. The HR fixture's jobTitle is a legacy response label, not an approved
HR authorization source. Tests must not be used to infer that all employees named HR
should receive privileged access.
