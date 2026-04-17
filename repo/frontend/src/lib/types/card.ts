export interface Card {
  id: string;
  profileId: string;
  title: string;
  body: string;
  date: string;
  mood: number;
  tags: string[];
  sourceImportId: string | null;
  sourceRowNumber: number | null;
  thumbnailId: string | null;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  version: number;
}

export interface CardDraft {
  title: string;
  body: string;
  date: string;
  mood: number;
  tags: string[];
}

export interface CardRevision {
  id: string;
  cardId: string;
  version: number;
  beforeSnapshot: Partial<Card>;
  afterSnapshot: Partial<Card>;
  editedAt: number;
  editSource: 'manual' | 'import_overwrite' | 'restore' | 'rule_extract';
  tabInstanceId: string | null;
}

export type CardField = keyof CardDraft;

export interface CardValidationError {
  field: CardField;
  message: string;
}
