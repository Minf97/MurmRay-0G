import {
  DEFAULT_CONCURRENCY,
  DEFAULT_EMBEDDING_DIMENSIONS,
  DEFAULT_MAX_DURATION_MS,
  DEFAULT_RECONCILE_LIMIT,
  DEFAULT_STALE_LOCK_SECONDS,
  MAX_CONCURRENCY,
  MAX_DURATION_MS,
  MAX_RECONCILE_LIMIT,
  clampInt,
} from './config';
import {
  applyEmbeddingResults,
  claimEmbeddingJobs,
  createEmbeddingInsforgeClient,
  enqueueMissingActiveMarkets,
  markJobsDone,
  markJobsFailed,
} from './insforge';
import { callEmbeddingSingle, resolveEmbeddingOptions, toVectorLiteral } from './openrouter';
import type {
  CreateEmbeddingWorkerOptions,
  EmbeddingApplyRow,
  EmbeddingInsforgeClient,
  EmbeddingJob,
  EmbeddingOptions,
  EmbeddingWorkerRequest,
} from './types';

interface ProcessResult {
  succeeded: number;
  failed: number;
  jobsMarkedDone: number;
  jobsReturnedToPending: number;
  embeddingRequests: number;
  retriesApprox: number;
}

interface WorkerTotals {
  claimRounds: number;
  jobsClaimed: number;
  embeddingsSucceeded: number;
  embeddingsFailed: number;
  jobsMarkedDone: number;
  jobsReturnedToPending: number;
  embeddingRequests: number;
  retriesApprox: number;
  peakConcurrency: number;
  hasMore: boolean;
}

// 空统计
function createWorkerTotals(): WorkerTotals {
  return {
    claimRounds: 0,
    jobsClaimed: 0,
    embeddingsSucceeded: 0,
    embeddingsFailed: 0,
    jobsMarkedDone: 0,
    jobsReturnedToPending: 0,
    embeddingRequests: 0,
    retriesApprox: 0,
    peakConcurrency: 0,
    hasMore: false,
  };
}

// 成功行
function buildSucceededRow(job: EmbeddingJob, vector: number[], syncedAt: string): EmbeddingApplyRow {
  return {
    market_id: job.market_id,
    embed_text: job.embed_text,
    embedding_text: toVectorLiteral(vector),
    source_updated_at: job.source_updated_at,
    synced_at: syncedAt,
  };
}

