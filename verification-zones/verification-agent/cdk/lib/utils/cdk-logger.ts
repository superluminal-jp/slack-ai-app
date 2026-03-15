/**
 * Structured logging helper for CDK app lifecycle.
 * Emits log entries per log-event contract: level, message, optional phase/context/timestamp.
 * Must not contain secrets; caller is responsible for omitting sensitive data.
 *
 * @module cdk/lib/utils/cdk-logger
 */

export type LogLevel = "info" | "warn" | "error" | "debug";

export interface LogEntryOptions {
  /** Lifecycle phase, e.g. config, synthesis, stack, construct */
  phase?: string;
  /** Optional key-value context (e.g. stackName, constructId). Must not contain secrets. */
  context?: Record<string, unknown>;
  /** ISO 8601 timestamp; defaults to now if omitted */
  timestamp?: string;
}

/**
 * Emit a structured log entry to stdout (info/debug) or stderr (warn/error).
 * Format: [LEVEL] [phase] message [context as JSON]
 * Safe for redirect and CI; does not assume TTY.
 *
 * @param level - Severity (info, warn, error, debug)
 * @param message - Human-readable message; must not contain secrets or PII
 * @param options - Optional phase, context, timestamp
 */
export function log(
  level: LogLevel,
  message: string,
  options?: LogEntryOptions
): void {
  const timestamp = options?.timestamp ?? new Date().toISOString();
  const phasePart = options?.phase ? ` [${options.phase}]` : "";
  const prefix = `[${level.toUpperCase()}]${phasePart}`;
  const line = `${prefix} ${message}`;
  const contextJson =
    options?.context && Object.keys(options.context).length > 0
      ? ` ${JSON.stringify(options.context)}`
      : "";

  const fullLine = `${line}${contextJson}`;

  switch (level) {
    case "error":
      console.error(fullLine);
      break;
    case "warn":
      console.warn(fullLine);
      break;
    case "info":
    case "debug":
    default:
      console.log(fullLine);
      break;
  }
}

/** Convenience: log at info level with optional phase/context */
export function logInfo(
  message: string,
  options?: LogEntryOptions
): void {
  log("info", message, options);
}

/** Convenience: log at warn level with optional phase/context */
export function logWarn(
  message: string,
  options?: LogEntryOptions
): void {
  log("warn", message, options);
}

/** Convenience: log at error level with optional phase/context */
export function logError(
  message: string,
  options?: LogEntryOptions
): void {
  log("error", message, options);
}

/** Convenience: log at debug level with optional phase/context */
export function logDebug(
  message: string,
  options?: LogEntryOptions
): void {
  log("debug", message, options);
}
