import Hyperswarm from "hyperswarm";
import Corestore from "corestore";
import b4a from "b4a";
import goodbye from "graceful-goodbye";
import { isText, isBinary, getEncoding } from "istextorbinary";

import Autobee from "./db.js";

import crypto from "crypto";

import readline from "readline";
import { write } from "fs";
import { get } from "http";

const isTestRunning = process.env.NODE_ENV === "test";

export function sha256(input) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

const rl =
  !isTestRunning &&
  readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

export class User {
  static USERS_KEY = "org.mneme.users!";

  constructor({ email, username }) {
    this.email = email;
    this.username = username;
  }

  get hash() {
    return sha256(this.email);
  }

  get key() {
    return User.USERS_KEY + this.hash;
  }

  toProperties() {
    return {
      email: this.email,
      username: this.username,
    };
  }
}

export class UserUseCase {
  constructor(privateAutoBee) {
    this.privateAutoBee = privateAutoBee;
  }

  async createUser(user) {
    await this.privateAutoBee.appendOperation(
      JSON.stringify({
        type: UserIndexer.CREATE_USER_ACTION,
        user: user.toProperties(),
        writers: [this.privateAutoBee.local.key],
      })
    );
  }
}

export class UserIndexer {
  static CREATE_USER_ACTION = "createUser";

  constructor(privateAutoBee) {
    this.privateAutoBee = privateAutoBee;
  }

  async handleOperation(batch, operation) {
    if (operation.type === UserIndexer.CREATE_USER_ACTION) {
      await this.indexUsers(batch, operation);
    }
  }

  async indexUsers(batch, operation) {
    const { email, writers } = operation;
    const hash = sha256(email);
    const key = Mneme.USERS_KEY + hash;

    // Check if the user already exists
    const result = await this.privateAutoBee.get(key);

    // If doesn't exist, we can assume it's the first time the user is being added
    // because it's the private core and only the device owner can write to it
    // and all the device owner's devices should be in sync.
    // Action: We add the writer of the private core to the user's data.

    // If the user already exists, we can assume it's a new writer being added
    // because the user already exists and the account owner is adding the writer of
    // their other device to the user's data.
    // Action: We append the new writer to the user's data, so 'writers' should be a Set.
    if (result) {
      const existingUser = result.value;

      console.log("[indexUsers] User already exists", {
        existingUser,
        email,
        hash,
        key,
        newWriters: writers,
      });
    }

    console.log("[indexUsers] Indexing user", {
      email,
      hash,
      key,
    });
    await batch.put(key, { hash, email });
  }
}

export class SwarmManager {
  static USER_PEER_WRITER = "org.mneme.user.peer.writer";

  constructor(privateAutoBee, bootstrapSwarm) {
    this.swarm = bootstrapSwarm
      ? new Hyperswarm({ bootstrap: bootstrapSwarm })
      : new Hyperswarm();
    this.privateAutoBee = privateAutoBee;
  }

  get dhtKeypair() {
    return this.swarm.keyPair;
  }

  get peerKey() {
    return b4a.toString(this.dhtKeypair.publicKey, "hex");
  }

  async start() {
    this.swarm.on("connection", this.handleSwarmConnection.bind(this));
    this.swarm.on("update", this.handleSwarmUpdate.bind(this));

    this.joinSwarm(this.privateAutoBee.discoveryKey);
  }

  async handleSwarmConnection(connection, peerInfo) {
    const peerKey = b4a.toString(peerInfo.publicKey, "hex");
    console.log("[swarm#connection] Peer joined...", { peerKey });

    setTimeout(() => {
      this.sendPeerWriter();
    }, 1000);

    connection.on("data", (data) => {
      this.makeRemotePeerPrivateAutobaseWritable(data);
    });

    connection.on("close", () => {
      console.log("\r[swarm#connection] Peer left...", {
        peerKey,
      });
    });

    connection.on("error", (error) => {
      console.error("\r[swarm#connection] error...", {
        error,
      });
    });

    if (this.bootstrapPrivateCorePublicKey) {
      this.peers[peerInfo.publicKey] = peerInfo;
    } else {
      this.currentUser = peer;
    }

    !isTestRunning && rl.prompt();

    this.store.replicate(connection);
  }

