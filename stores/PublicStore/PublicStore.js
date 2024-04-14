import { AutobeeStore } from "../../infrastructure/db/AutobeeStore/AutobeeStore.js";
import { RecordIndexer } from "../../modules/Record/application/RecordIndexer/RecordIndexer.js";

export class PublicStore extends AutobeeStore {
  static NAMESPACE = "public";

  constructor(corestore, bootstrapPublicCorePublicKey) {
    console.log("[PublicStore] Initializing public store...", {
      bootstrap: bootstrapPublicCorePublicKey,
    });
    super(PublicStore.NAMESPACE, corestore, bootstrapPublicCorePublicKey);

    this.indexers = [new RecordIndexer(this)];
  }
}
