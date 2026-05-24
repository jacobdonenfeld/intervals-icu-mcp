import { DateTime, Duration } from "luxon";

import type {
  IntervalsDto,
  Interval,
  IntervalGroup,
} from "../client/generated/types.gen";

type FormatActivitySummaryOptions = {
  includeOtherFields?: boolean;
};

// For fields handeled in formatActivitySummary, we also list the keys here so we can default print out any
// non-handled fields for debugging new or unexpected data when the includeOtherFields option is enabled.
const handledActivityFields = new Set([
  "average_cadence",
  "average_heartrate",
  "average_speed",
  "average_temp",
  "average_watts",
  "average_stride",
  "average_wind_speed",
  "avgHr",
  "avgPower",
  "avg_lr_balance",
  "calories",
  "decoupling",
  "description",
  "device_name",
  "distance",
  "duration",
  "elapsed_time",
  "elevationGain",
  "feel",
  "file_type",
  "headwind_percent",
  "icu_atl",
  "icu_average_watts",
  "icu_ctl",
  "icu_efficiency_factor",
  "icu_ftp",
  "icu_intensity",
  "icu_joules",
  "icu_power_hr",
  "icu_resting_hr",
  "icu_rpe",
  "icu_training_load",
  "icu_variability_index",
  "icu_weight",
  "icu_weighted_avg_watts",
  "id",
  "lthr",
  "max_heartrate",
  "max_speed",
  "max_temp",
  "min_temp",
  "moving_time",
  "name",
  "pace_load",
  "perceived_exertion",
  "polarization_index",
  "power_load",
  "power_meter",
  "resting_hr",
  "session_rpe",
  "startTime",
  "start_date",
  "start_date_local",
  "tailwind_percent",
  "total_elevation_gain",
  "total_elevation_loss",
  "trainer",
  "trainingLoad",
  "trimp",
  "type",
]);

/**
 * Format an activity into a readable string.
 */
