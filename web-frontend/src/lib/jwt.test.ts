import { issueJwt, decodeJwt } from './jwt';

async function runTest() {
  console.log("Running JWT round-trip unit test...");
  
  const dummyUser = {
    user_id: 'test-user-id-uuid-12345',
    role: 'doctor' as const,
    license_num: 'LIC-987654'
  };

  try {
    const token = await issueJwt(dummyUser);
    const decoded = await decodeJwt(token);

    if (decoded.user_id !== dummyUser.user_id) {
      throw new Error(`User ID mismatch: expected ${dummyUser.user_id}, got ${decoded.user_id}`);
    }
    if (decoded.role !== dummyUser.role) {
      throw new Error(`Role mismatch: expected ${dummyUser.role}, got ${decoded.role}`);
    }
    if (decoded.license_num !== dummyUser.license_num) {
      throw new Error(`License number mismatch: expected ${dummyUser.license_num}, got ${decoded.license_num}`);
    }

    console.log("JWT round-trip test PASSED!");
    process.exit(0);
  } catch (error) {
    console.error("JWT round-trip test FAILED:", error);
    process.exit(1);
  }
}

runTest();
