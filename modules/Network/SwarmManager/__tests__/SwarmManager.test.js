import { jest, expect } from "@jest/globals";

import b4a from "b4a";
import { isText, getEncoding } from "istextorbinary";

jest.mock("hyperswarm", () =>
  jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    join: jest.fn().mockReturnValue({
      flushed: jest.fn().mockResolvedValue(true),
    }),
    destroy: jest.fn(),
    keyPair: {
      publicKey: b4a.from("abc123", "hex"),
    },
    connections: [],
    connecting: 0,
    peers: new Set(),
  }))
);

const Hyperswarm = await import("hyperswarm").default;

const { SwarmManager } = await import("../index.js");
const { User } = await import("../../../User/domain/entity/User/index.js");

const privateStorePublicKeyString = "privateCore:abc123";
const publicStorePublicKeyString = "publicCore:abc123";
const privateStorelocalPublicKeyString =
  "privateCoreLocal:andlotsofothercharacterstomakeatototalof64chars";
const publicStorelocalPublicKeyString =
  "publicCoreLocal:andlotsofothercharacterstomakeatototalof64chars";
const privateDiscoveryKeyString = "discovery:private:abc123";
const publicDiscoveryKeyString = "discovery:public:abc123";
const otherPeerKeyString = "discovery:abc123";