export function formatActivitySummary(
  activity: Record<string, unknown>,
  options: FormatActivitySummaryOptions = {}
): string {
  let startTime =
    activity.startTime ||
    activity.start_date_local ||
    activity.start_date ||
    "Unknown";
  if (typeof startTime === "string" && startTime.length > 10) {
    try {
      // Use luxon for robust ISO parsing
      const dt = DateTime.fromISO(startTime.replace("Z", "+00:00"));
      if (dt.isValid) {
        startTime = dt.toFormat("yyyy-MM-dd HH:mm:ss");
      }
    } catch {
      // leave as is
    }
  }

  const averagePower =
    activity.avgPower ?? activity.icu_average_watts ?? activity.average_watts;
  const duration = activity.duration ?? activity.elapsed_time;

  const lines = [
    `Activity: ${formatRequired(activity.name, "Unnamed")}`,
    `ID: ${formatRequired(activity.id)}`,
    `Type: ${formatRequired(activity.type, "Unknown")}`,
    `Date: ${formatRequired(startTime, "Unknown")}`,
    ...optionalLines(
      metricLine("Description", activity.description),
      metricLine("Distance", activity.distance, (value) =>
        formatDecimalWithUnit(value, "meters")
      ),
      metricLine("Duration", duration, (value) =>
        formatDecimalWithUnit(value, "seconds", { digits: 0 })
      ),
      metricLine("Moving Time", activity.moving_time, (value) =>
        formatDecimalWithUnit(value, "seconds", { digits: 0 })
      ),
      metricLine(
        "Elevation Gain",
        activity.elevationGain ?? activity.total_elevation_gain,
        (value) => formatDecimalWithUnit(value, "meters")
      ),
      metricLine("Elevation Loss", activity.total_elevation_loss, (value) =>
        formatDecimalWithUnit(value, "meters")
      )
    ),
    ...section(
      "Power Data",
      optionalLines(
        metricLine("Average Power", averagePower, (value) =>
          formatDecimalWithUnit(value, "W", { digits: 0 })
        ),
        metricLine(
          "Weighted Avg Power",
          activity.icu_weighted_avg_watts,
          (value) => formatDecimalWithUnit(value, "W", { digits: 0 })
        ),
        metricLine(
          "Training Load",
          activity.trainingLoad ?? activity.icu_training_load,
          (value) => formatDecimal(value, 0)
        ),
        metricLine("FTP", activity.icu_ftp, (value) =>
          formatDecimalWithUnit(value, "W", { digits: 0 })
        ),
        metricLine("Work", activity.icu_joules, formatKilojoulesWithUnits),
        metricLine("Intensity", activity.icu_intensity, formatDecimal),
        metricLine("Power:HR Ratio", activity.icu_power_hr, (value) =>
          formatDecimal(value, 2)
        ),
        metricLine(
          "Variability Index",
          activity.icu_variability_index,
          (value) => formatDecimal(value, 2)
        )
      )
    ),
    ...section(
      "Heart Rate Data",
      optionalLines(
        metricLine(
          "Average Heart Rate",
          activity.avgHr ?? activity.average_heartrate,
          (value) => formatDecimalWithUnit(value, "bpm", { digits: 0 })
        ),
        metricLine("Max Heart Rate", activity.max_heartrate, (value) =>
          formatDecimalWithUnit(value, "bpm", { digits: 0 })
        ),
        metricLine("LTHR", activity.lthr, (value) =>
          formatDecimalWithUnit(value, "bpm", { digits: 0 })
        ),
        metricLine("Resting HR", activity.icu_resting_hr, (value) =>
          formatDecimalWithUnit(value, "bpm", { digits: 0 })
        ),
        metricLine("Decoupling", activity.decoupling, formatDecimal)
      )
    ),
    ...section(
      "Other Metrics",
      optionalLines(
        metricLine("Cadence", activity.average_cadence, (value) =>
          formatDecimalWithUnit(value, "rpm")
        ),
        metricLine("Calories", activity.calories, (value) =>
          formatDecimal(value, 0)
        ),
        metricLine("Average Speed", activity.average_speed, (value) =>
          formatDecimalWithUnit(value, "m/s")
        ),
        metricLine("Max Speed", activity.max_speed, (value) =>
          formatDecimalWithUnit(value, "m/s")
        ),
        metricLine("Average Stride", activity.average_stride, formatDecimal),
        metricLine(
          "Avg L/R Balance",
          activity.avg_lr_balance,
          formatLeftRightBalance
        ),
        metricLine("Weight", activity.icu_weight, (value) =>
          formatDecimalWithUnit(value, "kg")
        ),
        metricLine(
          "RPE (1=easy, 10=very hard)",
          activity.perceived_exertion ?? activity.icu_rpe,
          formatRpe
        ),
        metricLine("Session RPE", activity.session_rpe, (value) =>
          formatDecimal(value, 0)
        ),
        metricLine("Feel (1=strong, 5=weak)", activity.feel, formatFeel)
      )
    ),
    ...section(
      "Environment",
      optionalLines(
        metricLine("Trainer", activity.trainer),
        metricLine("Average Temp", activity.average_temp, (value) =>
          formatDecimalWithUnit(value, "°C", { separator: "" })
        ),
        metricLine("Min Temp", activity.min_temp, (value) =>
          formatDecimalWithUnit(value, "°C", { separator: "" })
        ),
        metricLine("Max Temp", activity.max_temp, (value) =>
          formatDecimalWithUnit(value, "°C", { separator: "" })
        ),
        metricLine("Avg Wind Speed", activity.average_wind_speed, (value) =>
          formatDecimalWithUnit(value, "km/h")
        ),
        metricLine("Headwind", activity.headwind_percent, (value) =>
          formatDecimalWithUnit(value, "%", { separator: "" })
        ),
        metricLine("Tailwind", activity.tailwind_percent, (value) =>
          formatDecimalWithUnit(value, "%", { separator: "" })
        )
      )
    ),
    ...section(
      "Training Metrics",
      optionalLines(
        metricLine("Fitness (CTL)", activity.icu_ctl, formatDecimal),
        metricLine("Fatigue (ATL)", activity.icu_atl, formatDecimal),
        metricLine("TRIMP", activity.trimp, formatDecimal),
        metricLine("Polarization Index", activity.polarization_index, (value) =>
          formatDecimal(value, 2)
        ),
        metricLine("Power Load", activity.power_load, (value) =>
          formatDecimal(value, 0)
        ),
        metricLine("HR Load", activity.hr_load, (value) =>
          formatDecimal(value, 0)
        ),
        metricLine("Pace Load", activity.pace_load, (value) =>
          formatDecimal(value, 0)
        ),
        metricLine(
          "Efficiency Factor",
          activity.icu_efficiency_factor,
          (value) => formatDecimal(value, 2)
        )
      )
    ),
    ...section(
      "Device Info",
      optionalLines(
        metricLine("Device", activity.device_name),
        metricLine("Power Meter", activity.power_meter),
        metricLine("File Type", activity.file_type)
      )
    ),
    ...(options.includeOtherFields
      ? section(
          "Other Fields",
          formatOtherFields(activity, handledActivityFields)
        )
      : []),
  ];

  return lines.join("\n");
}

/**
 * Format a workout into a readable string.
 */
export function formatWorkout(workout: Record<string, unknown>): string {
  return `
Workout: ${workout.name || "Unnamed"}
Description: ${workout.description || "No description"}
Sport: ${workout.sport || "Unknown"}
Duration: ${workout.duration || 0} seconds
TSS: ${workout.tss ?? "N/A"}
Intervals: ${Array.isArray(workout.intervals) ? workout.intervals.length : 0}
`;
}

