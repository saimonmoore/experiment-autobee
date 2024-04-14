import { AutobeeStore } from "../../infrastructure/db/AutobeeStore/AutobeeStore.js";
import { UserIndexer } from "../../modules/User/application/UserIndexer/index.js";
import { RecordIndexer } from "../../modules/Record/application/RecordIndexer/index.js";

export class PrivateStore extends AutobeeStore {
  static NAMESPACE = "private";

  constructor(corestore, bootstrapPrivateCorePublicKey) {
    console.log("[PrivateStore] Initializing private store...", {
      bootstrap: bootstrapPrivateCorePublicKey,
    });

    super(PrivateStore.NAMESPACE, corestore, bootstrapPrivateCorePublicKey);

    this.indexers = [new UserIndexer(this), new RecordIndexer(this)];
  }
}
