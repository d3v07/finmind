import { compare, hash } from 'bcryptjs';
import type { LoginInput, RegisterInput, UserRole, User } from '@finmind/shared';
import { AppError } from '../errors.js';
import type { Repository } from '../repositories/types.js';
import { signAccessToken } from './jwt.js';

type AuthResponse = {
  token: string;
  user: User;
};

export class AuthService {
  constructor(private readonly repository: Repository) {}

  async register(input: RegisterInput): Promise<AuthResponse> {
    const existing = this.repository.findUserByEmail(input.email);
    if (existing) {
      throw new AppError('Account already exists for this email', 409, 'EMAIL_EXISTS');
    }

    const passwordHash = await hash(input.password, 10);
    const role = this.resolveRoleForEmail(input.email);
    const created = this.repository.createUser({
      email: input.email,
      name: input.name,
      role,
      passwordHash
    });

    const token = await signAccessToken(created.id);

    return {
      token,
      user: this.sanitizeUser(created)
    };
  }

  async login(input: LoginInput): Promise<AuthResponse> {
    const existing = this.repository.findUserByEmail(input.email);
    if (!existing) {
      throw new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
    }

    const passwordMatches = await compare(input.password, existing.passwordHash);
    if (!passwordMatches) {
      throw new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
    }

    // Allow promoting a known admin email without requiring an existing admin session.
    const normalizedEmail = input.email.trim().toLowerCase();
    const configuredAdmins = new Set(
      (process.env.FINMIND_ADMIN_EMAILS ?? '')
        .split(',')
        .map((item) => item.trim().toLowerCase())
        .filter((item) => item.length > 0)
    );
    const shouldBeAdmin = configuredAdmins.has(normalizedEmail);
    const hydratedUser = shouldBeAdmin && existing.role !== 'admin'
      ? (this.repository.updateUserRole(existing.id, 'admin') ?? existing)
      : existing;

    const token = await signAccessToken(existing.id);

    return {
      token,
      user: this.sanitizeUser(hydratedUser)
    };
  }

  getMe(userId: string): User {
    const user = this.repository.findUserById(userId);
    if (!user) {
      throw new AppError('User not found', 404, 'USER_NOT_FOUND');
    }

    return this.sanitizeUser(user);
  }

  private sanitizeUser(user: { id: string; email: string; name: string; createdAt: string }): User {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: (user as { role?: UserRole }).role ?? 'user',
      createdAt: user.createdAt
    };
  }

  private resolveRoleForEmail(email: string): UserRole {
    const normalized = email.trim().toLowerCase();
    const configuredAdmins = new Set(
      (process.env.FINMIND_ADMIN_EMAILS ?? '')
        .split(',')
        .map((item) => item.trim().toLowerCase())
        .filter((item) => item.length > 0)
    );
    if (configuredAdmins.has(normalized)) {
      return 'admin';
    }

    // Bootstrap: first account becomes admin if no admin is present yet.
    const existing = this.repository.listUsers();
    const hasAdmin = existing.some((user) => user.role === 'admin');
    return hasAdmin ? 'user' : 'admin';
  }
}