  async handleSwarmUpdate() {
    console.log("[swarm#update] Swarm update...");
  }

  async joinSwarm(discoveryKey) {
    this.swarm.join(discoveryKey);
    await this.swarm.flushed();
    console.log(
      "[swarm] Joined swarm with topic:",
      b4a.toString(discoveryKey, "hex")
    );

    !isTestRunning && rl.pause();
  }

  async sendPeerWriter() {
    console.log(
      "...read-only peer sending over remote private autobee public key",
      {
        localPublicKey: this.privateAutoBee.localPublicKey,
      }
    );
    connection.write(
      JSON.stringify({
        [SwarmManager.USER_PEER_WRITER]: this.privateAutoBee.localPublicKey,
      })
    );
  }

  async makeRemotePeerPrivateAutobaseWritable(data) {
    const chunk = data.toString();
    const encoding = getEncoding(data);
    const chunkIsText = isText(null, data);

    if (
      chunkIsText &&
      encoding === "utf8" &&
      chunk.includes(Mneme.USER_PEER_WRITER)
    ) {
      try {
        const writer = JSON.parse(chunk)[Mneme.USER_PEER_WRITER];
        console.log("...read-write peer got other device's peer key", {
          peerKey: writer,
          length: writer.length,
        });

        if (writer && writer.length === 64) {
          console.log("[InternalComms] adding writer to private autobee", {
            writer,
          });

          // Add our other device as a writer to the private autobee
          this.privateAutoBee
            .appendWriter(writer)
            .then(() => {
              console.log(
                "[InternalComms] added writer to private autobee",
                writer
              );
            })
            .catch((error) => {
              // TODO: We're getting an error here as if the writable peer is trying to add itself as a writer
              // but we can maybe ignore this error?
              console.error(
                "[InternalComms] error adding writer to private autobee",
                {
                  writer,
                  error,
                }
              );
            });
        }
      } catch (error) {
        console.error("[InternalComms] error parsing writer data:", {
          chunk,
          error,
        });
      }
    }
  }

  async destroy() {
    this.swarm.destroy();
  }
}

export class PrivateStore {
  static CREATE_USER_ACTION = "createUser";

  constructor(privateStore, bootstrapPrivateCorePublicKey) {
    this.privateStore = privateStore;
    this.bootstrapPrivateCorePublicKey = bootstrapPrivateCorePublicKey;
    this.privateAutoBee = this.setupPrivateBee();
    this.indexers = [new UserIndexer(this.privateAutoBee)];
  }

  get localPublicKey() {
    return b4a.toString(this.privateAutoBee.local.key, "hex");
  }

  get discoveryKey() {
    return b4a.toString(this.privateAutoBee.discoveryKey, "hex");
  }

  async start() {
    await this.privateAutoBee.update();
    this.privateAutoBee.view.core.on("append", this.handleAppend.bind(this));
  }

  async destroy() {
    await this.privateAutoBee.close();
  }

  async handleApplyEvents(batch, view, base) {
    const batchedBeeOperations = view.batch({ update: false });

    for (const { value } of batch) {
      const operation = JSON.parse(value);

      this.indexers.forEach((indexer) =>
        indexer.handleOperation(batch, operation)
      );
    }

    await batchedBeeOperations.flush();

    await Autobee.apply(batch, view, base);
  }

  async handleAppendEvents() {
    // Skip append event for hyperbee's header block
    if (this.privateAutoBee.view.version === 1) return;

    !isTestRunning && rl.pause();

    console.log("\r[privateAutoBee#onAppend] current db key/value pairs: ");
    for await (const node of this.privateAutoBee.createReadStream()) {
      console.log("key", node.key);
      console.log("value", node.value);
      console.log();
    }

    !isTestRunning && rl.prompt();
  }

  setupPrivateBee() {
    console.log("Initializing private autobee...", {
      privateBootstrap: this.bootstrapPrivateCorePublicKey,
    });

    const privateAutoBee = new Autobee(
      { store: this.privateStore, coreName: "private" },
      this.bootstrapPrivateCorePublicKey,
      {
        apply: this.handleApplyEvents,
      }
    ).on("error", console.error);

    return privateAutoBee;
  }
}

