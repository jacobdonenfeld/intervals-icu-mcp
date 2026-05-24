import "dotenv/config";

import process from "node:process";

const requiredEnv = [
  "INTERVALS_API_BASE_URL",
  "INTERVALS_API_KEY",
  "INTERVALS_ATHLETE_ID",
];

const requireOptIn = () => {
  if (process.env.RUN_INTERVALS_LIVE_TESTS !== "true") {
    process.stderr.write(
      "Refusing to run live API tests. Set RUN_INTERVALS_LIVE_TESTS=true to allow creating and deleting test events.\n"
    );
    process.exit(1);
  }
};

const requireEnv = (name) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
};

const formatDate = (date) => date.toISOString().slice(0, 10);

const localDateTime = (daysFromNow, hour) => {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  date.setHours(hour, 0, 0, 0);
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 19);
};

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const eventId = (event) => {
  assert(
    typeof event.id === "number",
    "Created event response did not include an id"
  );
  return event.id;
};

const isStravaActivity = (activity) => activity.source === "STRAVA";

const isStravaIntervalsRestriction = (error) =>
  error?.response?.status === 422 &&
  typeof error.response.data?.error === "string" &&
  error.response.data.error.includes("Cannot read Strava activities");

const run = async (name, fn) => {
  process.stdout.write(`- ${name}... `);
  const detail = await fn();
  process.stdout.write(detail ? `ok (${detail})\n` : "ok\n");
};

requireOptIn();
const athleteId = requireEnv("INTERVALS_ATHLETE_ID");
for (const name of requiredEnv) {
  requireEnv(name);
}

process.env.DEBUG = "false";

await import("../dist/client/index.js");
const {
  createEvent,
  createMultipleEvents,
  deleteEvent,
  deleteEventsBulk,
  getActivity,
  getAthleteProfile,
  getIntervals,
  listActivities,
  listEvents,
  listWellnessRecords,
  showEvent,
} = await import("../dist/client/generated/sdk.gen.js");

const marker = `intervals-icu-mcp-live-test-${Date.now()}`;
const createdEventIds = new Set();

const cleanup = async () => {
  if (!createdEventIds.size) {
    return;
  }

  const ids = [...createdEventIds];
  try {
    await deleteEventsBulk({
      path: { id: athleteId },
      body: ids.map((id) => ({ id })),
    });
    ids.forEach((id) => createdEventIds.delete(id));
  } catch {
    for (const id of ids) {
      try {
        await deleteEvent({ path: { id: athleteId, eventId: id } });
        createdEventIds.delete(id);
      } catch {
        process.stderr.write(`Failed to clean up test event ${id}\n`);
      }
    }
  }
};

const testEvent = (name, daysFromNow) => ({
  athlete_id: athleteId,
  category: "NOTE",
  description: marker,
  name,
  start_date_local: localDateTime(daysFromNow, 9),
  type: "Other",
});

try {
  const now = new Date();
  const oldest = formatDate(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000));
  const newest = formatDate(now);

  await run("getAthleteProfile", async () => {
    const response = await getAthleteProfile({ path: { id: athleteId } });
    assert(response.data, "No athlete profile returned");
  });

  let recentActivities = [];
  let nonStravaActivityId;
  let stravaActivityId;
  await run("listActivities", async () => {
    const response = await listActivities({
      path: { id: athleteId },
      query: { oldest, newest, limit: 10 },
    });
    assert(
      Array.isArray(response.data),
      "Activities response was not an array"
    );
    recentActivities = response.data.filter((activity) => activity.id);
    nonStravaActivityId = recentActivities.find(
      (activity) => !isStravaActivity(activity)
    )?.id;
    stravaActivityId = recentActivities.find(isStravaActivity)?.id;

    const nonStravaCount = recentActivities.filter(
      (activity) => !isStravaActivity(activity)
    ).length;
    const stravaCount = recentActivities.filter(isStravaActivity).length;
    return `${recentActivities.length} recent, ${nonStravaCount} non-Strava, ${stravaCount} Strava`;
  });

  if (nonStravaActivityId) {
    await run("getActivity", async () => {
      const response = await getActivity({ path: { id: nonStravaActivityId } });
      assert(response.data, "No activity details returned");
      return `non-Strava activity ${nonStravaActivityId}`;
    });

    await run("getIntervals non-Strava path", async () => {
      const response = await getIntervals({
        path: { id: nonStravaActivityId },
      });
      assert(response.data, "No intervals response returned");
      return `called activity ${nonStravaActivityId}`;
    });
  } else {
    process.stdout.write(
      "- getActivity/getIntervals non-Strava path... skipped (no non-Strava activity in last 10 recent activities)\n"
    );
  }

  if (stravaActivityId) {
    await run("getIntervals Strava path", async () => {
      try {
        const response = await getIntervals({ path: { id: stravaActivityId } });
        assert(response.data, "No intervals response returned");
        return `called Strava activity ${stravaActivityId}; API allowed intervals`;
      } catch (error) {
        if (!isStravaIntervalsRestriction(error)) {
          throw error;
        }
        return `called Strava activity ${stravaActivityId}; API returned expected 422 restriction`;
      }
    });
  } else {
    process.stdout.write(
      "- getIntervals Strava path... skipped (no Strava activity in last 10 recent activities)\n"
    );
  }

  await run("listEvents", async () => {
    const response = await listEvents({
      path: { id: athleteId, format: "" },
      query: { oldest, newest, limit: 5 },
    });
    assert(Array.isArray(response.data), "Events response was not an array");
  });

  await run("listWellnessRecords", async () => {
    const response = await listWellnessRecords({
      path: { id: athleteId, ext: "" },
      query: { oldest, newest },
    });
    assert(Array.isArray(response.data), "Wellness response was not an array");
  });

  let singleEventId = 0;
  await run("createEvent", async () => {
    const response = await createEvent({
      path: { id: athleteId },
      body: testEvent(`${marker} single`, 21),
      query: { upsertOnUid: false },
    });
    singleEventId = eventId(response.data);
    createdEventIds.add(singleEventId);
  });

  await run("showEvent", async () => {
    const response = await showEvent({
      path: { id: athleteId, eventId: singleEventId },
    });
    assert(
      response.data?.id === singleEventId,
      "Fetched event id did not match"
    );
  });

  await run("deleteEvent", async () => {
    await deleteEvent({ path: { id: athleteId, eventId: singleEventId } });
    createdEventIds.delete(singleEventId);
  });

  let bulkEventIds = [];
  await run("createMultipleEvents", async () => {
    const response = await createMultipleEvents({
      path: { id: athleteId },
      body: [
        testEvent(`${marker} bulk 1`, 22),
        testEvent(`${marker} bulk 2`, 23),
      ],
      query: {
        upsert: false,
        upsertOnUid: false,
        updatePlanApplied: false,
      },
    });
    assert(
      Array.isArray(response.data),
      "Bulk create response was not an array"
    );
    bulkEventIds = response.data.map(eventId);
    bulkEventIds.forEach((id) => createdEventIds.add(id));
  });

  await run("deleteEventsBulk", async () => {
    const response = await deleteEventsBulk({
      path: { id: athleteId },
      body: bulkEventIds.map((id) => ({ id })),
    });
    assert(
      response.data?.eventsDeleted === bulkEventIds.length,
      "Bulk delete count did not match created event count"
    );
    bulkEventIds.forEach((id) => createdEventIds.delete(id));
  });
} finally {
  await cleanup();
}
