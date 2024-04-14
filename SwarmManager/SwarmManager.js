import Hyperswarm from "hyperswarm";
import b4a, { includes } from "b4a";

import { isText, getEncoding } from "istextorbinary";

export class SwarmManager {
  static USER_PEER_WRITER = "org.mneme.user.peer.writer";
  static REMOTE_OWNER_LOGIN = "org.mneme.user.remoteOwner.login";

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
    console.log("[SwarmManager] Starting swarm manager...");
    if (this.started) {
      console.log("[SwarmManager] swarm manager already started...");
      return;
    }

    this.swarm.on("connection", this.handleSwarmConnection.bind(this));
    this.swarm.on("update", this.handleSwarmUpdate.bind(this));

    this.joinSwarm(this.privateStore.discoveryKey);
  }

  async handleSwarmConnection(connection, peerInfo) {
    const peerKey = b4a.toString(peerInfo.publicKey, "hex");
    console.log("[SwarmManager#connection] Peer joined...", { peerKey });

    // We only want to send the peer writer message if we're bootstrapped!
    if (this.privateStore.bootstrapped) {
      setTimeout(() => {
        this.sendPeerWriter(connection);
      }, 1000);
    }

    connection.on("data", this.handleData(connection).bind(this));

    connection.on("data", this.loginRemoteOwner.bind(this));

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

  handleData(connection) {
    return async function actuallyHandleData(data) {
      await this.makeRemotePeerPrivateAutobaseWritable(connection)(data);
      await this.loginRemoteOwner(data);
    }.bind(this);
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

    const isBootstrapped = this.privateStore.bootstrapped;
    console.log("[swarm] Joined swarm with topic:", {
      bootstrapped: isBootstrapped,
      topic: b4a.toString(discoveryKey, "hex"),
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
  async sendRemoteOwnerLoginPing(connection) {
    console.log("...read/write peer emitting remote owner login ping", {
      userKey: this.userManager.loggedInUser().key,
    });
    connection.write(
      JSON.stringify({
        [SwarmManager.REMOTE_OWNER_LOGIN]: {
          userKey: this.userManager.loggedInUser().key,
        },
      })
    );
  }

  makeRemotePeerPrivateAutobaseWritable(connection) {
    return async function actuallyMakeRemotePeerPrivateAutobaseWritable(data) {
      const chunk = data.toString();
      const encoding = getEncoding(data);
      const chunkIsText = isText(null, data);

      if (
        chunkIsText &&
        encoding === "utf8" &&
        chunk.includes(SwarmManager.USER_PEER_WRITER)
      ) {
        if (this.privateStore.bootstrapped) {
          console.log(
            "[SwarmManager#actuallyMakeRemotePeerPrivateAutobaseWritable] ...read only peer is bootstrapped, ignoring writer data"
          );
          return;
        }

        try {
          const response = JSON.parse(chunk)[SwarmManager.USER_PEER_WRITER];

          const writer = response.localPrivateCorePublicKey;
          const bootstrapKey = response.bootstrapKey;
          const existingWriters =
            this.userManager.loggedInUser()?.writers || [];
          const writerAlreadyExists = existingWriters.includes(writer);

          // Now we need to check if the bootstrap key is the same as the private core's public key
          const isSameUser = this.privateStore.publicKeyString === bootstrapKey;

          console.log(
            "[SwarmManager] ...read-write peer got other device's peer key",
            {
              peerKey: writer,
              length: writer.length,
              bootstrapKey,
              isSameUser,
              writer,
              existingWriters,
              writerAlreadyExists,
            }
          );

          // If we have a writer of the right length, and this is the same user (i.e. we shared our private store's public key)
          // AND the writer doesn't already exist in the user's writers array
          if (
            writer &&
            writer.length === 64 &&
            isSameUser &&
            !writerAlreadyExists
          ) {
            console.log("[SwarmManager] adding writer to private autobee", {
              writer,
            });

            // Add our other device as a writer to the private autobee
            this.privateStore
              .appendWriter(writer)
              .then(() => {
                console.log(
                  "[SwarmManager] added writer to private autobee...pushing new writer to user...",
                  writer
                );

                // Persist the writer to the user
                this.userManager.updateWriter(writer).then(() => {
                  setTimeout(() => {
                    console.log(
                      "[SwarmManager] now sending login ping to remote owner..."
                    );
                    this.sendRemoteOwnerLoginPing(connection);
                  }, 2000);
                });
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
    }.bind(this);
  }

  async loginRemoteOwner(data) {
    const chunk = data.toString();
    const encoding = getEncoding(data);
    const chunkIsText = isText(null, data);

    if (
      chunkIsText &&
      encoding === "utf8" &&
      chunk.includes(SwarmManager.REMOTE_OWNER_LOGIN)
    ) {
      console.log(
        "[SwarmManager#actuallyMakeRemotePeerPrivateAutobaseWritable] ... DIRECT LOGIN",
        {
          chunk,
          encoding,
          chunkIsText,
          includes: chunk.includes(SwarmManager.REMOTE_OWNER_LOGIN),
          loggedInUser: this.userManager.loggedInUser(),
          bootstrapped: this.privateStore.bootstrapped,
        }
      );

      if (!this.privateStore.bootstrapped) {
        console.log(
          "[SwarmManager#actuallyMakeRemotePeerPrivateAutobaseWritable] ...read-write peer is not bootstrapped, ignoring direct login"
        );
        return;
      }

      try {
        // Remote owner should now be able to login
        const response = JSON.parse(chunk)[SwarmManager.REMOTE_OWNER_LOGIN];

        const userKey = response.userKey;

        console.log(
          "[SwarmManager#loginRemoteOwner] ...got other device's user key",
          {
            userKey,
          }
        );

        if (userKey) {
          console.log("[SwarmManager#loginRemoteOwner] direct login", {
            userKey,
          });

          // Add our other device as a writer to the private autobee
          this.userManager
            .directLogin(userKey)
            .then(() => {
              console.log(
                "[SwarmManager#loginRemoteOwner] logged in remote owner",
                { loggedInUser: this.userManager.loggedInUser() }
              );
            })
            .catch((error) => {
              console.error(
                "[SwarmManager#loginRemoteOwner] error with direct login",
                {
                  userKey,
                  error,
                }
              );
            });
        }
      } catch (error) {
        console.error(
          "[SwarmManager#loginRemoteOwner] error parsing direct login data:",
          {
            chunk,
            error,
          }
        );
      }
    }
  }

  async destroy() {
    this.swarm.destroy();
  }
}
