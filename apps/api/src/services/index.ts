import { AuthService } from '../auth/service.js';
import { AdminService } from '../admin/service.js';
import { createDexterAdapterFromEnv } from '../dexter/adapter.js';
import { FeatureService } from '../features/service.js';
import { createRepositoryFromEnv } from '../repositories/index.js';
import { ResearchService } from '../research/service.js';

export type AppServices = {
  authService: AuthService;
  adminService: AdminService;
  researchService: ResearchService;
  featureService: FeatureService;
};

export function createAppServices(): AppServices {
  const repository = createRepositoryFromEnv();
  const authService = new AuthService(repository);
  const adminService = new AdminService(repository);
  const researchService = new ResearchService(repository, createDexterAdapterFromEnv());
  const featureService = new FeatureService(repository);

  return {
    authService,
    adminService,
    researchService,
    featureService
  };
}
