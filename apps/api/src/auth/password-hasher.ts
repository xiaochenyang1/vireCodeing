import { randomBytes, scrypt, timingSafeEqual } from 'crypto';

const keyLength = 64;
const scryptParams = {
  N: 16384,
  r: 8,
  p: 1,
  maxmem: 64 * 1024 * 1024,
};

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, keyLength, scryptParams);

  return [
    'scrypt',
    String(scryptParams.N),
    String(scryptParams.r),
    String(scryptParams.p),
    salt.toString('base64url'),
    key.toString('base64url'),
  ].join('$');
}

export async function verifyPassword(
  password: string,
  passwordHash: string,
): Promise<boolean> {
  const [algorithm, cost, blockSize, parallelization, salt, storedKey] =
    passwordHash.split('$');

  if (
    algorithm !== 'scrypt' ||
    !cost ||
    !blockSize ||
    !parallelization ||
    !salt ||
    !storedKey
  ) {
    return false;
  }

  const key = await scryptAsync(
    password,
    Buffer.from(salt, 'base64url'),
    Buffer.from(storedKey, 'base64url').length,
    {
      N: Number(cost),
      r: Number(blockSize),
      p: Number(parallelization),
      maxmem: 64 * 1024 * 1024,
    },
  );
  const storedKeyBuffer = Buffer.from(storedKey, 'base64url');

  return (
    key.length === storedKeyBuffer.length && timingSafeEqual(key, storedKeyBuffer)
  );
}

function scryptAsync(
  password: string,
  salt: Buffer,
  keylen: number,
  options: typeof scryptParams,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, options, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(derivedKey);
    });
  });
}
