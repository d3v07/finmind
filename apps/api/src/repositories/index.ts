import type { Repository } from './types.js';
import { FileRepository } from './file-repository.js';

export function createRepositoryFromEnv(): Repository {
  const filePath = process.env.FINMIND_DATA_FILE ?? '.finmind/data.json';
  return new FileRepository(filePath);
}