// 创建服务
export function createEmbeddingWorker(options: CreateEmbeddingWorkerOptions = {}) {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? (() => Date.now());
  const sleepImpl = options.sleepImpl;

  // 取客户端
  function getInsforgeClient(): EmbeddingInsforgeClient {
    return options.insforgeClient ?? createEmbeddingInsforgeClient(env);
  }

  // 处理任务
  async function processClaimedJob(
    client: EmbeddingInsforgeClient,
    job: EmbeddingJob,
    embeddingOptions: EmbeddingOptions,
  ): Promise<ProcessResult> {
    let attemptsUsed = 0;

    try {
      const result = await callEmbeddingSingle(job.embed_text, {
        ...embeddingOptions,
        fetchImpl,
        sleepImpl,
      });
      attemptsUsed = result.attemptsUsed;

      await applyEmbeddingResults(client, [buildSucceededRow(job, result.vector, new Date(now()).toISOString())]);
      const jobsMarkedDone = await markJobsDone(client, [job.market_id]);

      return {
        succeeded: 1,
        failed: 0,
        jobsMarkedDone,
        jobsReturnedToPending: 0,
        embeddingRequests: attemptsUsed,
        retriesApprox: Math.max(0, attemptsUsed - 1),
      };
    } catch (error) {
      attemptsUsed = Number((error as Error & { attemptsUsed?: number })?.attemptsUsed || attemptsUsed || 0);
      const message = error instanceof Error ? error.message : String(error);
      const jobsReturnedToPending = await markJobsFailed(client, [{ market_id: job.market_id, error: message }]);

      return {
        succeeded: 0,
        failed: 1,
        jobsMarkedDone: 0,
        jobsReturnedToPending,
        embeddingRequests: attemptsUsed,
        retriesApprox: Math.max(0, attemptsUsed - 1),
      };
    }
  }

  // 连续处理
  async function processJobsContinuous(
    client: EmbeddingInsforgeClient,
    embeddingOptions: EmbeddingOptions,
    concurrency: number,
    staleLockSeconds: number,
    maxDurationMs: number,
    startedAt: number,
  ): Promise<WorkerTotals> {
    const totals = createWorkerTotals();
    let activeWorkers = 0;

    // 认领一批
    async function claimNext(limit: number) {
      totals.claimRounds += 1;
      const jobs = await claimEmbeddingJobs(client, limit, staleLockSeconds);
      totals.jobsClaimed += jobs.length;
      return jobs;
    }

    // 执行通道
    async function runLane(initialJob: EmbeddingJob) {
      let job: EmbeddingJob | null = initialJob;

      while (job) {
        activeWorkers += 1;
        totals.peakConcurrency = Math.max(totals.peakConcurrency, activeWorkers);

        try {
          const result = await processClaimedJob(client, job, embeddingOptions);
          totals.embeddingsSucceeded += result.succeeded;
          totals.embeddingsFailed += result.failed;
          totals.jobsMarkedDone += result.jobsMarkedDone;
          totals.jobsReturnedToPending += result.jobsReturnedToPending;
          totals.embeddingRequests += result.embeddingRequests;
          totals.retriesApprox += result.retriesApprox;
        } finally {
          activeWorkers -= 1;
        }

        if (now() - startedAt >= maxDurationMs) {
          totals.hasMore = true;
          break;
        }

        const nextJobs = await claimNext(1);
        job = nextJobs[0] || null;
      }
    }

    const initialJobs = await claimNext(concurrency);
    await Promise.all(initialJobs.map((job) => runLane(job)));
    return totals;
  }

  // 执行任务
  async function run(body: EmbeddingWorkerRequest = {}) {
    const action = typeof body.action === 'string' && body.action.trim()
      ? body.action.trim()
      : 'run_embedding_worker';
    if (action !== 'run_embedding_worker') {
      throw new Error('Unsupported action. Use action=run_embedding_worker');
    }

    const startedAt = now();
    const client = getInsforgeClient();
    const concurrency = clampInt(body.concurrency ?? body.workerConcurrency, DEFAULT_CONCURRENCY, 1, MAX_CONCURRENCY);
    const reconcileLimit = clampInt(body.reconcileLimit, DEFAULT_RECONCILE_LIMIT, 0, MAX_RECONCILE_LIMIT);
    const staleLockSeconds = clampInt(body.staleLockSeconds, DEFAULT_STALE_LOCK_SECONDS, 60, 86_400);
    const maxDurationMs = clampInt(body.maxDurationMs, DEFAULT_MAX_DURATION_MS, 5_000, MAX_DURATION_MS);
    const expectedDimensions = clampInt(body.expectedDimensions ?? body.dimensions, DEFAULT_EMBEDDING_DIMENSIONS, 128, 6144);
    const embeddingOptions = resolveEmbeddingOptions(env, expectedDimensions);

    const jobsReconciled = reconcileLimit > 0
      ? await enqueueMissingActiveMarkets(client, reconcileLimit)
      : 0;
    const totals = await processJobsContinuous(
      client,
      embeddingOptions,
      concurrency,
      staleLockSeconds,
      maxDurationMs,
      startedAt,
    );

    return {
      action: 'run_embedding_worker',
      processed: totals.embeddingsSucceeded,
      failed: totals.embeddingsFailed,
      hasMore: totals.hasMore,
      concurrency,
      claimLimit: concurrency,
      reconcileLimit,
      maxDurationMs,
      embeddingModel: embeddingOptions.model,
      expectedDimensions,
      executionMode: 'continuous_pool',
      totals: {
        jobsReconciled,
        claimRounds: totals.claimRounds,
        jobsClaimed: totals.jobsClaimed,
        embeddingsSucceeded: totals.embeddingsSucceeded,
        embeddingsFailed: totals.embeddingsFailed,
        jobsMarkedDone: totals.jobsMarkedDone,
        jobsReturnedToPending: totals.jobsReturnedToPending,
        embeddingRequests: totals.embeddingRequests,
        retriesApprox: totals.retriesApprox,
        peakConcurrency: totals.peakConcurrency,
      },
      timingMs: {
        totalMs: now() - startedAt,
      },
    };
  }

  return { run };
}
