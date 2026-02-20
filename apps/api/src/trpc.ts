import { TRPCError, initTRPC } from '@trpc/server';
import {
  createSessionInputSchema,
  executeQueryInputSchema,
  loginInputSchema,
  registerInputSchema
} from '@finmind/shared';
import type { AppServices } from './services/index.js';

export type AppContext = {
  requestId: string;
  userId: string | null;
  services: AppServices;
};

const t = initTRPC.context<AppContext>().create();

const requireAuth = t.middleware(({ ctx, next }) => {
  if (!ctx.userId) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'Authentication required'
    });
  }

  return next({
    ctx: {
      ...ctx,
      userId: ctx.userId
    }
  });
});

const publicProcedure = t.procedure;
const protectedProcedure = t.procedure.use(requireAuth);

const authRouter = t.router({
  register: publicProcedure.input(registerInputSchema).mutation(({ ctx, input }) => {
    return ctx.services.authService.register(input);
  }),
  login: publicProcedure.input(loginInputSchema).mutation(({ ctx, input }) => {
    return ctx.services.authService.login(input);
  }),
  me: protectedProcedure.query(({ ctx }) => {
    return ctx.services.authService.getMe(ctx.userId);
  })
});

const researchRouter = t.router({
  createSession: protectedProcedure
    .input(createSessionInputSchema)
    .mutation(({ input, ctx }) => ctx.services.researchService.createSession(ctx.userId, input)),
  getSessions: protectedProcedure.query(({ ctx }) => {
    return ctx.services.researchService.getSessions(ctx.userId);
  }),
  getQueries: protectedProcedure
    .input(
      executeQueryInputSchema.pick({
        sessionId: true
      })
    )
    .query(({ ctx, input }) => {
      return ctx.services.researchService.getQueries(ctx.userId, input.sessionId);
    }),
  executeQuery: protectedProcedure
    .input(executeQueryInputSchema)
    .mutation(({ ctx, input }) => ctx.services.researchService.executeQuery(ctx.userId, input))
});

export const appRouter = t.router({
  health: publicProcedure.query(() => ({ status: 'ok' as const })),
  auth: authRouter,
  research: researchRouter
});

export type AppRouter = typeof appRouter;
