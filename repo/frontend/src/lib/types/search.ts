export interface SearchQuery {
  queryText: string;
  filters: SearchFilters;
  sort: SearchSort;
}

export interface SearchFilters {
  tags?: string[];
  moodMin?: number;
  moodMax?: number;
  dateStart?: string;
  dateEnd?: string;
}

export interface SearchSort {
  field: 'relevance' | 'date' | 'title' | 'mood';
  direction: 'asc' | 'desc';
}

export interface SearchHit {
  cardId: string;
  score: number;
  matchedFields: string[];
}

export interface SearchIndexRecord {
  cardId: string;
  profileId: string;
  tokenMap: Record<string, number[]>;
  tagTerms: string[];
  mood: number;
  dateEpochDay: number;
  updatedAt: number;
  indexVersion: number;
}

export interface SearchQueryHistory {
  id: string;
  queryText: string;
  filters: SearchFilters;
  sort: SearchSort;
  executedAt: number;
}
