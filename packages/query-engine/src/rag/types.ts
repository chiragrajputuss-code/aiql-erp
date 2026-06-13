// ─── RAG types ────────────────────────────────────────────────────────────────
// query-engine is database-agnostic. The caller (web app) provides a RagStore
// implementation backed by Prisma, Redis, or any other store.

export interface RagEntry {
  /** Original natural language question */
  question:   string;
  /** The validated SQL that successfully answered this question */
  sql:        string;
  /** Confidence score the pipeline assigned to this answer (0–1) */
  confidence: number;
  /** Similarity to the current query (0–1), set by the retriever */
  similarity: number;
}

export interface RagStore {
  /**
   * Find the most similar past successful queries for the given question.
   * Returns entries sorted by similarity descending.
   */
  findSimilar(question: string, limit?: number): Promise<RagEntry[]>;

  /**
   * Persist a successful Q→SQL pair so it can be retrieved in future queries.
   * Called by the pipeline after a query completes with verdict !== needs_clarification.
   */
  store(question: string, sql: string, confidence: number): Promise<void>;
}
