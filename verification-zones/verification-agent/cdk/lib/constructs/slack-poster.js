"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.SlackPoster = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const lambda = __importStar(require("aws-cdk-lib/aws-lambda"));
const lambdaEventSources = __importStar(require("aws-cdk-lib/aws-lambda-event-sources"));
const sqs = __importStar(require("aws-cdk-lib/aws-sqs"));
const constructs_1 = require("constructs");
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
const fs = __importStar(require("fs"));
class SlackPoster extends constructs_1.Construct {
    queue;
    function;
    constructor(scope, id, props) {
        super(scope, id);
        const lambdaPath = path.join(__dirname, "../lambda/slack-poster");
        this.queue = new sqs.Queue(this, "SlackPostRequest", {
            queueName: `${props.stackName}-slack-post-request`,
            retentionPeriod: cdk.Duration.days(1),
            visibilityTimeout: cdk.Duration.seconds(60),
        });
        this.function = new lambda.Function(this, "Handler", {
            runtime: lambda.Runtime.PYTHON_3_11,
            handler: "handler.lambda_handler",
            code: lambda.Code.fromAsset(lambdaPath, {
                bundling: {
                    image: lambda.Runtime.PYTHON_3_11.bundlingImage,
                    command: [
                        "bash",
                        "-c",
                        "pip install --no-cache-dir -r requirements.txt -t /asset-output && cp -r . /asset-output",
                    ],
                    local: {
                        tryBundle(outputDir) {
                            try {
                                (0, child_process_1.execSync)("pip --version", { stdio: "pipe" });
                                (0, child_process_1.execSync)(`pip install --no-cache-dir -r ${path.join(lambdaPath, "requirements.txt")} -t ${outputDir} --quiet`, { stdio: "pipe" });
                                const files = fs.readdirSync(lambdaPath);
                                for (const file of files) {
                                    const srcPath = path.join(lambdaPath, file);
                                    const destPath = path.join(outputDir, file);
                                    const stat = fs.statSync(srcPath);
                                    if (stat.isFile()) {
                                        fs.copyFileSync(srcPath, destPath);
                                    }
                                    else if (stat.isDirectory() && file !== "__pycache__") {
                                        fs.cpSync(srcPath, destPath, { recursive: true });
                                    }
                                }
                                return true;
                            }
                            catch {
                                return false;
                            }
                        },
                    },
                },
            }),
            timeout: cdk.Duration.seconds(30),
        });
        this.queue.grantConsumeMessages(this.function);
        this.function.addEventSource(new lambdaEventSources.SqsEventSource(this.queue, { batchSize: 10 }));
    }
}
exports.SlackPoster = SlackPoster;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2xhY2stcG9zdGVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsic2xhY2stcG9zdGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLGlEQUFtQztBQUNuQywrREFBaUQ7QUFDakQseUZBQTJFO0FBQzNFLHlEQUEyQztBQUMzQywyQ0FBdUM7QUFDdkMsMkNBQTZCO0FBQzdCLGlEQUF5QztBQUN6Qyx1Q0FBeUI7QUFtQnpCLE1BQWEsV0FBWSxTQUFRLHNCQUFTO0lBQ3hCLEtBQUssQ0FBYTtJQUNsQixRQUFRLENBQWtCO0lBRTFDLFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBdUI7UUFDL0QsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQztRQUVqQixNQUFNLFVBQVUsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSx3QkFBd0IsQ0FBQyxDQUFDO1FBRWxFLElBQUksQ0FBQyxLQUFLLEdBQUcsSUFBSSxHQUFHLENBQUMsS0FBSyxDQUFDLElBQUksRUFBRSxrQkFBa0IsRUFBRTtZQUNuRCxTQUFTLEVBQUUsR0FBRyxLQUFLLENBQUMsU0FBUyxxQkFBcUI7WUFDbEQsZUFBZSxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztZQUNyQyxpQkFBaUIsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7U0FDNUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLFFBQVEsR0FBRyxJQUFJLE1BQU0sQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLFNBQVMsRUFBRTtZQUNuRCxPQUFPLEVBQUUsTUFBTSxDQUFDLE9BQU8sQ0FBQyxXQUFXO1lBQ25DLE9BQU8sRUFBRSx3QkFBd0I7WUFDakMsSUFBSSxFQUFFLE1BQU0sQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLFVBQVUsRUFBRTtnQkFDdEMsUUFBUSxFQUFFO29CQUNSLEtBQUssRUFBRSxNQUFNLENBQUMsT0FBTyxDQUFDLFdBQVcsQ0FBQyxhQUFhO29CQUMvQyxPQUFPLEVBQUU7d0JBQ1AsTUFBTTt3QkFDTixJQUFJO3dCQUNKLDBGQUEwRjtxQkFDM0Y7b0JBQ0QsS0FBSyxFQUFFO3dCQUNMLFNBQVMsQ0FBQyxTQUFpQjs0QkFDekIsSUFBSSxDQUFDO2dDQUNILElBQUEsd0JBQVEsRUFBQyxlQUFlLEVBQUUsRUFBRSxLQUFLLEVBQUUsTUFBTSxFQUFFLENBQUMsQ0FBQztnQ0FDN0MsSUFBQSx3QkFBUSxFQUNOLGlDQUFpQyxJQUFJLENBQUMsSUFBSSxDQUFDLFVBQVUsRUFBRSxrQkFBa0IsQ0FBQyxPQUFPLFNBQVMsVUFBVSxFQUNwRyxFQUFFLEtBQUssRUFBRSxNQUFNLEVBQUUsQ0FDbEIsQ0FBQztnQ0FDRixNQUFNLEtBQUssR0FBRyxFQUFFLENBQUMsV0FBVyxDQUFDLFVBQVUsQ0FBQyxDQUFDO2dDQUN6QyxLQUFLLE1BQU0sSUFBSSxJQUFJLEtBQUssRUFBRSxDQUFDO29DQUN6QixNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLFVBQVUsRUFBRSxJQUFJLENBQUMsQ0FBQztvQ0FDNUMsTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsSUFBSSxDQUFDLENBQUM7b0NBQzVDLE1BQU0sSUFBSSxHQUFHLEVBQUUsQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLENBQUM7b0NBQ2xDLElBQUksSUFBSSxDQUFDLE1BQU0sRUFBRSxFQUFFLENBQUM7d0NBQ2xCLEVBQUUsQ0FBQyxZQUFZLENBQUMsT0FBTyxFQUFFLFFBQVEsQ0FBQyxDQUFDO29DQUNyQyxDQUFDO3lDQUFNLElBQUksSUFBSSxDQUFDLFdBQVcsRUFBRSxJQUFJLElBQUksS0FBSyxhQUFhLEVBQUUsQ0FBQzt3Q0FDeEQsRUFBRSxDQUFDLE1BQU0sQ0FBQyxPQUFPLEVBQUUsUUFBUSxFQUFFLEVBQUUsU0FBUyxFQUFFLElBQUksRUFBRSxDQUFDLENBQUM7b0NBQ3BELENBQUM7Z0NBQ0gsQ0FBQztnQ0FDRCxPQUFPLElBQUksQ0FBQzs0QkFDZCxDQUFDOzRCQUFDLE1BQU0sQ0FBQztnQ0FDUCxPQUFPLEtBQUssQ0FBQzs0QkFDZixDQUFDO3dCQUNILENBQUM7cUJBQ0Y7aUJBQ0Y7YUFDRixDQUFDO1lBQ0YsT0FBTyxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztTQUNsQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsS0FBSyxDQUFDLG9CQUFvQixDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUMvQyxJQUFJLENBQUMsUUFBUSxDQUFDLGNBQWMsQ0FDMUIsSUFBSSxrQkFBa0IsQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLEtBQUssRUFBRSxFQUFFLFNBQVMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUNyRSxDQUFDO0lBQ0osQ0FBQztDQUNGO0FBN0RELGtDQTZEQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tIFwiYXdzLWNkay1saWJcIjtcbmltcG9ydCAqIGFzIGxhbWJkYSBmcm9tIFwiYXdzLWNkay1saWIvYXdzLWxhbWJkYVwiO1xuaW1wb3J0ICogYXMgbGFtYmRhRXZlbnRTb3VyY2VzIGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtbGFtYmRhLWV2ZW50LXNvdXJjZXNcIjtcbmltcG9ydCAqIGFzIHNxcyBmcm9tIFwiYXdzLWNkay1saWIvYXdzLXNxc1wiO1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSBcImNvbnN0cnVjdHNcIjtcbmltcG9ydCAqIGFzIHBhdGggZnJvbSBcInBhdGhcIjtcbmltcG9ydCB7IGV4ZWNTeW5jIH0gZnJvbSBcImNoaWxkX3Byb2Nlc3NcIjtcbmltcG9ydCAqIGFzIGZzIGZyb20gXCJmc1wiO1xuXG4vKipcbiAqIFNsYWNrIFBvc3RlciBjb25zdHJ1Y3QgKDAxOSk6IFNRUyBxdWV1ZSArIExhbWJkYSBmb3IgcG9zdGluZyBtZXNzYWdlcyB0byBTbGFjay5cbiAqXG4gKiBQdXJwb3NlOiBWZXJpZmljYXRpb24gQWdlbnQgc2VuZHMgcG9zdCByZXF1ZXN0cyB0byB0aGlzIHF1ZXVlOyBMYW1iZGEgY29uc3VtZXMgYW5kIGNhbGxzIFNsYWNrIEFQSS5cbiAqIERlY291cGxlcyBhZ2VudCBmcm9tIFNsYWNrIEFQSSBhbmQgYWxsb3dzIHJldHJpZXMuXG4gKlxuICogUmVzcG9uc2liaWxpdGllczogQ3JlYXRlIFNRUyBxdWV1ZSBhbmQgTGFtYmRhOyBMYW1iZGEgaGFzIFNsYWNrIE9BdXRoIHRva2VuIGFuZCBwb3N0cyB0byBjaGFubmVscy5cbiAqXG4gKiBJbnB1dHM6IFNsYWNrUG9zdGVyUHJvcHMgKHN0YWNrTmFtZSBmb3IgcXVldWUgbmFtaW5nKS5cbiAqXG4gKiBPdXRwdXRzOiBxdWV1ZSwgZnVuY3Rpb24uXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgU2xhY2tQb3N0ZXJQcm9wcyB7XG4gIC8qKiBTdGFjayBuYW1lIGZvciBxdWV1ZSBuYW1pbmcgKi9cbiAgc3RhY2tOYW1lOiBzdHJpbmc7XG59XG5cbmV4cG9ydCBjbGFzcyBTbGFja1Bvc3RlciBleHRlbmRzIENvbnN0cnVjdCB7XG4gIHB1YmxpYyByZWFkb25seSBxdWV1ZTogc3FzLklRdWV1ZTtcbiAgcHVibGljIHJlYWRvbmx5IGZ1bmN0aW9uOiBsYW1iZGEuRnVuY3Rpb247XG5cbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IFNsYWNrUG9zdGVyUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQpO1xuXG4gICAgY29uc3QgbGFtYmRhUGF0aCA9IHBhdGguam9pbihfX2Rpcm5hbWUsIFwiLi4vbGFtYmRhL3NsYWNrLXBvc3RlclwiKTtcblxuICAgIHRoaXMucXVldWUgPSBuZXcgc3FzLlF1ZXVlKHRoaXMsIFwiU2xhY2tQb3N0UmVxdWVzdFwiLCB7XG4gICAgICBxdWV1ZU5hbWU6IGAke3Byb3BzLnN0YWNrTmFtZX0tc2xhY2stcG9zdC1yZXF1ZXN0YCxcbiAgICAgIHJldGVudGlvblBlcmlvZDogY2RrLkR1cmF0aW9uLmRheXMoMSksXG4gICAgICB2aXNpYmlsaXR5VGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoNjApLFxuICAgIH0pO1xuXG4gICAgdGhpcy5mdW5jdGlvbiA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgXCJIYW5kbGVyXCIsIHtcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLlBZVEhPTl8zXzExLFxuICAgICAgaGFuZGxlcjogXCJoYW5kbGVyLmxhbWJkYV9oYW5kbGVyXCIsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQobGFtYmRhUGF0aCwge1xuICAgICAgICBidW5kbGluZzoge1xuICAgICAgICAgIGltYWdlOiBsYW1iZGEuUnVudGltZS5QWVRIT05fM18xMS5idW5kbGluZ0ltYWdlLFxuICAgICAgICAgIGNvbW1hbmQ6IFtcbiAgICAgICAgICAgIFwiYmFzaFwiLFxuICAgICAgICAgICAgXCItY1wiLFxuICAgICAgICAgICAgXCJwaXAgaW5zdGFsbCAtLW5vLWNhY2hlLWRpciAtciByZXF1aXJlbWVudHMudHh0IC10IC9hc3NldC1vdXRwdXQgJiYgY3AgLXIgLiAvYXNzZXQtb3V0cHV0XCIsXG4gICAgICAgICAgXSxcbiAgICAgICAgICBsb2NhbDoge1xuICAgICAgICAgICAgdHJ5QnVuZGxlKG91dHB1dERpcjogc3RyaW5nKTogYm9vbGVhbiB7XG4gICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgZXhlY1N5bmMoXCJwaXAgLS12ZXJzaW9uXCIsIHsgc3RkaW86IFwicGlwZVwiIH0pO1xuICAgICAgICAgICAgICAgIGV4ZWNTeW5jKFxuICAgICAgICAgICAgICAgICAgYHBpcCBpbnN0YWxsIC0tbm8tY2FjaGUtZGlyIC1yICR7cGF0aC5qb2luKGxhbWJkYVBhdGgsIFwicmVxdWlyZW1lbnRzLnR4dFwiKX0gLXQgJHtvdXRwdXREaXJ9IC0tcXVpZXRgLFxuICAgICAgICAgICAgICAgICAgeyBzdGRpbzogXCJwaXBlXCIgfVxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgY29uc3QgZmlsZXMgPSBmcy5yZWFkZGlyU3luYyhsYW1iZGFQYXRoKTtcbiAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IGZpbGUgb2YgZmlsZXMpIHtcbiAgICAgICAgICAgICAgICAgIGNvbnN0IHNyY1BhdGggPSBwYXRoLmpvaW4obGFtYmRhUGF0aCwgZmlsZSk7XG4gICAgICAgICAgICAgICAgICBjb25zdCBkZXN0UGF0aCA9IHBhdGguam9pbihvdXRwdXREaXIsIGZpbGUpO1xuICAgICAgICAgICAgICAgICAgY29uc3Qgc3RhdCA9IGZzLnN0YXRTeW5jKHNyY1BhdGgpO1xuICAgICAgICAgICAgICAgICAgaWYgKHN0YXQuaXNGaWxlKCkpIHtcbiAgICAgICAgICAgICAgICAgICAgZnMuY29weUZpbGVTeW5jKHNyY1BhdGgsIGRlc3RQYXRoKTtcbiAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoc3RhdC5pc0RpcmVjdG9yeSgpICYmIGZpbGUgIT09IFwiX19weWNhY2hlX19cIikge1xuICAgICAgICAgICAgICAgICAgICBmcy5jcFN5bmMoc3JjUGF0aCwgZGVzdFBhdGgsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICAgfSBjYXRjaCB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICB9KSxcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDMwKSxcbiAgICB9KTtcblxuICAgIHRoaXMucXVldWUuZ3JhbnRDb25zdW1lTWVzc2FnZXModGhpcy5mdW5jdGlvbik7XG4gICAgdGhpcy5mdW5jdGlvbi5hZGRFdmVudFNvdXJjZShcbiAgICAgIG5ldyBsYW1iZGFFdmVudFNvdXJjZXMuU3FzRXZlbnRTb3VyY2UodGhpcy5xdWV1ZSwgeyBiYXRjaFNpemU6IDEwIH0pXG4gICAgKTtcbiAgfVxufVxuIl19