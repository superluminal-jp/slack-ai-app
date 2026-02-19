/**
 * Generic configuration file loader for CDK zone apps.
 *
 * Provides utility functions for loading and merging JSON configuration files.
 * Each zone's cdk-config.ts uses these to implement zone-specific config loading.
 *
 * @module platform/tooling/src/utils/config-loader
 */

import * as fs from "fs";
import * as path from "path";

/**
 * Load JSON configuration file.
 *
 * @param filePath - Absolute path to the JSON configuration file
 * @returns Parsed configuration object, or null if file does not exist
 * @throws Error if file exists but cannot be parsed
 */
export function loadJsonFile(filePath: string): Record<string, unknown> | null {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const content = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(content) as Record<string, unknown>;
  } catch (error) {
    throw new Error(
      `Failed to load configuration file ${path.basename(filePath)}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * Merge multiple configuration objects (later configs override earlier ones).
 *
 * @param configs - Configuration objects to merge; null values are skipped
 * @returns Merged configuration object
 */
export function mergeConfigs(
  ...configs: (Record<string, unknown> | null)[]
): Record<string, unknown> {
  const merged: Record<string, unknown> = {};
  for (const config of configs) {
    if (config) {
      Object.assign(merged, config);
    }
  }
  return merged;
}
