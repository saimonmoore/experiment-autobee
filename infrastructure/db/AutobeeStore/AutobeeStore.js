import b4a from "b4a";
import Autobee from "../Autobee/Autobee.js";

export class AutobeeStore {
  constructor(namespace, corestore, bootstrapPublicKey) {
    this.namespace = namespace;
    this.corestore = corestore;
    this.core = this.corestore.namespace(namespace);
    console.log("[AutobeeStore] Initializing autobee store...", {
      namespace,
    });
    this.bootstrapPublicKey = bootstrapPublicKey;
    this.autoBee = this.setupAutoBee();
    this.indexers = [];
  }

  get bootstrapped() {
    return !!this.bootstrapPublicKey;
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

  // TODO: This is a temporary method to log the key/value pairs in the db
  async handleAppendEvents() {
    // Skip append event for hyperbee's header block
    if (this.autoBee.view.version === 1) return;

    console.log("[AutobeeStore] current db key/value pairs: ");
    for await (const node of this.autoBee.createReadStream()) {
      console.log("[AutobeeStore] entry: ", {
        key: node.key,
        value: node.value,
      });
      console.log();
    }
  }

  setupAutoBee() {
    const autobee = new Autobee(
      { store: this.core, coreName: this.namespace },
      this.bootstrapPublicKey,
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
    return this.autoBee.get(key, opts);
  }

  async peek(opts) {
    return this.autoBee.peek(opts);
  }

  async createReadStream(range, opts) {
    return this.autoBee.createReadStream(range, opts);
  }
}