/**
 * Format a wellness data entry into a readable string with all available fields.
 */
export function formatWellnessEntry(entry: Record<string, unknown>): string {
  const lines = [
    `Date: ${formatRequired(entry.id ?? entry.date, "Unknown date")}`,
    ...section(
      "Training Metrics",
      optionalLines(
        metricLine("Fitness (CTL)", entry.ctl, formatDecimal),
        metricLine("Fatigue (ATL)", entry.atl, formatDecimal),
        metricLine("Ramp Rate", entry.rampRate, formatDecimal),
        metricLine("CTL Load", entry.ctlLoad, formatDecimal),
        metricLine("ATL Load", entry.atlLoad, formatDecimal)
      )
    ),
    ...section("Sport-Specific Info", formatSportInfo(entry.sportInfo)),
    ...section(
      "Vital Signs",
      optionalLines(
        metricLine("Weight", entry.weight, (value) =>
          formatDecimalWithUnit(value, "kg")
        ),
        metricLine("Resting HR", entry.restingHR, (value) =>
          formatDecimalWithUnit(value, "bpm", { digits: 0 })
        ),
        metricLine("HRV", entry.hrv, formatDecimal),
        metricLine("HRV SDNN", entry.hrvSDNN, formatDecimal),
        metricLine("Average Sleeping HR", entry.avgSleepingHR, (value) =>
          formatDecimalWithUnit(value, "bpm", { digits: 0 })
        ),
        metricLine("SpO2", entry.spO2, (value) =>
          formatDecimalWithUnit(value, "%", { separator: "" })
        ),
        metricLine("Blood Pressure", entry, formatBloodPressure),
        metricLine("Respiration", entry.respiration, (value) =>
          formatDecimalWithUnit(value, "breaths/min")
        ),
        metricLine("Blood Glucose", entry.bloodGlucose, (value) =>
          formatDecimalWithUnit(value, "mmol/L")
        ),
        metricLine("Lactate", entry.lactate, (value) =>
          formatDecimalWithUnit(value, "mmol/L")
        ),
        metricLine("VO2 Max", entry.vo2max, (value) =>
          formatDecimalWithUnit(value, "ml/kg/min")
        ),
        metricLine("Body Fat", entry.bodyFat, (value) =>
          formatDecimalWithUnit(value, "%", { separator: "" })
        ),
        metricLine("Abdomen", entry.abdomen, (value) =>
          formatDecimalWithUnit(value, "cm")
        ),
        metricLine("Baevsky Stress Index", entry.baevskySI, formatDecimal)
      )
    ),
    ...section(
      "Sleep & Recovery",
      optionalLines(
        metricLine("Sleep", entry, formatSleep),
        metricLine("Sleep Score", entry.sleepScore, (value) =>
          formatDecimal(value, 0)
        ),
        metricLine("Sleep Quality", entry.sleepQuality, (value) =>
          formatScale(value, 4)
        ),
        metricLine("Readiness Score", entry.readiness, formatDecimal)
      )
    ),
    ...section(
      "Menstrual Tracking",
      optionalLines(
        metricLine("Menstrual Phase", entry.menstrualPhase, formatCapitalized),
        metricLine(
          "Predicted Phase",
          entry.menstrualPhasePredicted,
          formatCapitalized
        )
      )
    ),
    ...section(
      "Subjective Feelings",
      optionalLines(
        metricLine("Soreness", entry.soreness, (value) =>
          formatScale(value, 14)
        ),
        metricLine("Fatigue", entry.fatigue, (value) => formatScale(value, 4)),
        metricLine("Stress", entry.stress, (value) => formatScale(value, 4)),
        metricLine("Mood", entry.mood, (value) => formatScale(value, 4)),
        metricLine("Motivation", entry.motivation, (value) =>
          formatScale(value, 4)
        ),
        metricLine("Injury Level", entry.injury, (value) =>
          formatScale(value, 4)
        )
      )
    ),
    ...section(
      "Nutrition & Hydration",
      optionalLines(
        metricLine("Calories Consumed", entry.kcalConsumed, (value) =>
          formatDecimalWithUnit(value, "kcal", { digits: 0 })
        ),
        metricLine("Hydration Score", entry.hydration, (value) =>
          formatScale(value, 4)
        ),
        metricLine("Hydration Volume", entry.hydrationVolume, (value) =>
          formatDecimalWithUnit(value, "ml", { digits: 0 })
        )
      )
    ),
    ...section(
      "Activity",
      optionalLines(
        metricLine("Steps", entry.steps, (value) => formatDecimal(value, 0))
      )
    ),
    ...optionalLines(
      metricLine("Comments", entry.comments),
      metricLine("Status", entry.locked, formatLockStatus),
      metricLine("Last Updated", entry.updated)
    ),
  ];

  return lines.join("\n");
}

