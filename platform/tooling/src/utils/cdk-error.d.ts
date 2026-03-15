/**
 * User-facing error type for CDK app validation and deployment failures.
 * Conforms to error-report contract: message, cause, resourceId, remediation, source.
 * Caller must ensure no secrets or PII in any field.
 *
 * @module cdk/lib/utils/cdk-error
 */
export type ErrorSource = "app" | "stack" | "construct" | "toolkit";
export interface CdkErrorOptions {
    /** Clear, actionable description of the failure; no secrets */
    message: string;
    /** Short technical cause; safe to display */
    cause?: string;
    /** Construct path or logical id for locating the failure (FR-007) */
    resourceId?: string;
    /** Suggested next step where feasible */
    remediation?: string;
    /** Origin of the error */
    source?: ErrorSource;
    /** Optional underlying error (preserved for debugging; do not expose raw message if it may contain secrets) */
    causeError?: Error;
}
/**
 * Error class for CDK entry-point and validation failures.
 * Displays user-facing message, optional remediation, and resource context.
 * Do not include secrets in message, cause, or remediation.
 */
export declare class CdkError extends Error {
    readonly cause?: string;
    readonly resourceId?: string;
    readonly remediation?: string;
    readonly source?: ErrorSource;
    constructor(options: CdkErrorOptions);
    private static formatDisplayMessage;
    /**
     * Create and throw a CdkError. Use for entry-point validation (e.g. invalid env, config).
     * Ensures a single, consistent error shape for operators.
     */
    static throw(options: CdkErrorOptions): never;
}
