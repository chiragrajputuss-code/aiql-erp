export interface LLMResponse {
  sql:                   string;
  confidence:            number; // 0–1
  explanation:           string;
  assumptions:           string[];
  clarificationsNeeded:  string[];
  tokensIn:              number;
  tokensOut:             number;
}

export interface LLMProvider {
  readonly name: string;
  generateSQL(systemPrompt: string, userPrompt: string): Promise<LLMResponse>;
}

export interface RouterResult {
  provider:   string;
  model:      string;
  response:   LLMResponse;
  tokensIn:   number;
  tokensOut:  number;
  cost:       number; // USD
  retried:    boolean;
}

export interface OrgLLMConfig {
  llmProvider: string | null;
  llmModel:    string | null;
  llmApiKey:   string | null;
}
