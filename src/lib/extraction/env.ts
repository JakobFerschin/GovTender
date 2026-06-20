import "dotenv/config";

/**
 * Typed, lazily-evaluated view of the environment variables the extraction
 * pipeline reads at runtime.
 *
 * IMPORTANT — "Non-LLM First": these values are resolved lazily via getters.
 * Importing this module NEVER throws, even when MISTRAL_API_KEY is absent, so
 * the deterministic path (and the keyless E2E test) can load it freely. The
 * key is only demanded when an actual Mistral call is attempted.
 */
function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(
      `Missing required env var "${name}". Copy .env.example to .env and fill it in.`,
    );
  }
  return value.trim();
}

function optional(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.trim() !== "" ? value.trim() : fallback;
}

export const env = {
  /** Lazily throws only when an LLM call is actually made. */
  get mistralApiKey(): string {
    return required("MISTRAL_API_KEY");
  },
  get mistralModel(): string {
    return optional("MISTRAL_MODEL", "mistral-small-latest");
  },
  get mistralEmbeddingModel(): string {
    return optional("MISTRAL_EMBEDDING_MODEL", "mistral-embed");
  },
} as const;