export class MnemeRefactored {
  constructor(bootstrapPrivateCorePublicKey, storage, bootstrapSwarm) {
    // Persistence
    this.cores = new Corestore(storage || "./data");
    this.privateCores = this.cores.namespace("private");
    this.privateStore = new PrivateStore(
      this.privateCores,
      bootstrapPrivateCorePublicKey
    );

    // Application
    this.userManager = new UserUseCase(this.privateStore.privateAutoBee);

    // Networking
    this.swarmManager = new SwarmManager(
      this.privateStore.privateAutoBee,
      bootstrapSwarm
    );
  }

  async start() {
    await this.privateStore.start();
    await this.publicStore.start();
    await this.swarmManager.start();

    goodbye(async () => {
      await this.destroy();
    });
  }

  async createUser(user) {
    await this.userManager.createUser(user);
  }

  async destroy() {
    console.log("\r[SIGINT] destroying swarm...");

    await this.swarmManager.destroy();
    await this.privateStore.destroy();
  }

  info() {
    console.log('node index.js "bootstrapPrivateCorePublicKey" "./storage2"');
  }
}

export class Mneme {
  static USERS_KEY = "org.mneme.users!";
  static USER_PEER_WRITER = "org.mneme.user.peer.writer";

  currentUser;
  peers = {};
  privateStore;
  privateAutoBee;
  store;
  bootstrapPrivateCorePublicKey;
  peerDiscoverySession;
  swarm;

  constructor(bootstrapPrivateCorePublicKey, storage, bootstrapSwarm) {
    this.bootstrapPrivateCorePublicKey = bootstrapPrivateCorePublicKey;

    // create a corestore instance with the given location
    this.store = new Corestore(storage || "./data");

    // creation of Hypercore instance (if not already created)
    // If key is provided, get the core instance with the key
    // Else, get the core instance with the default name
    this.privateStore = this.store.namespace("private");
    // publicStore = store.namespace("public");

    this.swarm = bootstrapSwarm
      ? new Hyperswarm({ bootstrap: bootstrapSwarm })
      : new Hyperswarm();
  }

  async start() {
    await this.initPrivateBee();
    await this.initSwarm();

    if (this.privateAutoBee.writable) {
      console.log("privateAutoBee is writable!", {
        peerKey: this.peerKey,
      });
    }

    if (!this.privateAutoBee.writable) {
      console.log("privateAutoBee isnt writable yet", {
        peerKey: this.peerKey,
      });
      console.log("have another writer add the following key");
      console.log(b4a.toString(this.privateAutoBee.local.key, "hex"));
    }

    goodbye(async () => {
      await this.privateAutoBee.close();
    });
  }

  async initPrivateBee() {
    console.log("Initializing private autobee...", {
      privateBootstrap: this.bootstrapPrivateCorePublicKey,
    });

    this.privateAutoBee = new Autobee(
      { store: this.privateStore, coreName: "private" },
      this.bootstrapPrivateCorePublicKey,
      {
        apply: async (batch, view, base) => {
          const batchedBeeOperations = view.batch({ update: false });

          for (const { value } of batch) {
            const operation = JSON.parse(value);

            if (operation.type === "createUser") {
              await this.indexUsers(batchedBeeOperations, operation);
            }
          }

          await batchedBeeOperations.flush();

          await Autobee.apply(batch, view, base);
        },
      }
    ).on("error", console.error);

    // wait till all the properties of the hypercore are initialized
    await this.privateAutoBee.update();

    this.privateAutoBee.view.core.on("append", async () => {
      // Skip append event for hyperbee's header block
      if (this.privateAutoBee.view.version === 1) return;

      !isTestRunning && rl.pause();

      console.log("\r[privateAutoBee#onAppend] current db key/value pairs: ");
      for await (const node of this.privateAutoBee.createReadStream()) {
        console.log("key", node.key);
        console.log("value", node.value);
        console.log();
      }

      !isTestRunning && rl.prompt();
    });
  }