/**
 * Format a basic event summary into a readable string.
 */
export function formatEventSummary(event: Record<string, unknown>): string {
  const event_date = event.start_date_local || event.date || "Unknown";
  let event_type = "Other";
  if (event.workout) event_type = "Workout";
  else if (event.race) event_type = "Race";
  const event_name = event.name || "Unnamed";
  const event_id = event.id || "N/A";
  const event_desc = event.description || "No description";
  return `Date: ${event_date}
ID: ${event_id}
Type: ${event_type}
Name: ${event_name}
Description: ${event_desc}`;
}

/**
 * Format detailed event information into a readable string.
 */
export function formatEventDetails(event: Record<string, unknown>): string {
  let event_details = `Event Details:\n\nID: ${event.id || "N/A"}\nDate: ${event.date || "Unknown"}\nName: ${event.name || "Unnamed"}\nDescription: ${event.description || "No description"}`;
  if (event.workout && typeof event.workout === "object") {
    const workout = event.workout as Record<string, unknown>;
    event_details += `\n\nWorkout Information:\nWorkout ID: ${workout.id || "N/A"}\nSport: ${workout.sport || "Unknown"}\nDuration: ${workout.duration || 0} seconds\nTSS: ${workout.tss ?? "N/A"}`;
    if (Array.isArray(workout.intervals)) {
      event_details += `\nIntervals: ${workout.intervals.length}`;
    }
  }
  if (event.race) {
    event_details += `\n\nRace Information:\nPriority: ${event.priority ?? "N/A"}\nResult: ${event.result ?? "N/A"}`;
  }
  if (event.calendar && typeof event.calendar === "object") {
    const cal = event.calendar as Record<string, unknown>;
    event_details += `\n\nCalendar: ${cal.name ?? "N/A"}`;
  }
  return event_details;
}

/**
 * Format intervals data into a markdown table for both groups and individual intervals.
 */
export function formatIntervalsTable(intervalsData: IntervalsDto): string {
  let result = "";
  // Interval Groups Table
  if (
    Array.isArray(intervalsData.icu_groups) &&
    intervalsData.icu_groups.length > 0
  ) {
    result += "### Interval Groups\n\n";
    result +=
      "| # | Type | Duration | Distance | Avg Power | Avg HR | Intensity | Speed |\n";
    result +=
      "|---|------|----------|----------|-----------|---------|-----------|-------|\n";
    intervalsData.icu_groups.forEach((group: IntervalGroup, i: number) => {
      const duration = group.elapsed_time
        ? formatSeconds(group.elapsed_time)
        : "N/A";
      const distance =
        group.distance != null
          ? (group.distance / 1000).toFixed(2) + "km"
          : "N/A";
      const avgPower =
        group.average_watts != null ? group.average_watts + "W" : "N/A";
      const avgHR =
        group.average_heartrate != null
          ? group.average_heartrate + " bpm"
          : "N/A";
      const intensity = group.intensity != null ? group.intensity + "%" : "N/A";
      const speed =
        group.average_speed != null
          ? `${(group.average_speed * 3.6).toFixed(1)} km/h`
          : "N/A";
      // Type and count (IntervalGroup does not have 'type', so just show count if present)
      const type = group.count ? `(${group.count}x)` : "";
      result += `| ${i + 1} | ${type} | ${duration} | ${distance} | ${avgPower} | ${avgHR} | ${intensity} | ${speed} |\n`;
    });
    result += "\n";
  }
  // Individual Intervals Table
  if (
    Array.isArray(intervalsData.icu_intervals) &&
    intervalsData.icu_intervals.length > 0
  ) {
    result += "### Individual Intervals\n\n";
    result +=
      "| # | Type | Duration | Distance | Avg Power | Max Power | Avg HR | Max HR | Intensity | Speed |\n";
    result +=
      "|---|------|----------|----------|-----------|-----------|---------|---------|-----------|-------|\n";
    intervalsData.icu_intervals.forEach((interval: Interval, i: number) => {
      const duration = interval.elapsed_time
        ? formatSeconds(interval.elapsed_time)
        : "N/A";
      const distance =
        interval.distance != null
          ? (interval.distance / 1000).toFixed(2) + "km"
          : "N/A";
      const avgPower =
        interval.average_watts != null ? interval.average_watts + "W" : "N/A";
      const maxPower =
        interval.max_watts != null ? interval.max_watts + "W" : "N/A";
      const avgHR =
        interval.average_heartrate != null ? interval.average_heartrate : "N/A";
      const maxHR =
        interval.max_heartrate != null ? interval.max_heartrate : "N/A";
      const intensity =
        interval.intensity != null ? interval.intensity + "%" : "N/A";
      const speed =
        interval.average_speed != null
          ? `${(interval.average_speed * 3.6).toFixed(1)} km/h`
          : "N/A";
      const type = interval.type
        ? interval.type.charAt(0) + interval.type.slice(1).toLowerCase()
        : "";
      result += `| ${i + 1} | ${type} | ${duration} | ${distance} | ${avgPower} | ${maxPower} | ${avgHR} | ${maxHR} | ${intensity} | ${speed} |\n`;
    });
    result += "\n";
  }
  return result.trim();
}

