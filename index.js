import Hyperswarm from "hyperswarm";
import Corestore from "corestore";
import b4a from "b4a";
import goodbye from "graceful-goodbye";

import Autobee from "./db.js";

import crypto from "crypto";

export function sha256(input) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

class Mneme {
  static USERS_KEY = "org.mneme.users!";

  currentUser;
  peers = {};
  privateStore;
  privateAutoBee;
  store;
  bootstrapPrivateCorePublicKey;
  peerDiscoverySession;

  constructor(bootstrapPrivateCorePublicKey, storage) {
    this.bootstrapPrivateCorePublicKey = bootstrapPrivateCorePublicKey;
    this.store = new Corestore(storage || "./data");
    this.privateStore = this.store.namespace("private");
    this.swarm = new Hyperswarm();
  }

  async start() {
    await this.initPrivateBee();
    await this.initSwarm();

    if (this.privateAutoBee.writable) {
      console.log("privateAutoBee is writable!");
    }

    if (!this.privateAutoBee.writable) {
      console.log("privateAutoBee isnt writable yet");
      console.log("have another writer add the following key");
      console.log(b4a.toString(this.privateAutoBee.local.key, "hex"));
    }

    goodbye(async () => {
      await this.privateAutoBee.close();
      console.log("Goodbye!");
    });
  }

  async initPrivateBee() {
    this.privateAutoBee = new Autobee(
      { store: this.privateStore, coreName: "private" },
      this.bootstrapPrivateCorePublicKey,
      {
        apply: async (batch, view, base) => {
          const batchedBeeOperations = view.batch({ update: false });

          for (const { value } of batch) {
            const operation = JSON.parse(value);
            console.log("[privateAutoBee#apply] Applying value: ", {
              value,
              operation,
            });

            if (operation.type === "createUser") {
              await this.indexUsers(batchedBeeOperations, operation);
            }
          }

          await batchedBeeOperations.flush();
          await Autobee.apply(batch, view, base);
        },
      }
    )
      // Print any errors from apply() etc
      .on("error", console.error);

    await this.privateAutoBee.update();

    this.privateAutoBee.view.core.on("append", async () => {
      if (this.privateAutoBee.view.version === 1) return;

      console.log("\r[privateAutoBee#onAppend] current db key/value pairs: ");
      for await (const node of this.privateAutoBee.createReadStream()) {
        console.log("key", node.key);
        console.log("value", node.value);
        console.log();
      }
    });

    if (!this.bootstrapPrivateCorePublicKey) {
      console.log("db.key", b4a.toString(this.privateAutoBee.key, "hex"));
    }
  }

  async initSwarm() {
    // Pear.teardown(() => this.swarm.destroy());
    process.once("SIGINT", () => {
      console.log("\r[swarm#SIGNIT] destroying swarm...");
      this.swarm.destroy();
    });

    // replication of corestore instance
    this.swarm.on("connection", (connection, peerInfo) => {
      console.log("\r[swarm#connection] ...", { connection, peerInfo });

      const peer = b4a.toString(peerInfo.publicKey, "hex");

      console.log("\r[swarm#connection] Peer joined...", {
        peer,
      });

      this.store.replicate(connection);
    });

    if (!this.bootstrapPrivateCorePublicKey) {
      this.peerDiscoverySession = this.swarm.join(
        this.privateAutoBee.discoveryKey
      );

      await this.peerDiscoverySession.flushed();
    }
  }

  async indexUsers(batch, operation) {
    const { email } = operation;
    const hash = sha256(email);
    await batch.put(Mneme.USERS_KEY + hash, { hash, email });
  }

  async addFriend(email) {
    await this.privateAutoBee.appendOperation(
      JSON.stringify({
        type: "createUser",
        email,
      })
    );
  }

  async addPrivateWriter(remotePrivateCorePublicKey) {
    await this.privateAutoBee.addWriter(remotePrivateCorePublicKey);
  }

  info() {
    console.log("In terminal 1:");
    console.log();
    console.log("hrepl index.js");
    console.log();
    console.log("In the repl:");
    console.log();
    console.log("await mneme.start();");
    console.log("await mneme.addFriend('foo@bar.com');");
    console.log();
    console.log("You should see the friend added to the private core");
    console.log();
    console.log(
      "Take the public key of the private core (bootstrap key) and run the following command in terminal 2:"
    );
    console.log();
    console.log(
      "Bootstrap the private core: hrepl index.js {bootstrap key} ./storage2"
    );
    console.log();
    console.log("In repl 2:");
    console.log();
    console.log("await mneme.start();");
    console.log();
    console.log(
      "Take the public key of the 'remote' core and run the following command:"
    );
    console.log("In repl 1:");
    console.log("await mneme.addPrivateWriter({remote db key});");
    console.log();
    console.log("In repl 2:");
    console.log();
    console.log("await mneme.addFriend('foo@bar.com');");
    console.log();
    console.log("You should now see 2 entries in the private core");
  }
}

const args = process.argv.slice(2);
const bootstrapPrivateCorePublicKey = args[0];
const storage = args[1];

console.log("Starting Mneme with args", { args });

const mneme = new Mneme(bootstrapPrivateCorePublicKey, storage);
mneme.info();

export { mneme };