  async initSwarm() {
    // Pear.teardown(() => this.destroy());
    process.once("SIGINT", () => {
      console.log("\r[swarm#SIGINT] destroying swarm...");
      this.destroy();
    });

    // replication of corestore instance
    this.swarm.on("connection", (connection, peerInfo) => {
      const peer = b4a.toString(peerInfo.publicKey, "hex");

      console.log("\r[swarm#connection] Peer joined...", {
        peer,
      });

      // Write our own private autobee's local public key to the peer
      // e.g. the peer is likely the first device to have an account (e.g. the first writer)
      // so we need to write our public key to the peer so they can add us as a writer to their autobase.
      // Delay a bit to ensure the other side is listening...
      setTimeout(() => {
        const remotePublicKey = b4a.toString(
          this.privateAutoBee.local.key,
          "hex"
        );
        console.log(
          "...read-only peer sending over remote private autobee public key",
          {
            remotePublicKey,
          }
        );
        connection.write(
          JSON.stringify({
            [Mneme.USER_PEER_WRITER]: remotePublicKey,
          })
        );
      }, 1000);

      connection.on("data", (data) => {
        const chunk = data.toString();
        const encoding = getEncoding(data);
        const chunkIsText = isText(null, data);

        if (
          chunkIsText &&
          encoding === "utf8" &&
          chunk.includes(Mneme.USER_PEER_WRITER)
        ) {
          try {
            const writer = JSON.parse(chunk)[Mneme.USER_PEER_WRITER];
            console.log("...read-write peer got other device's peer key", {
              peerKey: writer,
              length: writer.length,
            });

            if (writer && writer.length === 64) {
              console.log("[InternalComms] adding writer to private autobee", {
                writer,
              });

              // Add our other device as a writer to the private autobee
              this.addPrivateWriter(writer)
                .then(() => {
                  console.log(
                    "[InternalComms] added writer to private autobee",
                    writer
                  );
                })
                .catch((error) => {
                  // TODO: We're getting an error here as if the writable peer is trying to add itself as a writer
                  // but we can maybe ignore this error?
                  console.error(
                    "[InternalComms] error adding writer to private autobee",
                    {
                      writer,
                      error,
                    }
                  );
                });
            }
          } catch (error) {
            console.error("[InternalComms] error parsing writer data:", {
              chunk,
              error,
            });
          }
        }
      });

      connection.on("close", () => {
        console.log("\r[swarm#connection] Peer left...", {
          peer: b4a.toString(peerInfo.publicKey, "hex"),
        });

        // We should close the direct connection as well
        // this.dhtServer.close();
      });

      connection.on("error", (error) => {
        console.error("\r[swarm#connection] error...", {
          error,
        });
      });

      if (this.bootstrapPrivateCorePublicKey) {
        console.log(
          "\r[swarm#connection] I am the reader e.g. my other device peer",
          {
            privateBee: this.bootstrapPrivateCorePublicKey,
            discoveryKey: b4a.toString(this.privateAutoBee.discoveryKey, "hex"),
            peerKey: peer,
            topics: peerInfo.topics,
            peerPrioritized: peerInfo.prioritized,
          }
        );

        this.peers[peerInfo.publicKey] = peerInfo;
      } else {
        console.log("\r[swarm#connection] I am the writer device owner", {
          privateBee: this.bootstrapPrivateCorePublicKey,
          discoveryKey: b4a.toString(this.privateAutoBee.discoveryKey, "hex"),
          peerKey: peer,
          topics: peerInfo.topics,
          peerPrioritized: peerInfo.prioritized,
        });

        this.currentUser = peer;
      }

      !isTestRunning && rl.prompt();
      // We are replicating all my own cores from store!
      // e.g. We will replicate both the private and public cores to my other device.
      this.store.replicate(connection);
    });

    this.swarm.on("update", () => {
      console.log(
        "\r[swarm#connection] e.g. how many of my own devices are connected to my personal swarm...",
        {
          connections: this.swarm.connections.length,
          connecting: this.swarm.connecting,
          peers: this.swarm.peers.size,
        }
      );
    });

    if (!this.bootstrapPrivateCorePublicKey) {
      console.log(
        "I am the device owner/writer/currentUser so announcing my device to the private swarm",
        {
          currentUser: this.currentUser,
          privateAutoBeeKey: b4a.toString(this.privateAutoBee.key, "hex"),
          bootstrapPrivateCorePublicKey: this.bootstrapPrivateCorePublicKey,
          privateAutoBeeDiscoveryKey: b4a.toString(
            this.privateAutoBee.discoveryKey,
            "hex"
          ),
        }
      );
    } else {
      console.log(
        "I am the device owner peer (this is the private swarm) and I just joined the swarm to get updates from my other device.",
        {
          currentUser: this.currentUser,
          privateBeeKey: b4a.toString(this.privateAutoBee.key, "hex"),
          bootstrapPrivateCorePublicKey: this.bootstrapPrivateCorePublicKey,
        }
      );
    }

    // join my private core as the topic
    this.peerDiscoverySession = this.swarm.join(
      this.privateAutoBee.discoveryKey
    );
    console.log("joining swarm...", !!this.peerDiscoverySession);

    await this.peerDiscoverySession.flushed();

    console.log(
      "private autobee server joined swarm with topic:",
      b4a.toString(this.privateAutoBee.discoveryKey, "hex")
    );

    // Set our peerKey
    this.dhtKeypair = this.swarm.keyPair;
    this.peerKey = b4a.toString(this.dhtKeypair.publicKey, "hex");
    console.log("MY PEER KEY =================> ", { peerKey: this.peerKey });

    !isTestRunning && rl.pause();
  }

