import { IConstruct } from "constructs";
import { IAspect, Annotations } from "aws-cdk-lib";
import * as logs from "aws-cdk-lib/aws-logs";

/**
 * Aspect that validates Log Groups have explicit retention set.
 *
 * Purpose: Encourages log lifecycle management by surfacing a synthesis-time warning
 * when a CloudFormation Log Group does not set retentionInDays (default is "never expire").
 * Use Annotations so operators see the warning in `cdk synth` output and can fix the construct.
 *
 * Apply to the app or a stack: Aspects.of(app).add(new LogRetentionAspect())
 * For stricter policy, switch addWarning to addError to block synthesis until retention is set.
 */
export class LogRetentionAspect implements IAspect {
  visit(node: IConstruct): void {
    if (node instanceof logs.CfnLogGroup) {
      if (node.retentionInDays === undefined) {
        Annotations.of(node).addWarning(
          "Log group has no retention set; logs will be retained indefinitely. " +
            "Set retentionInDays (e.g. via LogGroupProps.retention) for lifecycle management."
        );
      }
    }
  }
}
