"use strict";
/**
 * Resolve an agent zone's `src/` directory (Docker build context) from a CDK construct file path.
 *
 * Constructs live under `cdk/lib/constructs/`; three levels up is the zone root, then `src/`.
 * If that path has no Dockerfile (e.g. unexpected __dirname), falls back to `../src` from cwd
 * when the current working directory is the zone's `cdk/` folder (typical for `cdk deploy`).
 */
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
exports.resolveZoneSrcDir = resolveZoneSrcDir;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
function resolveZoneSrcDir(constructDir) {
    const fromConstruct = path.resolve(constructDir, "..", "..", "..", "src");
    if (fs.existsSync(path.join(fromConstruct, "Dockerfile"))) {
        return fromConstruct;
    }
    const cwd = process.cwd();
    if (path.basename(cwd) === "cdk") {
        const fromCwd = path.resolve(cwd, "..", "src");
        if (fs.existsSync(path.join(fromCwd, "Dockerfile"))) {
            return fromCwd;
        }
    }
    const tried = [path.join(fromConstruct, "Dockerfile")];
    if (path.basename(cwd) === "cdk") {
        tried.push(path.join(path.resolve(cwd, "..", "src"), "Dockerfile"));
    }
    throw new Error(`Agent Dockerfile not found. CDK needs <zone>/src/Dockerfile. Tried:\n  ${tried.join("\n  ")}\n` +
        "Use a full git clone (not sparse), confirm the file exists on disk, and run deploy from the repo or with cwd on the zone's cdk/ directory.");
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVzb2x2ZS16b25lLXNyYy1kaXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJyZXNvbHZlLXpvbmUtc3JjLWRpci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7OztHQU1HOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUtILDhDQXVCQztBQTFCRCx1Q0FBeUI7QUFDekIsMkNBQTZCO0FBRTdCLFNBQWdCLGlCQUFpQixDQUFDLFlBQW9CO0lBQ3BELE1BQU0sYUFBYSxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsWUFBWSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLEtBQUssQ0FBQyxDQUFDO0lBQzFFLElBQUksRUFBRSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLGFBQWEsRUFBRSxZQUFZLENBQUMsQ0FBQyxFQUFFLENBQUM7UUFDMUQsT0FBTyxhQUFhLENBQUM7SUFDdkIsQ0FBQztJQUVELE1BQU0sR0FBRyxHQUFHLE9BQU8sQ0FBQyxHQUFHLEVBQUUsQ0FBQztJQUMxQixJQUFJLElBQUksQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLEtBQUssS0FBSyxFQUFFLENBQUM7UUFDakMsTUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxHQUFHLEVBQUUsSUFBSSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQy9DLElBQUksRUFBRSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sRUFBRSxZQUFZLENBQUMsQ0FBQyxFQUFFLENBQUM7WUFDcEQsT0FBTyxPQUFPLENBQUM7UUFDakIsQ0FBQztJQUNILENBQUM7SUFFRCxNQUFNLEtBQUssR0FBRyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsYUFBYSxFQUFFLFlBQVksQ0FBQyxDQUFDLENBQUM7SUFDdkQsSUFBSSxJQUFJLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxLQUFLLEtBQUssRUFBRSxDQUFDO1FBQ2pDLEtBQUssQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLEdBQUcsRUFBRSxJQUFJLEVBQUUsS0FBSyxDQUFDLEVBQUUsWUFBWSxDQUFDLENBQUMsQ0FBQztJQUN0RSxDQUFDO0lBRUQsTUFBTSxJQUFJLEtBQUssQ0FDYiwwRUFBMEUsS0FBSyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSTtRQUM5Riw0SUFBNEksQ0FDL0ksQ0FBQztBQUNKLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIFJlc29sdmUgYW4gYWdlbnQgem9uZSdzIGBzcmMvYCBkaXJlY3RvcnkgKERvY2tlciBidWlsZCBjb250ZXh0KSBmcm9tIGEgQ0RLIGNvbnN0cnVjdCBmaWxlIHBhdGguXG4gKlxuICogQ29uc3RydWN0cyBsaXZlIHVuZGVyIGBjZGsvbGliL2NvbnN0cnVjdHMvYDsgdGhyZWUgbGV2ZWxzIHVwIGlzIHRoZSB6b25lIHJvb3QsIHRoZW4gYHNyYy9gLlxuICogSWYgdGhhdCBwYXRoIGhhcyBubyBEb2NrZXJmaWxlIChlLmcuIHVuZXhwZWN0ZWQgX19kaXJuYW1lKSwgZmFsbHMgYmFjayB0byBgLi4vc3JjYCBmcm9tIGN3ZFxuICogd2hlbiB0aGUgY3VycmVudCB3b3JraW5nIGRpcmVjdG9yeSBpcyB0aGUgem9uZSdzIGBjZGsvYCBmb2xkZXIgKHR5cGljYWwgZm9yIGBjZGsgZGVwbG95YCkuXG4gKi9cblxuaW1wb3J0ICogYXMgZnMgZnJvbSBcImZzXCI7XG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gXCJwYXRoXCI7XG5cbmV4cG9ydCBmdW5jdGlvbiByZXNvbHZlWm9uZVNyY0Rpcihjb25zdHJ1Y3REaXI6IHN0cmluZyk6IHN0cmluZyB7XG4gIGNvbnN0IGZyb21Db25zdHJ1Y3QgPSBwYXRoLnJlc29sdmUoY29uc3RydWN0RGlyLCBcIi4uXCIsIFwiLi5cIiwgXCIuLlwiLCBcInNyY1wiKTtcbiAgaWYgKGZzLmV4aXN0c1N5bmMocGF0aC5qb2luKGZyb21Db25zdHJ1Y3QsIFwiRG9ja2VyZmlsZVwiKSkpIHtcbiAgICByZXR1cm4gZnJvbUNvbnN0cnVjdDtcbiAgfVxuXG4gIGNvbnN0IGN3ZCA9IHByb2Nlc3MuY3dkKCk7XG4gIGlmIChwYXRoLmJhc2VuYW1lKGN3ZCkgPT09IFwiY2RrXCIpIHtcbiAgICBjb25zdCBmcm9tQ3dkID0gcGF0aC5yZXNvbHZlKGN3ZCwgXCIuLlwiLCBcInNyY1wiKTtcbiAgICBpZiAoZnMuZXhpc3RzU3luYyhwYXRoLmpvaW4oZnJvbUN3ZCwgXCJEb2NrZXJmaWxlXCIpKSkge1xuICAgICAgcmV0dXJuIGZyb21Dd2Q7XG4gICAgfVxuICB9XG5cbiAgY29uc3QgdHJpZWQgPSBbcGF0aC5qb2luKGZyb21Db25zdHJ1Y3QsIFwiRG9ja2VyZmlsZVwiKV07XG4gIGlmIChwYXRoLmJhc2VuYW1lKGN3ZCkgPT09IFwiY2RrXCIpIHtcbiAgICB0cmllZC5wdXNoKHBhdGguam9pbihwYXRoLnJlc29sdmUoY3dkLCBcIi4uXCIsIFwic3JjXCIpLCBcIkRvY2tlcmZpbGVcIikpO1xuICB9XG5cbiAgdGhyb3cgbmV3IEVycm9yKFxuICAgIGBBZ2VudCBEb2NrZXJmaWxlIG5vdCBmb3VuZC4gQ0RLIG5lZWRzIDx6b25lPi9zcmMvRG9ja2VyZmlsZS4gVHJpZWQ6XFxuICAke3RyaWVkLmpvaW4oXCJcXG4gIFwiKX1cXG5gICtcbiAgICAgIFwiVXNlIGEgZnVsbCBnaXQgY2xvbmUgKG5vdCBzcGFyc2UpLCBjb25maXJtIHRoZSBmaWxlIGV4aXN0cyBvbiBkaXNrLCBhbmQgcnVuIGRlcGxveSBmcm9tIHRoZSByZXBvIG9yIHdpdGggY3dkIG9uIHRoZSB6b25lJ3MgY2RrLyBkaXJlY3RvcnkuXCIsXG4gICk7XG59XG4iXX0=