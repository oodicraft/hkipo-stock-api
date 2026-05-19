import { createApp, runScheduledSync } from "./app";
import type { Env } from "./types";

const app = createApp();

export default {
  fetch: app.fetch,
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runScheduledSync(env));
  }
};
