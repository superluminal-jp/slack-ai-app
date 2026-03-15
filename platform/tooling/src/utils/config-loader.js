"use strict";
/**
 * Generic configuration file loader for CDK zone apps.
 *
 * Provides utility functions for loading and merging JSON configuration files.
 * Each zone's cdk-config.ts uses these to implement zone-specific config loading.
 *
 * @module platform/tooling/src/utils/config-loader
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
exports.loadJsonFile = loadJsonFile;
exports.mergeConfigs = mergeConfigs;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
/**
 * Load JSON configuration file.
 *
 * @param filePath - Absolute path to the JSON configuration file
 * @returns Parsed configuration object, or null if file does not exist
 * @throws Error if file exists but cannot be parsed
 */
function loadJsonFile(filePath) {
    try {
        if (!fs.existsSync(filePath)) {
            return null;
        }
        const content = fs.readFileSync(filePath, "utf-8");
        return JSON.parse(content);
    }
    catch (error) {
        throw new Error(`Failed to load configuration file ${path.basename(filePath)}: ${error instanceof Error ? error.message : String(error)}`);
    }
}
/**
 * Merge multiple configuration objects (later configs override earlier ones).
 *
 * @param configs - Configuration objects to merge; null values are skipped
 * @returns Merged configuration object
 */
function mergeConfigs(...configs) {
    const merged = {};
    for (const config of configs) {
        if (config) {
            Object.assign(merged, config);
        }
    }
    return merged;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29uZmlnLWxvYWRlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImNvbmZpZy1sb2FkZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Ozs7O0dBT0c7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBWUgsb0NBY0M7QUFRRCxvQ0FVQztBQTFDRCx1Q0FBeUI7QUFDekIsMkNBQTZCO0FBRTdCOzs7Ozs7R0FNRztBQUNILFNBQWdCLFlBQVksQ0FBQyxRQUFnQjtJQUMzQyxJQUFJLENBQUM7UUFDSCxJQUFJLENBQUMsRUFBRSxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDO1lBQzdCLE9BQU8sSUFBSSxDQUFDO1FBQ2QsQ0FBQztRQUNELE1BQU0sT0FBTyxHQUFHLEVBQUUsQ0FBQyxZQUFZLENBQUMsUUFBUSxFQUFFLE9BQU8sQ0FBQyxDQUFDO1FBQ25ELE9BQU8sSUFBSSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQTRCLENBQUM7SUFDeEQsQ0FBQztJQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7UUFDZixNQUFNLElBQUksS0FBSyxDQUNiLHFDQUFxQyxJQUFJLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxLQUMxRCxLQUFLLFlBQVksS0FBSyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUN2RCxFQUFFLENBQ0gsQ0FBQztJQUNKLENBQUM7QUFDSCxDQUFDO0FBRUQ7Ozs7O0dBS0c7QUFDSCxTQUFnQixZQUFZLENBQzFCLEdBQUcsT0FBMkM7SUFFOUMsTUFBTSxNQUFNLEdBQTRCLEVBQUUsQ0FBQztJQUMzQyxLQUFLLE1BQU0sTUFBTSxJQUFJLE9BQU8sRUFBRSxDQUFDO1FBQzdCLElBQUksTUFBTSxFQUFFLENBQUM7WUFDWCxNQUFNLENBQUMsTUFBTSxDQUFDLE1BQU0sRUFBRSxNQUFNLENBQUMsQ0FBQztRQUNoQyxDQUFDO0lBQ0gsQ0FBQztJQUNELE9BQU8sTUFBTSxDQUFDO0FBQ2hCLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIEdlbmVyaWMgY29uZmlndXJhdGlvbiBmaWxlIGxvYWRlciBmb3IgQ0RLIHpvbmUgYXBwcy5cbiAqXG4gKiBQcm92aWRlcyB1dGlsaXR5IGZ1bmN0aW9ucyBmb3IgbG9hZGluZyBhbmQgbWVyZ2luZyBKU09OIGNvbmZpZ3VyYXRpb24gZmlsZXMuXG4gKiBFYWNoIHpvbmUncyBjZGstY29uZmlnLnRzIHVzZXMgdGhlc2UgdG8gaW1wbGVtZW50IHpvbmUtc3BlY2lmaWMgY29uZmlnIGxvYWRpbmcuXG4gKlxuICogQG1vZHVsZSBwbGF0Zm9ybS90b29saW5nL3NyYy91dGlscy9jb25maWctbG9hZGVyXG4gKi9cblxuaW1wb3J0ICogYXMgZnMgZnJvbSBcImZzXCI7XG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gXCJwYXRoXCI7XG5cbi8qKlxuICogTG9hZCBKU09OIGNvbmZpZ3VyYXRpb24gZmlsZS5cbiAqXG4gKiBAcGFyYW0gZmlsZVBhdGggLSBBYnNvbHV0ZSBwYXRoIHRvIHRoZSBKU09OIGNvbmZpZ3VyYXRpb24gZmlsZVxuICogQHJldHVybnMgUGFyc2VkIGNvbmZpZ3VyYXRpb24gb2JqZWN0LCBvciBudWxsIGlmIGZpbGUgZG9lcyBub3QgZXhpc3RcbiAqIEB0aHJvd3MgRXJyb3IgaWYgZmlsZSBleGlzdHMgYnV0IGNhbm5vdCBiZSBwYXJzZWRcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGxvYWRKc29uRmlsZShmaWxlUGF0aDogc3RyaW5nKTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfCBudWxsIHtcbiAgdHJ5IHtcbiAgICBpZiAoIWZzLmV4aXN0c1N5bmMoZmlsZVBhdGgpKSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG4gICAgY29uc3QgY29udGVudCA9IGZzLnJlYWRGaWxlU3luYyhmaWxlUGF0aCwgXCJ1dGYtOFwiKTtcbiAgICByZXR1cm4gSlNPTi5wYXJzZShjb250ZW50KSBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICBgRmFpbGVkIHRvIGxvYWQgY29uZmlndXJhdGlvbiBmaWxlICR7cGF0aC5iYXNlbmFtZShmaWxlUGF0aCl9OiAke1xuICAgICAgICBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFN0cmluZyhlcnJvcilcbiAgICAgIH1gXG4gICAgKTtcbiAgfVxufVxuXG4vKipcbiAqIE1lcmdlIG11bHRpcGxlIGNvbmZpZ3VyYXRpb24gb2JqZWN0cyAobGF0ZXIgY29uZmlncyBvdmVycmlkZSBlYXJsaWVyIG9uZXMpLlxuICpcbiAqIEBwYXJhbSBjb25maWdzIC0gQ29uZmlndXJhdGlvbiBvYmplY3RzIHRvIG1lcmdlOyBudWxsIHZhbHVlcyBhcmUgc2tpcHBlZFxuICogQHJldHVybnMgTWVyZ2VkIGNvbmZpZ3VyYXRpb24gb2JqZWN0XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBtZXJnZUNvbmZpZ3MoXG4gIC4uLmNvbmZpZ3M6IChSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB8IG51bGwpW11cbik6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IHtcbiAgY29uc3QgbWVyZ2VkOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiA9IHt9O1xuICBmb3IgKGNvbnN0IGNvbmZpZyBvZiBjb25maWdzKSB7XG4gICAgaWYgKGNvbmZpZykge1xuICAgICAgT2JqZWN0LmFzc2lnbihtZXJnZWQsIGNvbmZpZyk7XG4gICAgfVxuICB9XG4gIHJldHVybiBtZXJnZWQ7XG59XG4iXX0=