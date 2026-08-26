-- Enable pgvector extension. Available on RDS Postgres ≥ 15.5.
-- If this fails on your DB, the extension package is not installed; add it via
-- AWS RDS parameter group (shared_preload_libraries → vector) or self-managed apt.
CREATE EXTENSION IF NOT EXISTS vector;

-- nomic-embed-text produces 768-dimensional embeddings.
-- Other models (text-embedding-3-small = 1536) would need a different size; we
-- pick 768 because Ollama-hosted nomic is free and runs on the customer's box,
-- preserving the privacy story.
ALTER TABLE "org_business_knowledge"
  ADD COLUMN "embedding" vector(768);

-- HNSW index for fast cosine-distance queries.
-- Cosine because we want similarity, not euclidean distance.
-- m=16, ef_construction=64 are pgvector defaults; tune later when row count grows.
CREATE INDEX "org_business_knowledge_embedding_cosine_idx"
  ON "org_business_knowledge"
  USING hnsw ("embedding" vector_cosine_ops);
