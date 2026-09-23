import { DexieAssetRepository } from './dexie/asset-repo';
import { FolioDatabase } from './dexie/db';
import { DexieProjectRepository } from './dexie/project-repo';
import type { AssetRepository, ProjectRepository } from './repository';

export * from './repository';
export { summarize, projectAssetIds, pageAssetIds } from './summary';

const db = new FolioDatabase();

/** App-wide repositories. Swap these for cloud-backed implementations later. */
export const projectRepo: ProjectRepository = new DexieProjectRepository(db);
export const assetRepo: AssetRepository = new DexieAssetRepository(db);
