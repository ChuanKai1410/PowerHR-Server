import Company from '../models/enterprise/company/company.js';
import Department from '../models/enterprise/company/department.js';

function employeeOnly(request, reply) {
  if (request.principal?.__t !== 'Employee' || !request.principal.company) {
    reply.code(403).send({ error: 'Employee company account required' });
    return false;
  }
  return true;
}

function capabilities(principal) {
  // Use the freshly loaded database principal, never request/JWT job-title claims.
  const canReadDepartments = principal.jobTitle === 'HR' || principal.jobTitle === 'Admin';
  return {
    canReadDepartments,
    canManageHiring: principal.jobTitle === 'HR',
    canManageCompany: principal.jobTitle === 'Admin',
  };
}

export async function employeeCompanyOverview(request, reply) {
  if (!employeeOnly(request, reply)) return;
  const company = await Company.findById(request.principal.company)
    .select('_id name description website sector address.city address.state address.country').lean();
  if (!company) return reply.code(404).send({ error: 'Company not found' });
  return reply.send({
    company: {
      id: String(company._id),
      name: company.name,
      description: company.description ?? '',
      website: company.website ?? '',
      sector: company.sector ?? '',
      city: company.address?.city ?? '',
      state: company.address?.state ?? '',
      country: company.address?.country ?? '',
    },
    capabilities: capabilities(request.principal),
  });
}

export async function employeeCompanyDepartments(request, reply) {
  if (!employeeOnly(request, reply)) return;
  if (!capabilities(request.principal).canReadDepartments) {
    return reply.code(403).send({ error: 'Department access denied' });
  }
  const departments = await Department.find({ company: request.principal.company })
    .select('_id name').sort({ name: 1, _id: 1 }).limit(100).lean();
  return reply.send({
    items: departments.map(dept => ({ id: String(dept._id), name: dept.name ?? '' })),
  });
}
