import { jwtVerify, SignJWT } from 'jose';
import { AppError } from '../errors.js';

const encoder = new TextEncoder();

function getJwtSecret(): Uint8Array {
  const secretFromEnv = process.env.JWT_SECRET;
  const secret =
    secretFromEnv && secretFromEnv.trim().length > 0
      ? secretFromEnv
      : 'finmind-dev-secret-change-this';
  return encoder.encode(secret);
}

export async function signAccessToken(userId: string): Promise<string> {
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(getJwtSecret());
}

export async function verifyAccessToken(token: string): Promise<string> {
  try {
    const verified = await jwtVerify(token, getJwtSecret());
    const subject = verified.payload.sub;

    if (!subject) {
      throw new AppError('Invalid auth token payload', 401, 'INVALID_TOKEN');
    }

    return subject;
  } catch {
    throw new AppError('Invalid or expired auth token', 401, 'UNAUTHORIZED');
  }
}

export function getBearerToken(authorizationHeader: string | undefined): string | null {
  if (!authorizationHeader) {
    return null;
  }

  const [scheme, token] = authorizationHeader.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return null;
  }

  return token;
}
