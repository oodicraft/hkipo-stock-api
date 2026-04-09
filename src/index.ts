import { ANALYTICS_CRON, runAnalyticsAggregation } from "./analytics";
import { createApp, runScheduledSync } from "./app";
import type { Env } from "./types";

const app = createApp();

export default {
  fetch: app.fetch,
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    if (controller.cron === ANALYTICS_CRON) {
      ctx.waitUntil(runAnalyticsAggregation(env));
      return;
    }

    ctx.waitUntil(runScheduledSync(env));
  }
};