function formatSeconds(seconds: number): string {
  if (!seconds || isNaN(seconds)) return "N/A";
  return Duration.fromObject({ seconds }).toFormat("m:ss");
}

function formatRequired(value: unknown, fallback = "N/A"): string {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "number" && Number.isNaN(value)) return fallback;
  return String(value);
}

function optionalLines(...lines: Array<string | undefined>): string[] {
  return lines.filter((line): line is string => line !== undefined);
}

function section(title: string, lines: string[]): string[] {
  return lines.length ? ["", `${title}:`, ...lines] : [];
}

function metricLine(
  label: string,
  value: unknown,
  formatter: (value: unknown) => string = formatRequired
): string | undefined {
  const formatted = formatter(value);
  return formatted === "N/A" ? undefined : `${label}: ${formatted}`;
}

// Apply formatting to all other fields not explicitly handeled.
function formatOtherFields(
  record: Record<string, unknown>,
  handledFields: Set<string>
): string[] {
  return Object.entries(record)
    .filter(([key, value]) => !handledFields.has(key) && hasValue(value))
    .map(([key, value]) => `${key}: ${formatUnknownFieldValue(value)}`);
}

// Used to format any non explicitally handled fields for debugging new or unexpected data.
function formatUnknownFieldValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value instanceof Date) return value.toISOString();
  return JSON.stringify(value);
}

function hasValue(value: unknown): boolean {
  if (value === null || value === undefined || value === "") return false;
  if (typeof value === "number" && Number.isNaN(value)) return false;
  if (Array.isArray(value) && value.length === 0) return false;
  return true;
}

function formatSportInfo(sportInfo: unknown): string[] {
  if (!Array.isArray(sportInfo)) return [];
  return sportInfo
    .filter((sport): sport is Record<string, unknown> => {
      return (
        typeof sport === "object" &&
        sport !== null &&
        hasValue((sport as Record<string, unknown>).eftp)
      );
    })
    .map((sport) => {
      const type = formatRequired(sport.type, "Unknown");
      return `${type}: eFTP = ${formatDecimalWithUnit(sport.eftp, "W", {
        digits: 0,
      })}`;
    });
}

function formatBloodPressure(entry: unknown): string {
  if (typeof entry !== "object" || entry === null) return "N/A";
  const record = entry as Record<string, unknown>;
  if (!hasValue(record.systolic) || !hasValue(record.diastolic)) return "N/A";
  return `${formatRequired(record.systolic)}/${formatRequired(record.diastolic)} mmHg`;
}

function formatSleep(entry: unknown): string {
  if (typeof entry !== "object" || entry === null) return "N/A";
  const record = entry as Record<string, unknown>;
  if (typeof record.sleepSecs === "number" && !Number.isNaN(record.sleepSecs)) {
    return `${(record.sleepSecs / 3600).toFixed(2)} hours`;
  }
  if (hasValue(record.sleepHours)) {
    return `${formatRequired(record.sleepHours)} hours`;
  }
  return "N/A";
}

function formatCapitalized(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) return "N/A";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatScale(value: unknown, max: number): string {
  if (typeof value !== "number" || Number.isNaN(value)) return "N/A";
  return `${formatDecimal(value, 0)}/${max}`;
}

function formatLockStatus(value: unknown): string {
  if (typeof value !== "boolean") return "N/A";
  return value ? "Locked" : "Unlocked";
}

function formatKilojoulesWithUnits(joules: unknown): string {
  if (typeof joules !== "number" || Number.isNaN(joules)) return "N/A";
  return `${Math.round(joules / 1000)} kJ`;
}

function formatDecimal(value: unknown, digits = 1): string {
  if (typeof value !== "number" || Number.isNaN(value)) return "N/A";
  return value.toFixed(digits);
}

function formatDecimalWithUnit(
  value: unknown,
  unit: string,
  options: { digits?: number; separator?: string } = {}
): string {
  if (typeof value !== "number" || Number.isNaN(value)) return "N/A";
  const digits = options.digits ?? 1;
  const separator = options.separator ?? " ";
  return `${value.toFixed(digits)}${separator}${unit}`;
}

