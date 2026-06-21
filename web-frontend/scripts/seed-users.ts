import { Client } from 'pg';
import bcrypt from 'bcryptjs';

async function seed() {
  const dsn = process.env.AUTH_DB_DSN;
  if (!dsn) {
    console.error("AUTH_DB_DSN environment variable is not defined");
    process.exit(1);
  }

  const client = new Client({ connectionString: dsn });
  await client.connect();

  try {
    console.log("Seeding users...");

    // Password for all seed users: admin123
    const passwordHash = await bcrypt.hash("admin123", 12);

    const query = `
      INSERT INTO users (email, password_hash, role, license_num) VALUES
      ('admin@clinic.local', $1, 'admin', NULL),
      ('doctor@clinic.local', $1, 'doctor', 'MD-12345'),
      ('reviewer@clinic.local', $1, 'reviewer', NULL)
      ON CONFLICT (email) DO UPDATE SET
        password_hash = EXCLUDED.password_hash,
        role = EXCLUDED.role,
        license_num = EXCLUDED.license_num;
    `;

    await client.query(query, [passwordHash]);
    console.log("Users seeded successfully!");
  } catch (error) {
    console.error("Failed to seed users:", error);
  } finally {
    await client.end();
  }
}

seed();
