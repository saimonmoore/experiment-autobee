import Hyperswarm from "hyperswarm";
import b4a from "b4a";

import { isText, getEncoding } from "istextorbinary";

export class SwarmManager {
  static USER_PEER_WRITER = "org.mneme.user.peer.writer";

  started = false;

  constructor(privateStore, userManager, testingDHT) {
    this.privateStore = privateStore;
    this.userManager = userManager;
    this.swarm = testingDHT
      ? new Hyperswarm({ bootstrap: testingDHT })
      : new Hyperswarm();
  }

  get dhtKeypair() {
    return this.swarm.keyPair;
  }

  get peerKey() {
    return b4a.toString(this.dhtKeypair.publicKey, "hex");
  }

  async start() {
    if (this.started) {
      return;
    }

    this.swarm.on("connection", this.handleSwarmConnection.bind(this));
    this.swarm.on("update", this.handleSwarmUpdate.bind(this));

    this.joinSwarm(this.privateStore.discoveryKey);
  }

  async handleSwarmConnection(connection, peerInfo) {
    const peerKey = b4a.toString(peerInfo.publicKey, "hex");
    console.log("[SwarmManager#connection] Peer joined...", { peerKey });

    // We only want to send the peer writer message if we're logged in
    if (this.userManager.loggedIn()) {
      setTimeout(() => {
        this.sendPeerWriter(connection);
      }, 1000);
    } else {
      throw new Error("User is not logged in");
    }

    connection.on(
      "data",
      this.makeRemotePeerPrivateAutobaseWritable.bind(this)
    );

    connection.on("close", () => {
      console.log("[SwarmManager#connection] Peer left...", {
        peerKey,
      });
    });

    connection.on("error", (error) => {
      console.error("[SwarmManager#connection] error...", {
        error,
      });
    });

    this.privateStore.replicate(connection);
  }

  async handleSwarmUpdate() {
    console.log("[SwarmManager#handleSwarmUpdate] Swarm update...", {
      connections: this.swarm.connections.length,
      connecting: this.swarm.connecting,
      peers: this.swarm.peers.size,
    });
  }

  async joinSwarm(discoveryKey) {
    const peerDiscoverySession = this.swarm.join(discoveryKey);
    await peerDiscoverySession.flushed();

    console.log("[swarm] Joined swarm with topic:", {
      topic: b4a.toString(discoveryKey, "hex"),
      privateStorePublicKey: this.privateStore.publicKeyString,
    });

    this.started = true;
  }

  async sendPeerWriter(connection) {
    console.log(
      "...read-only peer sending over remote private autobee public key",
      {
        localPublicKey: this.privateStore.localPublicKeyString,
        bootstrapKey: this.privateStore.publicKeyString,
      }
    );
    connection.write(
      JSON.stringify({
        [SwarmManager.USER_PEER_WRITER]: {
          localPrivateCorePublicKey: this.privateStore.localPublicKeyString,
          bootstrapKey: this.privateStore.publicKeyString,
        },
      })
    );
  }

  async makeRemotePeerPrivateAutobaseWritable(data) {
    if (!this.userManager.loggedIn()) {
      console.error("User not logged in! Cannot make remote peer writable.");
      return;
    }

    const chunk = data.toString();
    const encoding = getEncoding(data);
    const chunkIsText = isText(null, data);

    if (
      chunkIsText &&
      encoding === "utf8" &&
      chunk.includes(SwarmManager.USER_PEER_WRITER)
    ) {
      try {
        const response = JSON.parse(chunk)[SwarmManager.USER_PEER_WRITER];

        const writer = response.localPrivateCorePublicKey;
        const bootstrapKey = response.bootstrapKey;

        // Now we need to check if the bootstrap key is the same as the private core's public key
        const isSameUser = this.privateStore.publicKeyString === bootstrapKey;

        console.log(
          "[SwarmManager] ...read-write peer got other device's peer key",
          {
            peerKey: writer,
            length: writer.length,
            bootstrapKey,
            isSameUser,
          }
        );

        if (writer && writer.length === 64 && isSameUser) {
          console.log("[SwarmManager] adding writer to private autobee", {
            writer,
          });

          // Add our other device as a writer to the private autobee
          this.privateStore
            .appendWriter(writer)
            .then(() => {
              console.log(
                "[SwarmManager] added writer to private autobee",
                writer
              );
            })
            .catch((error) => {
              // TODO: We're getting an error here as if the writable peer is trying to add itself as a writer
              // but we can maybe ignore this error?
              console.error(
                "[SwarmManager] error adding writer to private autobee",
                {
                  writer,
                  error,
                }
              );
            });
        }
      } catch (error) {
        console.error("[SwarmManager] error parsing writer data:", {
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
