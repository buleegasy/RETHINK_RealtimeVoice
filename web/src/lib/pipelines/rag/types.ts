export interface RagChunk {
  id: string;
  category?: string;
  title: string;
  keywords?: string[];
  tags?: string[];
  content: string;
  score: number;
  empathyLead?: string;
  socraticPivot?: string;
  tabooPhrases?: string[];
}

export interface RagQueryOptions {
  topK?: number;
  minScore?: number;
  stageFilter?: string;
}

export interface IRagProvider {
  readonly name: string;

  retrieve(query: string, options?: RagQueryOptions): Promise<RagChunk[]>;

  formatContext(chunks: RagChunk[]): string;
}