  async indexUsers(batch, operation) {
    const { email, writers } = operation;
    const hash = sha256(email);
    const key = Mneme.USERS_KEY + hash;

    // Check if the user already exists
    const result = await this.privateAutoBee.get(key);

    // If doesn't exist, we can assume it's the first time the user is being added
    // because it's the private core and only the device owner can write to it
    // and all the device owner's devices should be in sync.
    // Action: We add the writer of the private core to the user's data.

    // If the user already exists, we can assume it's a new writer being added
    // because the user already exists and the account owner is adding the writer of
    // their other device to the user's data.
    // Action: We append the new writer to the user's data, so 'writers' should be a Set.
    if (result) {
      const existingUser = result.value;

      console.log("[indexUsers] User already exists", {
        existingUser,
        email,
        hash,
        key,
        newWriters: writers,
      });
    }

    console.log("[indexUsers] Indexing user", {
      email,
      hash,
      key,
    });
    await batch.put(key, { hash, email });
  }

  async addUser(email) {
    await this.privateAutoBee.appendOperation(
      JSON.stringify({
        type: "createUser",
        email,
        writers: [this.peerKey],
      })
    );
  }

  async addPrivateWriter(remotePrivateCorePublicKey) {
    await this.privateAutoBee.appendWriter(remotePrivateCorePublicKey);
  }

  async destroy() {
    this.swarm.destroy();
    this.privateAutoBee && (await this.privateAutoBee.close());
  }

  info() {
    console.log("In terminal 1:");
    console.log();
    console.log("hrepl index.js");
    console.log();
    console.log("In the repl:");
    console.log();
    console.log("await mneme.start();");
    console.log("await mneme.addUser('foo@bar.com');");
    console.log();
    console.log("You should see the user added to the private core");
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
    console.log("await mneme.addUser('foo@bar.com');");
    console.log();
    console.log("You should now see 2 entries in the private core");
  }
}

if (!isTestRunning) {
  console.log("======================");
  console.log("Starting Mneme demo...");
  console.log("======================");
  const args = process.argv.slice(2);
  const bootstrapPrivateCorePublicKey = args[0];
  const storage = args[1];

  console.log("Starting Mneme with args", { args });

  const mneme = new MnemeRefactored(bootstrapPrivateCorePublicKey, storage);
  mneme.info();

  await mneme.start();

  rl.on("line", async (line) => {
    if (!line) {
      rl.prompt();
      return;
    }

    if (line === "exit") {
      console.log("exiting");
      process.exit(0);
    } else if (line === "user1") {
      await mneme.createUser("local@bar.com");
      rl.prompt();
      return;
    } else if (line === "user2") {
      await mneme.createUser("remote1@bar.com");
      rl.prompt();
      return;
    } else if (line === "user3") {
      await mneme.createUser("remote2@bar.com");
      rl.prompt();
      return;
    }
    rl.prompt();
  });
  rl.prompt();
}