function formatLeftRightBalance(rightBalance: unknown): string {
  if (typeof rightBalance !== "number" || Number.isNaN(rightBalance)) {
    return "N/A";
  }
  return `${formatDecimal(100 - rightBalance)}/${formatDecimal(rightBalance)}`;
}

function formatRpe(value: unknown): string {
  if (typeof value === "number" && !Number.isNaN(value)) return `${value}/10`;
  return formatRequired(value);
}

function formatFeel(value: unknown): string {
  if (typeof value === "number" && !Number.isNaN(value)) return `${value}/5`;
  return formatRequired(value);
}

function formatIntervalHeader(
  interval: Record<string, unknown>,
  index: number
): string {
  const label = formatRequired(interval.label, `Interval ${index + 1}`);
  const type = formatRequired(interval.type, "Unknown");
  return `[${index + 1}] ${label} (${type})`;
}

function formatIntervalGroupHeader(
  group: Record<string, unknown>,
  index: number
): string {
  const label = formatRequired(group.id, `Group ${index + 1}`);
  const count =
    typeof group.count === "number" && !Number.isNaN(group.count)
      ? ` (${group.count} intervals)`
      : "";
  return `Group: ${label}${count}`;
}

function formatIntervalDuration(record: unknown): string {
  if (typeof record !== "object" || record === null) return "N/A";
  const values = record as Record<string, unknown>;
  const elapsed = formatDecimalWithUnit(values.elapsed_time, "seconds", {
    digits: 0,
  });
  const moving = formatDecimalWithUnit(values.moving_time, "seconds", {
    digits: 0,
  });
  if (elapsed === "N/A") return "N/A";
  return moving === "N/A" ? elapsed : `${elapsed} (moving: ${moving})`;
}

function formatStartEndIndices(record: unknown): string {
  if (typeof record !== "object" || record === null) return "N/A";
  const values = record as Record<string, unknown>;
  if (!hasValue(values.start_index) || !hasValue(values.end_index)) {
    return "N/A";
  }
  return `${formatRequired(values.start_index)}-${formatRequired(values.end_index)}`;
}

function formatPowerWithWeight(
  record: unknown,
  wattsKey: string,
  wattsPerKgKey: string
): string {
  if (typeof record !== "object" || record === null) return "N/A";
  const values = record as Record<string, unknown>;
  const watts = formatDecimalWithUnit(values[wattsKey], "W", { digits: 0 });
  if (watts === "N/A") return "N/A";
  const wattsPerKg = formatDecimalWithUnit(values[wattsPerKgKey], "W/kg");
  return wattsPerKg === "N/A" ? watts : `${watts} (${wattsPerKg})`;
}

function formatPowerZone(record: unknown): string {
  if (typeof record !== "object" || record === null) return "N/A";
  const values = record as Record<string, unknown>;
  if (!hasValue(values.zone)) return "N/A";
  const min = formatDecimalWithUnit(values.zone_min_watts, "W", { digits: 0 });
  const max = formatDecimalWithUnit(values.zone_max_watts, "W", { digits: 0 });
  const range = min !== "N/A" && max !== "N/A" ? ` (${min}-${max})` : "";
  return `${formatRequired(values.zone)}${range}`;
}

function formatWbalRange(record: unknown): string {
  if (typeof record !== "object" || record === null) return "N/A";
  const values = record as Record<string, unknown>;
  return formatLabeledParts([
    ["Start", values.wbal_start, formatDecimal],
    ["End", values.wbal_end, formatDecimal],
  ]);
}

function formatTorqueRange(record: unknown): string {
  if (typeof record !== "object" || record === null) return "N/A";
  const values = record as Record<string, unknown>;
  return formatLabeledParts([
    ["Avg", values.average_torque, formatDecimal],
    ["Min", values.min_torque, formatDecimal],
    ["Max", values.max_torque, formatDecimal],
  ]);
}

function formatHeartRateRange(record: unknown): string {
  if (typeof record !== "object" || record === null) return "N/A";
  const values = record as Record<string, unknown>;
  return formatLabeledParts([
    [
      "Avg",
      values.average_heartrate,
      (value) => formatDecimalWithUnit(value, "bpm", { digits: 0 }),
    ],
    [
      "Min",
      values.min_heartrate,
      (value) => formatDecimalWithUnit(value, "bpm", { digits: 0 }),
    ],
    [
      "Max",
      values.max_heartrate,
      (value) => formatDecimalWithUnit(value, "bpm", { digits: 0 }),
    ],
  ]);
}

function formatSmo2(record: unknown): string {
  if (typeof record !== "object" || record === null) return "N/A";
  const values = record as Record<string, unknown>;
  return formatJoinedValues([
    formatDecimalWithUnit(values.average_smo2, "%", { separator: "" }),
    formatDecimalWithUnit(values.average_smo2_2, "%", { separator: "" }),
  ]);
}

