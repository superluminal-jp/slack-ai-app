/**
 * Tests for CdkConfig types and Zod schema validation.
 * Covers ChannelIdEntry union type, autoReplyChannelIds, and mentionChannelIds schema.
 */

import { validateConfig } from "../lib/types/cdk-config";

const baseConfig = {
  awsRegion: "ap-northeast-1",
  bedrockModelId: "jp.anthropic.claude-sonnet-4-5-20250929-v1:0",
  deploymentEnv: "dev" as const,
  verificationStackName: "SlackAI-Verification",
  verificationAccountId: "123456789012",
  executionAccountId: "123456789012",
};

describe("CdkConfig ChannelIdEntry schema", () => {
  describe("autoReplyChannelIds", () => {
    it("accepts plain string IDs", () => {
      const config = validateConfig({ ...baseConfig, autoReplyChannelIds: ["C001", "C002"] });
      expect(config.autoReplyChannelIds).toEqual(["C001", "C002"]);
    });

    it("accepts object-format entries with id and label", () => {
      const config = validateConfig({
        ...baseConfig,
        autoReplyChannelIds: [{ id: "C001", label: "#general" }],
      });
      expect(config.autoReplyChannelIds).toEqual([{ id: "C001", label: "#general" }]);
    });

    it("accepts mixed array of strings and objects", () => {
      const config = validateConfig({
        ...baseConfig,
        autoReplyChannelIds: ["C001", { id: "C002", label: "#ops" }],
      });
      expect(config.autoReplyChannelIds).toEqual(["C001", { id: "C002", label: "#ops" }]);
    });

    it("accepts undefined (optional field)", () => {
      const config = validateConfig({ ...baseConfig });
      expect(config.autoReplyChannelIds).toBeUndefined();
    });

    it("accepts empty array", () => {
      const config = validateConfig({ ...baseConfig, autoReplyChannelIds: [] });
      expect(config.autoReplyChannelIds).toEqual([]);
    });

    it("accepts object-format entries with id only (no label)", () => {
      const config = validateConfig({
        ...baseConfig,
        autoReplyChannelIds: [{ id: "C012345" }],
      });
      expect(config.autoReplyChannelIds).toEqual([{ id: "C012345" }]);
    });
  });

  describe("mentionChannelIds", () => {
    it("accepts plain string IDs", () => {
      const config = validateConfig({ ...baseConfig, mentionChannelIds: ["C003"] });
      expect(config.mentionChannelIds).toEqual(["C003"]);
    });

    it("accepts object-format entries", () => {
      const config = validateConfig({
        ...baseConfig,
        mentionChannelIds: [{ id: "C003", label: "#ai-bot" }],
      });
      expect(config.mentionChannelIds).toEqual([{ id: "C003", label: "#ai-bot" }]);
    });

    it("accepts mixed array", () => {
      const config = validateConfig({
        ...baseConfig,
        mentionChannelIds: ["C001", { id: "C002", label: "#engineering" }],
      });
      expect(config.mentionChannelIds).toEqual(["C001", { id: "C002", label: "#engineering" }]);
    });

    it("accepts object-format entries with id only (no label)", () => {
      const config = validateConfig({
        ...baseConfig,
        mentionChannelIds: [{ id: "C012345" }],
      });
      expect(config.mentionChannelIds).toEqual([{ id: "C012345" }]);
    });

    it("accepts undefined (optional field)", () => {
      const config = validateConfig({ ...baseConfig });
      expect(config.mentionChannelIds).toBeUndefined();
    });
  });

  describe("backward compatibility", () => {
    it("plain string[] arrays still validate correctly", () => {
      const config = validateConfig({
        ...baseConfig,
        autoReplyChannelIds: ["C001", "C002", "C003"],
        mentionChannelIds: ["C004"],
      });
      expect(config.autoReplyChannelIds).toEqual(["C001", "C002", "C003"]);
      expect(config.mentionChannelIds).toEqual(["C004"]);
    });
  });
});
