import Applicant from '../models/users/applicant.js';

const FIELDS = new Set(['firstName', 'lastName', 'gender']);
const GENDERS = new Set(['Male', 'Female', 'Prefer not to say']);

function publicProfile(user) {
  return {
    userId: String(user._id),
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    gender: user.gender,
    profilePicture: user.profilePicture || null,
  };
}

export async function applicantProfileGuard(request, reply) {
  if (request.principal?.__t !== 'Applicant') {
    return reply.code(403).send({ error: 'Applicant account required' });
  }
}

export async function getApplicantProfile(request, reply) {
  const user = await Applicant.findById(request.principal._id)
    .select('firstName lastName email gender profilePicture').lean();
  if (!user) return reply.code(404).send({ error: 'Applicant not found' });
  return reply.send({ profile: publicProfile(user) });
}

export async function updateApplicantProfile(request, reply) {
  const body = request.body;
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).length === 0 ||
      Object.keys(body).some(k => !FIELDS.has(k))) {
    return reply.code(400).send({ error: 'Invalid profile fields' });
  }
  const update = {};
  for (const field of ['firstName', 'lastName']) {
    if (Object.hasOwn(body, field)) {
      if (typeof body[field] !== 'string' || !body[field].trim() || body[field].trim().length > 100) {
        return reply.code(400).send({ error: `Invalid ${field}` });
      }
      update[field] = body[field].trim().toUpperCase();
    }
  }
  if (Object.hasOwn(body, 'gender')) {
    if (!GENDERS.has(body.gender)) {
      return reply.code(400).send({ error: 'Invalid gender' });
    }
    update.gender = body.gender;
  }
  const user = await Applicant.findByIdAndUpdate(request.principal._id,
    { $set: update }, { new: true, runValidators: true })
    .select('firstName lastName email gender profilePicture').lean();
  if (!user) return reply.code(404).send({ error: 'Applicant not found' });
  return reply.send({ profile: publicProfile(user) });
}