function formatThb(record: unknown): string {
  if (typeof record !== "object" || record === null) return "N/A";
  const values = record as Record<string, unknown>;
  return formatJoinedValues([
    formatDecimal(values.average_thb),
    formatDecimal(values.average_thb_2),
  ]);
}

function formatSpeedRange(record: unknown): string {
  if (typeof record !== "object" || record === null) return "N/A";
  const values = record as Record<string, unknown>;
  return formatLabeledParts([
    [
      "Avg",
      values.average_speed,
      (value) => formatDecimalWithUnit(value, "m/s"),
    ],
    ["Min", values.min_speed, (value) => formatDecimalWithUnit(value, "m/s")],
    ["Max", values.max_speed, (value) => formatDecimalWithUnit(value, "m/s")],
  ]);
}

function formatCadenceRange(record: unknown): string {
  if (typeof record !== "object" || record === null) return "N/A";
  const values = record as Record<string, unknown>;
  return formatLabeledParts([
    [
      "Avg",
      values.average_cadence,
      (value) => formatDecimalWithUnit(value, "rpm"),
    ],
    ["Min", values.min_cadence, (value) => formatDecimalWithUnit(value, "rpm")],
    ["Max", values.max_cadence, (value) => formatDecimalWithUnit(value, "rpm")],
  ]);
}

function formatAltitudeRange(record: unknown): string {
  if (typeof record !== "object" || record === null) return "N/A";
  const values = record as Record<string, unknown>;
  return formatLabeledParts([
    [
      "Min",
      values.min_altitude,
      (value) => formatDecimalWithUnit(value, "meters"),
    ],
    [
      "Max",
      values.max_altitude,
      (value) => formatDecimalWithUnit(value, "meters"),
    ],
  ]);
}

function formatTemperatureSummary(record: unknown): string {
  if (typeof record !== "object" || record === null) return "N/A";
  const values = record as Record<string, unknown>;
  return formatLabeledParts([
    [
      "Average",
      values.average_temp,
      (value) => formatDecimalWithUnit(value, "°C", { separator: "" }),
    ],
    [
      "Weather",
      values.average_weather_temp,
      (value) => formatDecimalWithUnit(value, "°C", { separator: "" }),
    ],
    [
      "Feels like",
      values.average_feels_like,
      (value) => formatDecimalWithUnit(value, "°C", { separator: "" }),
    ],
  ]);
}

function formatWindSummary(record: unknown): string {
  if (typeof record !== "object" || record === null) return "N/A";
  const values = record as Record<string, unknown>;
  return formatLabeledParts([
    [
      "Speed",
      values.average_wind_speed,
      (value) => formatDecimalWithUnit(value, "km/h"),
    ],
    [
      "Gust",
      values.average_wind_gust,
      (value) => formatDecimalWithUnit(value, "km/h"),
    ],
    [
      "Direction",
      values.prevailing_wind_deg,
      (value) =>
        formatDecimalWithUnit(value, "°", { digits: 0, separator: "" }),
    ],
  ]);
}

function formatGroupPowerSummary(record: unknown): string {
  if (typeof record !== "object" || record === null) return "N/A";
  const values = record as Record<string, unknown>;
  return formatLabeledParts([
    [
      "Avg",
      values.average_watts,
      (value) => formatDecimalWithUnit(value, "W", { digits: 0 }),
    ],
    [
      "W/kg",
      values.average_watts_kg,
      (value) => formatDecimalWithUnit(value, "W/kg"),
    ],
    [
      "Max",
      values.max_watts,
      (value) => formatDecimalWithUnit(value, "W", { digits: 0 }),
    ],
    [
      "Weighted Avg",
      values.weighted_average_watts,
      (value) => formatDecimalWithUnit(value, "W", { digits: 0 }),
    ],
    ["Intensity", values.intensity, formatDecimal],
  ]);
}

function formatLabeledParts(
  parts: Array<[string, unknown, (value: unknown) => string]>
): string {
  const formatted = parts
    .map(([label, value, formatter]) => {
      const result = formatter(value);
      return result === "N/A" ? undefined : `${label} ${result}`;
    })
    .filter((value): value is string => value !== undefined);
  return formatted.length ? formatted.join(", ") : "N/A";
}

function formatJoinedValues(values: string[]): string {
  const formatted = values.filter((value) => value !== "N/A");
  return formatted.length ? formatted.join(" / ") : "N/A";
}

/**
 * Format intervals data into a readable string with all available fields.
 */
