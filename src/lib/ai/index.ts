import type { AIProvider } from "@/lib/types";
import { MockConflictAIProvider } from "@/lib/ai/mock";
import { OpenAIConflictAIProvider } from "@/lib/ai/openai";

let mockProvider: MockConflictAIProvider | null = null;
let liveProvider: OpenAIConflictAIProvider | null = null;

/**
 * Provider factory. The mock engine is the default so the product works with
 * zero credentials; setting OPENAI_API_KEY transparently upgrades to the live
 * provider behind the same interface.
 */
export function getAIProvider(): AIProvider {
  if (process.env.OPENAI_API_KEY) {
    if (!liveProvider) liveProvider = new OpenAIConflictAIProvider();
    return liveProvider;
  }
  if (!mockProvider) mockProvider = new MockConflictAIProvider();
  return mockProvider;
}
