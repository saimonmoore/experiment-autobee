import b4a from "b4a";
import Autobee from "../db.js";
import { UserIndexer } from "../UserIndexer/index.js";

export class PrivateStore {
  static CREATE_USER_ACTION = "createUser";

  constructor(corestore, bootstrapPrivateCorePublicKey) {
    console.log("[PrivateStore] Initializing private store...", {
      privateBootstrap: bootstrapPrivateCorePublicKey,
    });

    this.corestore = corestore;
    this.privateCore = this.corestore.namespace("private");
    this.bootstrapPrivateCorePublicKey = bootstrapPrivateCorePublicKey;
    this.autoBee = this.setupAutoBee();
    this.indexers = [new UserIndexer(this)];
  }

  get bootstrapped() {
    return !!this.bootstrapPrivateCorePublicKey;
  }

  get publicKey() {
    return this.autoBee.key;
  }

  get publicKeyString() {
    return b4a.toString(this.publicKey, "hex");
  }

  get localPublicKey() {
    return this.autoBee.local.key;
  }

  get localPublicKeyString() {
    return b4a.toString(this.localPublicKey, "hex");
  }

  get discoveryKey() {
    return this.autoBee.discoveryKey;
  }

  get discoveryKeyString() {
    return b4a.toString(this.discoveryKey, "hex");
  }

  async start() {
    await this.autoBee.update();
    this.autoBee.view.core.on("append", this.handleAppendEvents.bind(this));
  }

  async destroy() {
    await this.autoBee.close();
  }

  async handleApplyEvents(batch, view, base) {
    const batchedBeeOperations = view.batch({ update: false });

    for (const { value } of batch) {
      const operation = JSON.parse(value);

      await Promise.all(
        this.indexers.map((indexer) => {
          return indexer.handleOperation(batchedBeeOperations, operation);
        })
      );
    }

    await batchedBeeOperations.flush();

    await Autobee.apply(batch, view, base);
  }

  async handleAppendEvents() {
    // Skip append event for hyperbee's header block
    if (this.autoBee.view.version === 1) return;

    console.log("[PrivateStore] current db key/value pairs: ");
    for await (const node of this.autoBee.createReadStream()) {
      console.log("[PrivateStore] entry: ", {
        key: node.key,
        value: node.value,
      });
      console.log();
    }
  }

  setupAutoBee() {
    const autobee = new Autobee(
      { store: this.privateCore, coreName: "private" },
      this.bootstrapPrivateCorePublicKey,
      {
        apply: this.handleApplyEvents.bind(this),
      }
    ).on("error", console.error);

    return autobee;
  }

  async replicate(connection) {
    return this.corestore.replicate(connection);
  }

  // Delegate any other calls to autobee
  async appendOperation(operation) {
    return this.autoBee.appendOperation(operation);
  }

  async appendWriter(key) {
    return this.autoBee.appendWriter(key);
  }

  async get(key, opts) {
    const record = await this.autoBee.get(key, opts);
    console.log("[PrivateStore#get] getting key...", {
      key,
      opts,
      user: record?.user,
      writers: record?.writers,
    });
    return record;
  }

  async peek(opts) {
    return this.autoBee.peek(opts);
  }

  async createReadStream(range, opts) {
    return this.autoBee.createReadStream(range, opts);
  }
}
