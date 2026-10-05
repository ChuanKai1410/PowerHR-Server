# PowerHR
# PowerHR-Server
## Getting started

### Clone the Repository

To clone the repository, use the following command:

```sh
git clone https://github.com/UTMPowerHR/PowerHR-Server.git
cd powerhr-server
```

### Install Dependencies

To install the necessary dependencies, run:

```sh
npm install or npm i
```

### Environment Variables

Ensure you have a `.env` file in the root directory of your project with the necessary environment variables. Here is an example of what the `.env` file might look like:

```env
# Example .env file
DB_URL = your_mongodb_database_url
NODE_ENV = 'development'
JWT_SECRET = your_secret_key
EMAIL = your_email
EMAIL_PASSWORD = your_access_token
FRONTEND_URL = your_frontend_url
FIREBASE_API_KEY = your_firebase_api_key
FIREBASE_AUTH_DOMAIN = your_firebase_auth_domain
FIREBASE_PROJECT_ID = your_firebase_project_id
FIREBASE_STORAGE_BUCKET = your_firebase_storage_bucket
FIREBASE_MESSAGING_SENDER_ID = your_firebase_messaging_sender_id
FIREBASE_APP_ID = your_firebase_app_id
FIREBASE_MEASUREMENT_ID = your_firebase_measurement_id
```

### Run the Application in Development

To start the application in development mode, use:

```sh
npm run dev
```

Once the application in runnning, you can open your browser and navigate to
`http://localhost:3000` to access the application.

#### Swagger API Documentation
The project includes Swagger for API documentation. You can access it by navigating to
`http://localhost:3000/docs`.


## Shared Authentication Foundation

Set a strong, private `JWT_SECRET` before startup. There is no fallback secret.
Access tokens use HS256 and expire after one day. Send them as
`Authorization: Bearer <token>`; activation/reset tokens are not access tokens.

`GET /auth/me` requires an active, existing database user and returns
`{ user: { _id, firstName, lastName, email, role, company } }`.
Only these identity fields are returned; `company` is null when absent.
Invalid sessions return 401; authentication database failures return 503.
The role field preserves the existing display label and is not an authorization grant.

`POST /auth/register/sysadmin` now requires an active stored SysAdmin (otherwise
401/403). It is not a public bootstrap endpoint. Provision the first administrator
through a separately reviewed, trusted administrative process. Employee job titles,
company-admin roles and client/JWT role claims do not grant SysAdmin permission.

`POST /auth/change-password/:id` requires an active access-token identity matching
`:id`, including for SysAdmin callers. Its existing JSON body is
`{ oldPassword, newPassword, confirmPassword }`; the current password must be nonempty
and correct. Missing/invalid sessions return 401, another user's ID returns 403,
invalid input returns 400, and success remains `{ message: "Password changed" }`.
New passwords retain the existing strength checks and may not exceed 72 UTF-8 bytes.
The shared change/reset/activation password writer always hashes plaintext. Generic
profile updates reject password fields, Mongo update operators and dotted field names.
Password changes do not revoke existing access tokens; session revocation remains pending.

Other routes are not yet comprehensively protected. Public employee provisioning,
cross-company ownership, HR entitlements, logout/revocation and client session
lifecycle remain unfinished. Do not expose this foundation as a production-secure API.

## Foundation Tests

Run from the server repository with dependencies installed:

```powershell
node node_modules/vitest/vitest.mjs run --config test/contracts/vitest.config.js
node node_modules/vitest/vitest.mjs run --config test/integration/vitest.config.js
node --test test/contracts/app-auth.smoke.js
node test/fixtures/serve-login.js
```

Dedicated configs bypass the legacy MongoDB test setup. Integration tests use a
disposable local MongoDB with synthetic accounts and disabled email; its binary
must be cached or downloadable. They never seed Atlas and do not certify STD cases.
SysAdmin provisioning tests stub the actual write/email operation.
Password tests also use a disposable single-node replica set for legacy profile
transactions. Reset and activation checks stub email delivery; they do not certify
delivery or the complete browser/device recovery workflow. Application-list tests
exercise the real creation route and Applicant persistence, including concurrent
appends. The internal update uses the Applicant discriminator so `appliedJobs` is
not discarded by the base User schema. Existing missing links are not automatically
backfilled. Recruitment authorization, duplicate prevention and multi-document
rollback are not certified by these persistence tests.

The optional fixture server exposes only `POST /auth/login` on `127.0.0.1:3380`.
Set `POWERHR_FIXTURE_PORT` to use another unused port; stop with Ctrl+C to close
the server and its database. It generates a temporary secret, accepts no external
database URI, and refuses unsafe/repeated seeding. Synthetic accounts are
`applicant`, `other-applicant`, `hr`, `other-hr`, `sysadmin`, `company-admin`,
`inactive`, and `missing-auth`, each suffixed with `@example.invalid`.
Their deliberately public password, `PsmFixture-Only!42`, is for tests only.

Only README Markdown belongs in this repository. Project plans and execution
records are maintained in the parent workspace, outside Git repositories.

License
-------

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

* * *
