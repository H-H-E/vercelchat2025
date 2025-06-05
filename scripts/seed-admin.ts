import postgres from 'postgres';
import { hash } from 'bcrypt-ts';
import { randomUUID } from 'crypto';
import * as dotenv from 'dotenv';

// Load environment variables from .env file if it exists
// If POSTGRES_URL is already set in the environment, this will not override it unless .env contains it.
dotenv.config();

const ADMIN_EMAIL = 'admin@poiesis.ai';
// WARNING: Storing default passwords in code is insecure for production systems.
// This should be an environment variable for the script in a real scenario.
const ADMIN_PASSWORD = 'AdminPass123!';
const POSTGRES_URL = process.env.POSTGRES_URL;

async function seedAdmin() {
  if (!POSTGRES_URL) {
    console.error('Error: POSTGRES_URL environment variable is not set.');
    process.exit(1);
  }

  const sql = postgres(POSTGRES_URL);

  try {
    console.log(`Checking if admin user ${ADMIN_EMAIL} exists...`);
    // Note: Table name "User" is case-sensitive in PostgreSQL if created with quotes,
    // or typically lowercased if not. Drizzle by default uses quoted identifiers.
    const existingUsers = await sql`SELECT id FROM "User" WHERE email = ${ADMIN_EMAIL}`;

    if (existingUsers.length > 0) {
      console.log(`Admin user with email ${ADMIN_EMAIL} already exists (ID: ${existingUsers[0].id}).`);
      return;
    }

    console.log(`Admin user ${ADMIN_EMAIL} not found, creating...`);
    // Hash password
    const hashedPassword = await hash(ADMIN_PASSWORD);
    const adminId = randomUUID();

    // Insert user
    await sql`INSERT INTO "User" (id, email, password) VALUES (${adminId}, ${ADMIN_EMAIL}, ${hashedPassword})`;

    console.log(`Admin user ${ADMIN_EMAIL} created successfully with ID ${adminId}.`);

  } catch (error) {
    console.error('Error seeding admin user:', error);
  } finally {
    await sql.end();
    console.log('Database connection closed.');
  }
}

seedAdmin();
