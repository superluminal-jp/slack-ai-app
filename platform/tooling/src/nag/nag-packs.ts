/**
 * CDK NAG security pack utilities.
 *
 * Centralizes cdk-nag application so all zones call a single function
 * instead of duplicating the import and Aspects pattern across 6 bin/cdk.ts files.
 *
 * @module cdk/tooling/nag/nag-packs
 */

import * as cdk from "aws-cdk-lib";
import { AwsSolutionsChecks, NagSuppressions } from "cdk-nag";

export { NagSuppressions };

/**
 * Apply the AWS Solutions NagPack to the CDK app.
 * Call this AFTER stack creation and BEFORE app.synth().
 * Causes cdk synth to exit non-zero on any unresolved violation.
 *
 * @param app - The CDK App instance
 */
export function applyNagPacks(app: cdk.App): void {
  cdk.Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }));
}
