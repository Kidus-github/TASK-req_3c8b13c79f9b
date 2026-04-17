export interface ProfileCredential {
  id: string;
  username: string;
  passwordHash: string;
  passwordSalt: string;
  failedAttemptCount: number;
  cooldownUntil: number | null;
  createdAt: number;
  updatedAt: number;
  lastSuccessfulEntryAt: number | null;
}

export interface AuthChallenge {
  username: string;
  password: string;
}

export interface EntrySessionState {
  status: 'locked' | 'entering' | 'cooldown' | 'unlocked';
  profileId: string | null;
  username: string | null;
  cooldownRemainingMs: number;
}
