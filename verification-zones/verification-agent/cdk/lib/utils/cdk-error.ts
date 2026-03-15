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
export class CdkError extends Error {
  readonly cause?: string;
  readonly resourceId?: string;
  readonly remediation?: string;
  readonly source?: ErrorSource;

  constructor(options: CdkErrorOptions) {
    const displayMessage = CdkError.formatDisplayMessage(options);
    super(displayMessage, options.causeError ? { cause: options.causeError } : undefined);
    this.name = "CdkError";
    this.cause = options.cause;
    this.resourceId = options.resourceId;
    this.remediation = options.remediation;
    this.source = options.source;
    Object.setPrototypeOf(this, CdkError.prototype);
  }

  private static formatDisplayMessage(options: CdkErrorOptions): string {
    const parts: string[] = [options.message];
    if (options.remediation) {
      parts.push(`Remediation: ${options.remediation}`);
    }
    if (options.resourceId) {
      parts.push(`Resource: ${options.resourceId}`);
    }
    if (options.cause) {
      const causeStr = options.cause;
      if (!parts.some((p) => p.includes(causeStr))) {
        parts.push(`Cause: ${causeStr}`);
      }
    }
    return parts.join(". ");
  }

  /**
   * Create and throw a CdkError. Use for entry-point validation (e.g. invalid env, config).
   * Ensures a single, consistent error shape for operators.
   */
  static throw(options: CdkErrorOptions): never {
    throw new CdkError(options);
  }
}
