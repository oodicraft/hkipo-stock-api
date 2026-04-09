import test from "node:test";
import assert from "node:assert/strict";
import {
  ANALYTICS_CLIENT_PATH,
  MACOS_SERVICE_KEY,
  analyticsTestExports,
  computeRetentionRows,
  ingestClientAnalyticsPayload,
  trackLandingPageView
} from "../src/analytics";

function createAnalyticsEnv() {
  const writes: Array<{
    indexes: string[];
    blobs?: string[];
    doubles?: number[];
  }> = [];

  return {
    env: {
      ANALYTICS: {
        writeDataPoint: (point: { indexes: string[]; blobs?: string[]; doubles?: number[] }) => {
          writes.push(point);
        }
      },
      ANALYTICS_SALT: "test-salt"
    },
    writes
  };
}

test("ingestClientAnalyticsPayload hashes installId before writing analytics data", async () => {
  const { env, writes } = createAnalyticsEnv();
  const request = new Request(`https://localhost${ANALYTICS_CLIENT_PATH}`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    }
  });

  await ingestClientAnalyticsPayload(env as never, request, {
    event: "user_data_saved",
    installId: "install-123",
    occurredAt: "2026-04-09T01:02:03Z",
    appVersion: "1.2.3",
    platform: "macos",
    code: "02657"
  });

  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0].indexes, [MACOS_SERVICE_KEY]);
  assert.equal(writes[0].blobs?.[0], "user_data_saved");
  assert.equal(writes[0].blobs?.includes("install-123"), false);
  assert.equal(writes[0].blobs?.[5], "02657");
});

test("trackLandingPageView writes a page_view event without storing raw identity parts", async () => {
  const { env, writes } = createAnalyticsEnv();
  const request = new Request("https://hkipo.langtangs.com/", {
    headers: {
      "CF-Connecting-IP": "203.0.113.10",
      "user-agent": "UnitTestBrowser/1.0"
    }
  });

  await trackLandingPageView(env as never, request);

  assert.equal(writes.length, 1);
  assert.equal(writes[0].blobs?.[0], "page_view");
  assert.equal(writes[0].blobs?.includes("203.0.113.10"), false);
  assert.equal(writes[0].blobs?.includes("UnitTestBrowser/1.0"), false);
  assert.equal(writes[0].blobs?.[4], "landing");
});

test("buildInstallSnapshots deduplicates daily app_active rows and derives dau metrics", () => {
  const snapshot = analyticsTestExports.buildInstallSnapshots([
    {
      actorIdHash: "actor-1",
      eventDate: "2026-04-07",
      appVersion: "1.0.0",
      lastEventAt: "2026-04-07T09:00:00"
    },
    {
      actorIdHash: "actor-1",
      eventDate: "2026-04-07",
      appVersion: "1.0.1",
      lastEventAt: "2026-04-07T10:00:00"
    },
    {
      actorIdHash: "actor-1",
      eventDate: "2026-04-08",
      appVersion: "1.0.1",
      lastEventAt: "2026-04-08T08:30:00"
    },
    {
      actorIdHash: "actor-2",
      eventDate: "2026-04-08",
      appVersion: "1.0.0",
      lastEventAt: "2026-04-08T09:30:00"
    }
  ]);

  assert.equal(snapshot.installs.length, 2);
  assert.deepEqual(snapshot.activities.map((row) => row.activityDate), ["2026-04-07", "2026-04-08", "2026-04-08"]);
  assert.deepEqual(snapshot.metrics, [
    {
      serviceKey: MACOS_SERVICE_KEY,
      metricDate: "2026-04-07",
      metricName: "dau",
      eventCount: 1,
      uniqueActorCount: 1
    },
    {
      serviceKey: MACOS_SERVICE_KEY,
      metricDate: "2026-04-08",
      metricName: "dau",
      eventCount: 2,
      uniqueActorCount: 2
    }
  ]);
});

test("computeRetentionRows calculates D1, D7, and D30 retention from install cohorts", () => {
  const rows = computeRetentionRows(
    [
      { installIdHash: "a", firstSeenDate: "2026-03-01" },
      { installIdHash: "b", firstSeenDate: "2026-03-01" },
      { installIdHash: "c", firstSeenDate: "2026-03-05" }
    ],
    [
      { installIdHash: "a", activityDate: "2026-03-02" },
      { installIdHash: "a", activityDate: "2026-03-08" },
      { installIdHash: "b", activityDate: "2026-03-31" },
      { installIdHash: "c", activityDate: "2026-03-06" }
    ],
    "2026-04-08"
  );

  assert.deepEqual(rows.filter((row) => row.cohortDate === "2026-03-01"), [
    {
      serviceKey: MACOS_SERVICE_KEY,
      cohortDate: "2026-03-01",
      returnDay: 1,
      cohortSize: 2,
      retainedCount: 1,
      retentionRate: 0.5
    },
    {
      serviceKey: MACOS_SERVICE_KEY,
      cohortDate: "2026-03-01",
      returnDay: 7,
      cohortSize: 2,
      retainedCount: 1,
      retentionRate: 0.5
    },
    {
      serviceKey: MACOS_SERVICE_KEY,
      cohortDate: "2026-03-01",
      returnDay: 30,
      cohortSize: 2,
      retainedCount: 1,
      retentionRate: 0.5
    }
  ]);
});
