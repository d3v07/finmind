import { randomUUID } from 'node:crypto';
import type { ExecuteQueryInput, QueryRecord } from '@finmind/shared';

export type QueryJobStatus = 'queued' | 'running' | 'completed' | 'failed';

export type QueryJob = {
  id: string;
  userId: string;
  input: ExecuteQueryInput;
  status: QueryJobStatus;
  result: QueryRecord | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
};

export class QueryQueue {
  private readonly jobs = new Map<string, QueryJob>();
  private readonly pending: string[] = [];
  private running = false;
  private readonly execute: (userId: string, input: ExecuteQueryInput) => Promise<QueryRecord>;

  constructor(execute: (userId: string, input: ExecuteQueryInput) => Promise<QueryRecord>) {
    this.execute = execute;
  }

  enqueue(userId: string, input: ExecuteQueryInput): QueryJob {
    const now = new Date().toISOString();
    const job: QueryJob = {
      id: randomUUID(),
      userId,
      input,
      status: 'queued',
      result: null,
      error: null,
      createdAt: now,
      updatedAt: now
    };

    this.jobs.set(job.id, job);
    this.pending.push(job.id);
    void this.process();
    return job;
  }

  getJob(jobId: string, userId: string): QueryJob | null {
    const job = this.jobs.get(jobId);
    if (!job || job.userId !== userId) {
      return null;
    }
    return job;
  }

  private async process() {
    if (this.running) {
      return;
    }
    this.running = true;

    while (this.pending.length > 0) {
      const jobId = this.pending.shift();
      if (!jobId) {
        continue;
      }

      const job = this.jobs.get(jobId);
      if (!job) {
        continue;
      }

      job.status = 'running';
      job.updatedAt = new Date().toISOString();

      try {
        const result = await this.execute(job.userId, job.input);
        job.status = 'completed';
        job.result = result;
        job.error = null;
        job.updatedAt = new Date().toISOString();
      } catch (error) {
        job.status = 'failed';
        job.error = error instanceof Error ? error.message : 'unknown_error';
        job.updatedAt = new Date().toISOString();
      }
    }

    this.running = false;
  }
}
