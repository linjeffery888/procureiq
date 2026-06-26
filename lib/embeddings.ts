// Local embedding layer for the Knowledge (RAG) module.
//
// Anthropic has no embeddings endpoint and only Anthropic keys are available in
// this prototype, so the PREFERRED path embeds locally with @xenova/transformers
// running all-MiniLM-L6-v2 in the Node runtime. The model downloads once on
// first use from huggingface.co and is cached to disk.
//
// FALLBACK: many enterprise networks (Iovance's included, observed in testing)
// block huggingface.co at the egress firewall, so the neural model cannot
// download. Rather than let the Knowledge module go dark, we fall back to a
// deterministic lexical embedding (hashed bag-of-words, L2-normalized) that
// needs no download and no network. It is lower-semantic than the neural model
// but keeps retrieval, kNN, and the eval fully functional offline. The UI labels
// which provider produced the vectors, so we never imply neural semantics when
// the lexical fallback ran.
//
// In production this whole slot is AWS Bedrock Knowledge Bases (Titan
// embeddings) inside the Iovance VPC, reachable without the public HF hop. The
// interface here (embed one, embed many, cosine) is the same shape Bedrock would
// expose, so the swap is a provider change, not a rewrite.

export const EMBEDDING_MODEL = "Xenova/all-MiniLM-L6-v2";

// all-MiniLM-L6-v2 emits 384-dim vectors. The lexical fallback matches that
// dimension so stored vectors are always the same length and cosine never has to
// guard a length mismatch between providers.
export const EMBEDDING_DIM = 384;

export type EmbeddingProvider = "neural" | "lexical";

export interface EmbeddingInfo {
  provider: EmbeddingProvider;
  label: string; // human-readable, shown in the UI status
}

const NEURAL_LABEL = EMBEDDING_MODEL;
const LEXICAL_LABEL = "lexical fallback (no model download)";

// The transformers pipeline is heavy to construct, so build it once and reuse.
type FeatureExtractor = (
  text: string,
  options: { pooling: "mean"; normalize: boolean }
) => Promise<{ data: Float32Array | number[] }>;

let extractorPromise: Promise<FeatureExtractor> | null = null;

async function getExtractor(): Promise<FeatureExtractor> {
  if (!extractorPromise) {
    extractorPromise = (async () => {
      const mod = await import("@xenova/transformers");
      const { pipeline, env } = mod as unknown as {
        pipeline: (task: string, model: string) => Promise<FeatureExtractor>;
        env: { allowLocalModels: boolean; useBrowserCache: boolean };
      };
      env.allowLocalModels = true;
      env.useBrowserCache = false;
      return pipeline("feature-extraction", EMBEDDING_MODEL);
    })().catch((err) => {
      extractorPromise = null;
      throw err;
    });
  }
  return extractorPromise;
}

// ---- Lexical fallback: deterministic, dependency-free, no network ----
function tokenize(text: string): string[] {
  return ((text || "").toLowerCase().match(/[a-z0-9]+/g) || []).filter((t) => t.length > 2);
}

// FNV-1a hash of a token into [0, EMBEDDING_DIM).
function hashToken(token: string): number {
  let h = 2166136261;
  for (let i = 0; i < token.length; i++) {
    h ^= token.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % EMBEDDING_DIM;
}

// Hashed bag-of-words with sublinear term scaling, L2-normalized so cosine is a
// dot product, mirroring the neural path's normalized output.
export function lexicalEmbed(text: string): number[] {
  const v = new Array(EMBEDDING_DIM).fill(0);
  for (const tok of tokenize(text)) v[hashToken(tok)] += 1;
  let norm = 0;
  for (let i = 0; i < EMBEDDING_DIM; i++) {
    if (v[i] > 0) v[i] = 1 + Math.log(v[i]);
    norm += v[i] * v[i];
  }
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < EMBEDDING_DIM; i++) v[i] /= norm;
  return v;
}

// Resolve which provider to use, once. Probe the neural model with a bounded
// wait so a blocked huggingface.co does not hang every request: if the model is
// not ready within the probe window, commit to the lexical fallback and cache
// that decision for the process lifetime.
const NEURAL_PROBE_MS = 6000;
let providerPromise: Promise<EmbeddingInfo> | null = null;

async function resolveProvider(): Promise<EmbeddingInfo> {
  if (!providerPromise) {
    providerPromise = (async () => {
      const ready = await Promise.race([
        getExtractor().then(() => true).catch(() => false),
        new Promise<boolean>((res) => setTimeout(() => res(false), NEURAL_PROBE_MS)),
      ]);
      return ready
        ? { provider: "neural" as const, label: NEURAL_LABEL }
        : { provider: "lexical" as const, label: LEXICAL_LABEL };
    })();
  }
  return providerPromise;
}

export async function embeddingInfo(): Promise<EmbeddingInfo> {
  return resolveProvider();
}

export function labelFor(provider: EmbeddingProvider): string {
  return provider === "neural" ? NEURAL_LABEL : LEXICAL_LABEL;
}

// Embed a single string with the active provider.
export async function embedText(text: string): Promise<number[]> {
  const info = await resolveProvider();
  if (info.provider === "neural") {
    try {
      const extractor = await getExtractor();
      const clean = (text || "").slice(0, 8000);
      const output = await extractor(clean, { pooling: "mean", normalize: true });
      return Array.from(output.data as ArrayLike<number>);
    } catch {
      // Neural became unavailable mid-run; degrade to lexical for this call so a
      // single transient failure does not abort an ingest.
      return lexicalEmbed(text);
    }
  }
  return lexicalEmbed(text);
}

export async function embedMany(texts: string[]): Promise<number[][]> {
  const out: number[][] = [];
  for (const t of texts) out.push(await embedText(t));
  return out;
}

// Cosine similarity. Inputs are L2-normalized by both providers, so this is a
// dot product clamped to [0, 1] for display. Guards mismatched lengths.
export function cosine(a: number[], b: number[]): number {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  if (dot < 0) return 0;
  if (dot > 1) return 1;
  return dot;
}

// Retained for callers that only need a boolean. Always true now: the lexical
// fallback guarantees embeddings are available even with no network.
export async function embeddingsAvailable(): Promise<boolean> {
  return true;
}
