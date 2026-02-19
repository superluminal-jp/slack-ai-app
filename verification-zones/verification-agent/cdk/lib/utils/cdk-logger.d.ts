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
export declare function log(level: LogLevel, message: string, options?: LogEntryOptions): void;
/** Convenience: log at info level with optional phase/context */
export declare function logInfo(message: string, options?: LogEntryOptions): void;
/** Convenience: log at warn level with optional phase/context */
export declare function logWarn(message: string, options?: LogEntryOptions): void;
/** Convenience: log at error level with optional phase/context */
export declare function logError(message: string, options?: LogEntryOptions): void;
/** Convenience: log at debug level with optional phase/context */
export declare function logDebug(message: string, options?: LogEntryOptions): void;
