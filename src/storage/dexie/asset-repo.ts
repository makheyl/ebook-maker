import {
  isQuotaError,
  StorageQuotaError,
  type AssetRepository,
  type StoredAsset,
} from '../repository';
import type { FolioDatabase } from './db';

export class DexieAssetRepository implements AssetRepository {
  constructor(private readonly db: FolioDatabase) {}

  async put(asset: StoredAsset): Promise<void> {
    try {
      await this.db.transaction('rw', this.db.assets, async () => {
        if (!(await this.db.assets.get(asset.id))) await this.db.assets.add(asset);
      });
    } catch (err) {
      if (isQuotaError(err)) throw new StorageQuotaError(err);
      throw err;
    }
  }

  async has(id: string): Promise<boolean> {
    return (await this.db.assets.where('id').equals(id).count()) > 0;
  }

  get(id: string): Promise<StoredAsset | undefined> {
    return this.db.assets.get(id);
  }

  async getMany(ids: readonly string[]): Promise<Map<string, StoredAsset>> {
    const rows = await this.db.assets.bulkGet([...ids]);
    const out = new Map<string, StoredAsset>();
    rows.forEach((row) => row && out.set(row.id, row));
    return out;
  }

  count(): Promise<number> {
    return this.db.assets.count();
  }
}
