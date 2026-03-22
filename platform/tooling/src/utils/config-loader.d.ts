/**
 * Generic configuration file loader for CDK zone apps.
 *
 * Provides utility functions for loading and merging JSON configuration files.
 * Each zone's cdk-config.ts uses these to implement zone-specific config loading.
 *
 * @module platform/tooling/src/utils/config-loader
 */
/**
 * Load JSON configuration file.
 *
 * @param filePath - Absolute path to the JSON configuration file
 * @returns Parsed configuration object, or null if file does not exist
 * @throws Error if file exists but cannot be parsed
 */
export declare function loadJsonFile(filePath: string): Record<string, unknown> | null;
/**
 * Merge multiple configuration objects (later configs override earlier ones).
 *
 * @param configs - Configuration objects to merge; null values are skipped
 * @returns Merged configuration object
 */
export declare function mergeConfigs(...configs: (Record<string, unknown> | null)[]): Record<string, unknown>;
//# sourceMappingURL=config-loader.d.ts.map