// Example taken from https://docs.pears.com/how-tos/share-append-only-databases-with-hyperbee
// Idea: slowly build up a simple version of the social app in a single file and then backport once we have a working version to the actual app.
// At this stage only starting with basic example and writing down todos of next steps.

// e.g. to allow me, the device owner, to get replications to my other core
// But on my other device I should be able to both read and write.
// TODO: So it should be an Autobase and when I, the device owner, connect to the private core topic, I should be added as a writer.

// e.g. to allow my friends to get replications to my public core
// But on my other device I should be able to both read and write.
// TODO: So it should be an Autobase and when I, the device owner, connect to the public core topic, I should be added as a writer.
// But on my friends devices, they should only be able to read.
// TODO: So I need to be able to distinguish between myself the device owner and my friends.
// TODO: I can store my user info in the private core, which is replicated to my other device
//    it will need to login via a url such as:
//       mneme:2d5c1b5f2d5c1b5f2d5c1b5f2d5c1b5f2d5c1b6f
//  e.g. mneme:<private core local public key>
//
// LOGIN HANDSHAKE:
// 1. get some info to device B out-of-band, similar to keet invites (this can be via QR or just messaging a string over)
// 2. use that info to establish a connection to the peer (eg. derive a discoveryKey and use hyperswarm, or the primary device could run a hyperdht server and pass the key directly)
// 3. do your handshake protocol over the connection where you exchange the bootstrap and the writer key
// 4. then at the end the primary device adds the writer to the autobase.

// TODO: I can also store my public core key in the private core, which will allow me to setup a new writable public core on my other device.
// TODO: So for public core, I need to:
// 1. When key found in my private core, instantiate it with the key.
// 2. When key NOT found in my private core, instantiate it with the name to generate the key AND store it in the private core!

// For my friends, they should only be able to read the public core.
// So if I'm the device owner, I should store the list of friends in the private core
// Note: A friend is someone who has the public core key and has joined the swarm with it.
// They should get replications of my public core but only as a friend's public core.
// e.g. I need to setup a public core for each of my friends to replicate to but it can't be the same swarm so I need a separate swarm for each friend.

// So I don't need to pass the public core key as an argument. I can just get it from the private core.
// But I do need to allow a friend to pass in my public core key as an argument so they can join the swarm with it.
// So the 2nd argument needs to be the public core key previously shared with a friend and now they, on their device, want to accept my friend invite (e.g. sharing my public core ) which basically means they join the swarm with the public core's key as the topic.
// So I need to setup both a non-personal public core (e.g. I'm the friend and I'm receiving replications from my friends public core)
// AND a new non-personal swarm for each friend that joins the public core topic to enable replications from them.
// const publicCoreKey = Pear.config.args[1];

// If no key, I am the writer e.g. I can write to my core/autobase: Write stuff
// Actions:
// 1. Read my public core key from the private core
// 2. If not present, generate a new public core key and store it in the private core
// 3. Read any friends from the private core
// 4. For each friend, create a new friend core (readonly e.g. using their public core's key so maybe identify friends via their public core's key) and swarm (both as the server and the client)
// 5. As the server, announce ourselves to the swarm.
// 6. On each swarm connection, replicate my own public core to the friend
// 7. On each friend core update, send an internal event to indicate the friend has updated their core
// 8. React to the internal event somehow

// If key is present, we are the other device e.g. the reader so read the data
// But I'm only the reader of the other device's core. I have my own private/personal cores which should be autobases multiwriter.

// TODO: Here, I'd need to add the addWriter command to the private autobase to ask my other device to allow this device to write to it.
// e.g. so apply of autobase should listen for addWriter events and add the writer to the core.
// Same thing for my personal public core/autobase.

// Before initializing the public core, we need to read the public core key from the private core
// const publicAutoBee = new Autobee({ store: publicStore, coreName: "public" }, publicCorePublicKey, {
//   apply: async (batch, view, base) => {
//     await Autobee.apply(batch, view, base);
//     // Add own stuff here...
//   },
// })
//   // Print any errors from apply() etc
//   .on("error", console.error);

// wait till all the properties of the hypercore are initialized
// await publicAutoBee.update();

// If key is not present, we are the writer so announce ourselves to the swarm
