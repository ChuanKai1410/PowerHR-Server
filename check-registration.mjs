
import 'dotenv/config';
import mongoose from 'mongoose';

import User from './models/users/user.js';
import Authentication from './models/auth/authentication.js';

const email = process.argv[2]?.trim().toLowerCase();

if (!email) {
  console.error('Usage: node check-registration.mjs <email>');
  process.exit(1);
}

try {
  await mongoose.connect(process.env.DB_URL, {
    serverSelectionTimeoutMS: 8000,
  });

  console.log('Database:', mongoose.connection.name);
  console.log('Users collection:', User.collection.name);
  console.log('Authentication collection:', Authentication.collection.name);

  const user = await User.findOne({ email })
    .select('_id email __t')
    .lean();

  console.log('User found:', Boolean(user));

  if (user) {
    console.log('Account type:', user.__t);

    const auth = await Authentication.findOne({
      user: user._id,
    })
      .select('active token.activate.token')
      .lean();

    console.log('Authentication found:', Boolean(auth));
    console.log('Activated:', auth?.active ?? false);
    console.log(
      'Activation token exists:',
      Boolean(auth?.token?.activate?.token),
    );
  }
} catch (error) {
  console.error('Diagnostic failed:', error.message);
} finally {
  await mongoose.disconnect();
}
