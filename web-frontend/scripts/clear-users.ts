import { Client } from 'pg';

async function clear() {
  const dsn = process.env.AUTH_DB_DSN;
  if (!dsn) {
    console.error("AUTH_DB_DSN environment variable is not defined");
    process.exit(1);
  }

  const client = new Client({ connectionString: dsn });
  await client.connect();

  try {
    console.log("Clearing database tables...");
    
    // Truncate quarantine_extractions and users tables
    await client.query("TRUNCATE TABLE quarantine_extractions RESTART IDENTITY CASCADE;");
    await client.query("TRUNCATE TABLE users RESTART IDENTITY CASCADE;");
    
    console.log("Database cleared successfully!");
  } catch (error) {
    console.error("Failed to clear database:", error);
  } finally {
    await client.end();
  }
}

clear();
