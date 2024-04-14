import Hyperswarm from "hyperswarm";
import b4a, { includes } from "b4a";
import { isText, getEncoding } from "istextorbinary";

import { Mneme } from "../../../Mneme/index.js";

export class SwarmManager {
  static REMOTE_OWNER_REQUEST_MAKE_STORES_WRITABLE =
    "org.mneme.user.remoteOwner.requestPrivateStoreWritable";
  static REMOTE_OWNER_LOGIN = "org.mneme.user.remoteOwner.login";

  started = false;

  constructor(stores, userManager, eventBus, testingDHT) {
    this.privateStore = stores.private;
    this.publicStore = stores.public;
    this.stores = stores;
    this.eventBus = eventBus;

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

    this.joinSwarm();
  }

  async handleSwarmConnection(connection, peerInfo) {
    this.connection = connection;

    const peerKey = b4a.toString(peerInfo.publicKey, "hex");
    console.log("[SwarmManager#connection] Peer joined...", { peerKey });

    // We only want to send the make remote owner private store writable request if we're bootstrapped!
    if (this.privateStore.bootstrapped) {
      setTimeout(() => {
        this.sendRemoteOwnerMakeStoresWritableRequest(connection);
      }, 1000);
    }

    connection.on("data", this.handleData(connection).bind(this));

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

  async joinSwarm() {
    const peerDiscoverySessions = Object.keys(this.stores)
      .map((key) => {
        const store = this.stores[key];

        console.log("[SwarmManager] joining swarm with store...", {
          key,
        });

        if (!store) {
          console.log("[SwarmManager] no store to join...aborting...", { key });

          return;
        }

        const discoveryKey = store.discoveryKey;

        console.log("[swarm] Joining swarm with topic:", {
          key,
          topic: b4a.toString(discoveryKey, "hex"),
          bootstrapped: store.bootstrapped,
        });

        return this.swarm.join(discoveryKey);
      })
      .filter(Boolean);

    await Promise.all(
      peerDiscoverySessions.map((session) => session.flushed())
    );

    this.started = true;
  }

  async sendRemoteOwnerMakeStoresWritableRequest(connection) {
    console.log(
      `[sendRemoteOwnerMakeStoresWritableRequest] ...sending over remote autobee public keys`,
      {
        privateStoreLocalPublicKey: this.privateStore.localPublicKeyString,
        publicStoreLocalPublicKey: this.publicStore.localPublicKeyString,
        connection,
      }
    );
    connection.write(
      JSON.stringify({
        [SwarmManager.REMOTE_OWNER_REQUEST_MAKE_STORES_WRITABLE]: {
          privateStoreLocalPublicKey: this.privateStore.localPublicKeyString,
          publicStoreLocalPublicKey: this.publicStore.localPublicKeyString,
          privateStorePublicKey: this.privateStore.publicKeyString,
        },
      })
    );
  }

  async sendRemoteOwnerLoginPing(connection) {
    console.log(
      "[sendRemoteOwnerLoginPing] ...read/write peer emitting remote owner login ping",
      {
        userKey: this.userManager.loggedInUser().key,
      }
    );
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
        chunk.includes(SwarmManager.REMOTE_OWNER_REQUEST_MAKE_STORES_WRITABLE)
      ) {
        if (this.privateStore.bootstrapped) {
          console.log(
            "[SwarmManager#actuallyMakeRemotePeerPrivateAutobaseWritable] ...read only peer is bootstrapped, ignoring writer data"
          );
          return;
        }

        try {
          const response =
            JSON.parse(chunk)[
              SwarmManager.REMOTE_OWNER_REQUEST_MAKE_STORES_WRITABLE
            ];

          const privateStoreWriter = response.privateStoreLocalPublicKey;
          const publicStoreWriter = response.publicStoreLocalPublicKey;

          const bootstrapKey = response.privateStorePublicKey;
          const existingWriters =
            this.userManager.loggedInUser()?.writers || [];
          const writerAlreadyExists =
            existingWriters.includes(privateStoreWriter);

          // Now we need to check if the bootstrap key is the same as the private core's public key
          const isSameUser = this.privateStore.publicKeyString === bootstrapKey;

          console.log(
            "[SwarmManager] ...read-write peer got other device's peer key",
            {
              peerKey: privateStoreWriter,
              length: privateStoreWriter.length,
              bootstrapKey,
              isSameUser,
              privateStoreWriter,
              publicStoreWriter,
              existingWriters,
              writerAlreadyExists,
            }
          );

          // If we have a writer of the right length, and this is the same user (i.e. we shared our private store's public key)
          // AND the writer doesn't already exist in the user's writers array
          if (
            privateStoreWriter &&
            privateStoreWriter.length === 64 &&
            isSameUser &&
            !writerAlreadyExists
          ) {
            console.log(
              "[SwarmManager] adding private writer to private autobee",
              {
                privateStoreWriter,
              }
            );

            console.log(
              "[SwarmManager] adding public writer to public autobee",
              {
                publicStoreWriter,
              }
            );

            // Add our other device as a writer to the private autobee
            this.privateStore
              .appendWriter(privateStoreWriter)
              .then(() => {
                console.log(
                  "[SwarmManager] added writer to private autobee...pushing new writer to user...",
                  privateStoreWriter
                );

                // Add our other device as a writer to the public autobee
                this.publicStore
                  .appendWriter(publicStoreWriter)
                  .then(() => {
                    console.log(
                      "[SwarmManager] added writer to public autobee...",
                      publicStoreWriter
                    );

                    console.log(
                      "[SwarmManager] Now persisting private writer to user...",
                      publicStoreWriter
                    );

                    // Persist the writer to the user
                    this.userManager
                      .updateWriter(privateStoreWriter)
                      .then(() => {
                        console.log(
                          "[SwarmManager] updated private writer in user data..."
                        );
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
                      "[SwarmManager] error adding writer to public autobee",
                      {
                        publicStoreWriter,
                        error,
                      }
                    );
                  });
              })
              .catch((error) => {
                // TODO: We're getting an error here as if the writable peer is trying to add itself as a writer
                // but we can maybe ignore this error?
                console.error(
                  "[SwarmManager] error adding writer to private autobee",
                  {
                    writer: privateStoreWriter,
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
      console.log("[SwarmManager#loginRemoteOwner] ... DIRECT LOGIN", {
        chunk,
        encoding,
        chunkIsText,
        includes: chunk.includes(SwarmManager.REMOTE_OWNER_LOGIN),
        loggedInUser: this.userManager.loggedInUser(),
        bootstrapped: this.privateStore.bootstrapped,
      });

      if (!this.privateStore.bootstrapped) {
        console.log(
          "[SwarmManager#loginRemoteOwner] ...read-write peer is not bootstrapped, ignoring direct login"
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

              this.eventBus.emit(Mneme.EVENTS.MNEME_READY);
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
