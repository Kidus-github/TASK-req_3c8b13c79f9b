import { NebulaDB } from '$lib/db/connection';

let counter = 0;

export function createTestDb(): NebulaDB {
  counter++;
  return new NebulaDB(`test-nebulaforge-${counter}-${Date.now()}`);
}

export async function destroyTestDb(db: NebulaDB): Promise<void> {
  db.close();
  await db.delete();
}
