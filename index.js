import Hyperswarm from "hyperswarm";
import Corestore from "corestore";
import b4a from "b4a";
import goodbye from "graceful-goodbye";

import Autobee from "./db.js";

import crypto from "crypto";

import readline from "readline";

export function sha256(input) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

export class Mneme {
  static USERS_KEY = "org.mneme.users!";

  currentUser;
  peers = {};
  privateStore;
  privateAutoBee;
  store;
  bootstrapPrivateCorePublicKey;
  peerDiscoverySession;

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

      rl.pause();

      console.log("\r[privateAutoBee#onAppend] current db key/value pairs: ");
      for await (const node of this.privateAutoBee.createReadStream()) {
        console.log("key", node.key);
        console.log("value", node.value);
        console.log();
      }

      rl.prompt();
    });
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

      connection.on("close", () => {
        console.log("\r[swarm#connection] Peer left...", {
          peer: b4a.toString(peerInfo.publicKey, "hex"),
        });
      });

      connection.on("error", (error) => {
        console.error("\r[swarm#connection] error...", {
          error,
        });
      });

      const peer = b4a.toString(peerInfo.publicKey, "hex");

      console.log("\r[swarm#connection] Peer joined...", {
        peer,
      });

      if (this.bootstrapPrivateCorePublicKey) {
        console.log(
          "\r[swarm#connection] I am the reader e.g. my other device peer",
          {
            privateBee: bootstrapPrivateCorePublicKey,
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

      rl.prompt();
      // We are replicating all my own cores from store!
      // e.g. We will replicate both the private and public cores to my other device.
      this.store.replicate(connection);
    });

    this.swarm.on("update", () => {
      console.log(
        "\r[swarm#connection] e.g. how many of my own devices are connected to my personal swarm...",
        {
          connections: this.swarm.connections,
          connecting: this.swarm.connecting,
          peers: this.swarm.peers,
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

    rl.pause();
  }

  async indexUsers(batch, operation) {
    const { email } = operation;
    const hash = sha256(email);
    console.log("[indexUsers] Indexing user", {
      email,
      hash,
      key: Mneme.USERS_KEY + hash,
    });
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
    await this.privateAutoBee.appendWriter(remotePrivateCorePublicKey);
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

if (!process.env.NODE_ENV === "test") {
  const args = process.argv.slice(2);
  const bootstrapPrivateCorePublicKey = args[0];
  const storage = args[1];

  console.log("Starting Mneme with args", { args });

  const mneme = new Mneme(bootstrapPrivateCorePublicKey, storage);
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
    } else if (line === "friend1") {
      await mneme.addFriend("foo@bar.com");
      rl.prompt();
      return;
    } else if (line === "friend2") {
      await mneme.addFriend("remote@bar.com");
      rl.prompt();
      return;
    }

    await mneme.addPrivateWriter(line);
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
