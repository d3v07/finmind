import { describe, expect, test } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { appRouter } from './trpc.js';
import { createAppServices } from './services/index.js';

describe('trpc router', () => {
  test('register + login + session flow', async () => {
    process.env.FINMIND_DATA_FILE = `/tmp/finmind-test-${randomUUID()}.json`;
    process.env.FINMIND_AGENT_MODE = 'mock';

    const services = createAppServices();

    const publicCaller = appRouter.createCaller({
      requestId: randomUUID(),
      userId: null,
      services
    });

    const registerResult = await publicCaller.auth.register({
      email: 'user@example.com',
      name: 'User One',
      password: 'strongpass123'
    });

    expect(registerResult.token.length).toBeGreaterThan(20);
    expect(registerResult.user.email).toBe('user@example.com');

    const authedCaller = appRouter.createCaller({
      requestId: randomUUID(),
      userId: registerResult.user.id,
      services
    });

    const session = await authedCaller.research.createSession({
      title: 'AAPL Deep Dive'
    });

    expect(session.title).toBe('AAPL Deep Dive');

    const sessions = await authedCaller.research.getSessions();
    expect(sessions.length).toBeGreaterThan(0);

    const query = await authedCaller.research.executeQuery({
      sessionId: session.id,
      query: 'What should I check for AAPL in next earnings?'
    });

    expect(query.status).toBe('completed');
    expect(query.response).toContain('FinMind Research Response');

    const queries = await authedCaller.research.getQueries({ sessionId: session.id });
    expect(queries).toHaveLength(1);

    const login = await publicCaller.auth.login({
      email: 'user@example.com',
      password: 'strongpass123'
    });

    expect(login.user.id).toBe(registerResult.user.id);
  });
});