export function formatIntervals(
  intervalsData: Record<string, unknown>
): string {
  const lines = [
    "Intervals Analysis:",
    ...optionalLines(
      metricLine("ID", intervalsData.id),
      metricLine("Analyzed", intervalsData.analyzed)
    ),
  ];

  if (
    Array.isArray(intervalsData.icu_intervals) &&
    intervalsData.icu_intervals.length > 0
  ) {
    lines.push("", "Individual Intervals:");
    intervalsData.icu_intervals.forEach(
      (interval: Record<string, unknown>, i: number) => {
        lines.push(
          "",
          formatIntervalHeader(interval, i),
          ...optionalLines(
            metricLine("Duration", interval, formatIntervalDuration),
            metricLine("Distance", interval.distance, (value) =>
              formatDecimalWithUnit(value, "meters")
            ),
            metricLine("Start-End Indices", interval, formatStartEndIndices)
          ),
          ...section(
            "Power Metrics",
            optionalLines(
              metricLine("Average Power", interval, (value) =>
                formatPowerWithWeight(
                  value,
                  "average_watts",
                  "average_watts_kg"
                )
              ),
              metricLine("Max Power", interval, (value) =>
                formatPowerWithWeight(value, "max_watts", "max_watts_kg")
              ),
              metricLine(
                "Weighted Avg Power",
                interval.weighted_average_watts,
                (value) => formatDecimalWithUnit(value, "W", { digits: 0 })
              ),
              metricLine("Intensity", interval.intensity, formatDecimal),
              metricLine("Training Load", interval.training_load, (value) =>
                formatDecimal(value, 0)
              ),
              metricLine("Work", interval.joules, formatKilojoulesWithUnits),
              metricLine(
                "Work > FTP",
                interval.joules_above_ftp,
                formatKilojoulesWithUnits
              ),
              metricLine("Power Zone", interval, formatPowerZone),
              metricLine("W' Balance", interval, formatWbalRange),
              metricLine(
                "Avg L/R Balance",
                interval.avg_lr_balance,
                formatLeftRightBalance
              ),
              metricLine("Variability", interval.w5s_variability, (value) =>
                formatDecimal(value, 2)
              ),
              metricLine("Torque", interval, formatTorqueRange)
            )
          ),
          ...section(
            "Heart Rate & Metabolic",
            optionalLines(
              metricLine("Heart Rate", interval, formatHeartRateRange),
              metricLine("Decoupling", interval.decoupling, formatDecimal),
              metricLine("DFA alpha 1", interval.average_dfa_a1, formatDecimal),
              metricLine("Respiration", interval.average_respiration, (value) =>
                formatDecimalWithUnit(value, "breaths/min")
              ),
              metricLine("EPOC", interval.average_epoc, formatDecimal),
              metricLine("SmO2", interval, formatSmo2),
              metricLine("THb", interval, formatThb)
            )
          ),
          ...section(
            "Speed & Cadence",
            optionalLines(
              metricLine("Speed", interval, formatSpeedRange),
              metricLine("GAP", interval.gap, (value) =>
                formatDecimalWithUnit(value, "m/s")
              ),
              metricLine("Cadence", interval, formatCadenceRange),
              metricLine("Stride", interval.average_stride, formatDecimal)
            )
          ),
          ...section(
            "Elevation & Environment",
            optionalLines(
              metricLine(
                "Elevation Gain",
                interval.total_elevation_gain,
                (value) => formatDecimalWithUnit(value, "meters")
              ),
              metricLine("Altitude", interval, formatAltitudeRange),
              metricLine("Gradient", interval.average_gradient, (value) =>
                formatDecimalWithUnit(value, "%", { separator: "" })
              ),
              metricLine("Temperature", interval, formatTemperatureSummary),
              metricLine("Wind", interval, formatWindSummary),
              metricLine("Headwind", interval.headwind_percent, (value) =>
                formatDecimalWithUnit(value, "%", { separator: "" })
              ),
              metricLine("Tailwind", interval.tailwind_percent, (value) =>
                formatDecimalWithUnit(value, "%", { separator: "" })
              )
            )
          )
        );
      }
    );
  }

  if (
    Array.isArray(intervalsData.icu_groups) &&
    intervalsData.icu_groups.length > 0
  ) {
    lines.push("", "Interval Groups:");
    intervalsData.icu_groups.forEach(
      (group: Record<string, unknown>, i: number) => {
        lines.push(
          "",
          formatIntervalGroupHeader(group, i),
          ...optionalLines(
            metricLine("Duration", group, formatIntervalDuration),
            metricLine("Distance", group.distance, (value) =>
              formatDecimalWithUnit(value, "meters")
            ),
            metricLine("Start Index", group.start_index, (value) =>
              formatDecimal(value, 0)
            ),
            metricLine("Power", group, formatGroupPowerSummary),
            metricLine("Heart Rate", group, formatHeartRateRange),
            metricLine("Speed", group, formatSpeedRange),
            metricLine("Cadence", group, formatCadenceRange)
          )
        );
      }
    );
  }

  return lines.join("\n");
}
