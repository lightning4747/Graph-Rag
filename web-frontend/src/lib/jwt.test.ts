import { describe, it, expect, beforeAll } from 'vitest';

describe('JWT Utility tests', () => {
  let issueJwt: any;
  let decodeJwt: any;

  beforeAll(async () => {
    process.env.JWT_SHARED_SECRET = 'test_jwt_shared_secret_secure_key_12345_67890';
    const jwtModule = await import('./jwt');
    issueJwt = jwtModule.issueJwt;
    decodeJwt = jwtModule.decodeJwt;
  });

  it('should successfully round-trip a valid user payload', async () => {
    const dummyUser = {
      user_id: 'test-user-id-uuid-12345',
      role: 'doctor' as const,
      license_num: 'LIC-987654'
    };

    const token = await issueJwt(dummyUser);
    const decoded = await decodeJwt(token);

    expect(decoded.user_id).toBe(dummyUser.user_id);
    expect(decoded.role).toBe(dummyUser.role);
    expect(decoded.license_num).toBe(dummyUser.license_num);
  });

  it('should throw an error when decoding an invalid or malformed token', async () => {
    await expect(decodeJwt('invalid-token-string')).rejects.toThrow();
  });
});
