import { hashPassword, verifyPassword } from './password-hasher';

describe('password hasher', () => {
  it('hashes passwords with a random salt and verifies them', async () => {
    const firstHash = await hashPassword('abc123');
    const secondHash = await hashPassword('abc123');

    expect(firstHash).toMatch(/^scrypt\$/);
    expect(secondHash).toMatch(/^scrypt\$/);
    expect(firstHash).not.toBe(secondHash);
    await expect(verifyPassword('abc123', firstHash)).resolves.toBe(true);
    await expect(verifyPassword('bad123', firstHash)).resolves.toBe(false);
  });
});