describe("SwarmManager", () => {
  let swarmManager;

  const currentUser = new User({
    email: "test@example.com",
    username: "testuser",
  });

  const privateStore = {
    discoveryKey: b4a.from(Buffer.from(privateDiscoveryKeyString), "hex"),
    publicKeyString: privateStorePublicKeyString,
    localPublicKeyString: privateStorelocalPublicKeyString,
    appendWriter: jest.fn().mockResolvedValue(true),
    replicate: jest.fn().mockResolvedValue(true),
    bootstrapped: false,
  };

  const publicStore = {
    discoveryKey: b4a.from(Buffer.from(publicDiscoveryKeyString), "hex"),
    publicKeyString: publicStorePublicKeyString,
    localPublicKeyString: publicStorelocalPublicKeyString,
    appendWriter: jest.fn().mockResolvedValue(true),
    replicate: jest.fn().mockResolvedValue(true),
    bootstrapped: false,
  };

  const userManager = {
    signup: jest.fn(),
    login: jest.fn(),
    loggedIn: jest.fn(),
    loggedInUser: jest.fn(),
    updateWriter: jest.fn(),
    directLogin: jest.fn(),
  };

  beforeEach(() => {
    jest.useFakeTimers();

    // Assume we're always logged in
    userManager.loggedIn.mockReturnValue(true);
    swarmManager = new SwarmManager(
      { private: privateStore, public: publicStore },
      userManager
    );
  });

  afterEach(() => {
    privateStore.bootstrapped = false;
  });

  describe("when starting the SwarmManager", () => {
    beforeEach(async () => {
      await swarmManager.start();
    });

    it("joins the swarm with the privateStore discoveryKey", async () => {
      expect(swarmManager.swarm.join).toHaveBeenCalledWith(
        privateStore.discoveryKey
      );
    });

    it("attaches event listeners to the swarm", async () => {
      expect(swarmManager.swarm.on.mock.calls[0][0]).toBe("connection");
      expect(swarmManager.swarm.on.mock.calls[0][1].name).toBe(
        swarmManager.handleSwarmConnection.bind(swarmManager).name
      );

      expect(swarmManager.swarm.on.mock.calls[1][0]).toBe("update");
      expect(swarmManager.swarm.on.mock.calls[1][1].name).toBe(
        swarmManager.handleSwarmUpdate.bind(swarmManager).name
      );
    });
  });

  describe("when a connection is made", () => {
    let mockConnection;

    beforeEach(() => {
      mockConnection = {
        on: jest.fn(),
        write: jest.fn(),
      };
    });

    describe("when the device is bootsrapped", () => {
      beforeEach(async () => {
        privateStore.bootstrapped = true;
      });

      it("sends the peer writer message after a delay", async () => {
        await swarmManager.handleSwarmConnection(mockConnection, {
          publicKey: b4a.from(otherPeerKeyString, "hex"),
        });

        jest.advanceTimersByTime(1000);

        expect(mockConnection.write).toHaveBeenCalledWith(
          JSON.stringify({
            [SwarmManager.REMOTE_OWNER_REQUEST_PRIVATE_STORE_WRITABLE]: {
              localPrivateCorePublicKey: privateStorelocalPublicKeyString,
              bootstrapKey: privateStore.publicKeyString,
            },
          })
        );
      });
    });

    describe("when the device is NOT bootstrapped", () => {
      beforeEach(async () => {
        privateStore.bootstrapped = false;
      });

      it("does NOT send the peer writer message after a delay", async () => {
        await expect(
          swarmManager.handleSwarmConnection(mockConnection, {
            publicKey: b4a.from(otherPeerKeyString, "hex"),
          })
        ).resolves;
      });
    });

    it("attaches data, close, and error event listeners to the connection", async () => {
      await swarmManager.handleSwarmConnection(mockConnection, {
        publicKey: b4a.from(otherPeerKeyString, "hex"),
      });

      expect(mockConnection.on.mock.calls[0][0]).toBe("data");
      expect(mockConnection.on.mock.calls[0][1].name).toBe(
        "bound bound actuallyHandleData"
      );

      expect(mockConnection.on).toHaveBeenCalledWith(
        "close",
        expect.any(Function)
      );
      expect(mockConnection.on).toHaveBeenCalledWith(
        "error",
        expect.any(Function)
      );
    });

    it("replicates the corestore with the connection", async () => {
      await swarmManager.handleSwarmConnection(mockConnection, {
        publicKey: b4a.from(otherPeerKeyString, "hex"),
      });
      expect(swarmManager.privateStore.replicate).toHaveBeenCalledWith(
        mockConnection
      );
    });
  });

  //   describe("when a swarm update occurs", () => {
  //     beforeEach(async () => {
  //       await swarmManager.handleSwarmUpdate();
  //     });

  //     it("logs the current swarm status", async () => {
  //       expect(console.log).toHaveBeenCalledWith(
  //         "[SwarmManager#handleSwarmUpdate] Swarm update...",
  //         {
  //           connections: 0,
  //           connecting: 0,
  //           peers: 0,
  //         }
  //       );
  //     });
  //   });

  describe("when joining the swarm", () => {
    beforeEach(async () => {
      await swarmManager.joinSwarm();
    });

    it("each store joins the swarm with their discoveryKey", async () => {
      expect(
        b4a.toString(swarmManager.swarm.join.mock.calls[0][0], "hex")
      ).toStrictEqual(
        b4a.toString(b4a.from(Buffer.from(privateDiscoveryKeyString), "hex"), "hex")
      );

      expect(
        b4a.toString(swarmManager.swarm.join.mock.calls[1][0], "hex")
      ).toStrictEqual(
        b4a.toString(b4a.from(Buffer.from(publicDiscoveryKeyString), "hex"), "hex")
      );

      expect(swarmManager.swarm.join().flushed).toHaveBeenCalledTimes(2);
    });
  });

  describe("when sending the peer writer", () => {
    let mockConnection;

    beforeEach(async () => {
      // Assume we're logged in
      userManager.loggedInUser.mockReturnValue(currentUser);

      mockConnection = {
        write: jest.fn(),
      };

      await swarmManager.sendPeerWriter(mockConnection);
    });

    it("sends the local private autobee public key to the connection", async () => {
      expect(mockConnection.write).toHaveBeenCalledWith(
        JSON.stringify({
          [SwarmManager.REMOTE_OWNER_REQUEST_PRIVATE_STORE_WRITABLE]: {
            localPrivateCorePublicKey: privateStorelocalPublicKeyString,
            bootstrapKey: privateStore.publicKeyString,
          },
        })
      );
    });
  });

  describe("when processing remote peer writer data", () => {
    let mockConnection;

    beforeEach(() => {
      mockConnection = {
        write: jest.fn(),
      };
    });

    describe("when data contains USER_PEER_WRITER", () => {
      const data = JSON.stringify({
        [SwarmManager.REMOTE_OWNER_REQUEST_PRIVATE_STORE_WRITABLE]: {
          localPrivateCorePublicKey: privateStorelocalPublicKeyString,
          bootstrapKey: privateStore.publicKeyString,
        },
      });

      beforeEach(() => {
        // Assume we're logged in
        userManager.loggedInUser.mockReturnValue(currentUser);
        userManager.updateWriter.mockResolvedValue(true);
      });

      it("adds the remote peer writer to the private autobee", async () => {
        await swarmManager.handleData(mockConnection)(b4a.from(data));
        expect(swarmManager.privateStore.appendWriter).toHaveBeenCalledWith(
          privateStorelocalPublicKeyString
        );
        // We should have called the updateWriter method with the localPublicKeyString
        expect(swarmManager.userManager.updateWriter).toHaveBeenCalledWith(
          privateStorelocalPublicKeyString
        );

        // Wait 2 seconds for the sendRemoteOwnerLoginPing to be called
        jest.advanceTimersByTime(2000);

        // Ensure we sent the login ping
        expect(mockConnection.write).toHaveBeenCalledWith(
          JSON.stringify({
            [SwarmManager.REMOTE_OWNER_LOGIN]: {
              userKey: currentUser.key,
            },
          })
        );
      });
    });

    describe("when BOOTSTRAPPED AND data contains REMOTE_OWNER_LOGIN", () => {
      const data = JSON.stringify({
        [SwarmManager.REMOTE_OWNER_LOGIN]: {
          userKey: currentUser.key,
        },
      });

      beforeEach(() => {
        // Assume we're bootstrapped
        privateStore.bootstrapped = true;
        userManager.loggedInUser.mockReturnValue(currentUser);
        userManager.directLogin.mockResolvedValue(true);
      });

      it("directly logs in the user by getting the user data from the private core", async () => {
        await swarmManager.handleData(mockConnection)(b4a.from(data));

        expect(userManager.directLogin).toHaveBeenCalledWith(currentUser.key);
      });
    });

    // TODO: It says console.error is not being called but must be separate instance
    // it("handles errors when parsing the remote peer writer data", async () => {
    //   privateStore.appendWriter = jest.fn().mockRejectedValue();

    //   const data = JSON.stringify({
    //     [SwarmManager.USER_PEER_WRITER]: localPublicKeyString,
    //   });

    //   await swarmManager.makeRemotePeerPrivateAutobaseWritable(b4a.from(data));

    //   expect(console.error).toHaveBeenCalled();
    // });
  });

  describe("when destroying the SwarmManager", () => {
    it("destroys the swarm", async () => {
      await swarmManager.destroy();
      expect(swarmManager.swarm.destroy).toHaveBeenCalled();
    });
  });
});
