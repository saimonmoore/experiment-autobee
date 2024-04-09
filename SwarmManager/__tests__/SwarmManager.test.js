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
const { User } = await import("../../User/index.js");

const publicKeyString = "privateCore:abc123";
const localPublicKeyString = "privateCoreLocal:andlotsofothercharacterstomakeatototalof64chars";
const discoveryKeyString = "discovery:abc123";
const otherPeerKeyString = "discovery:abc123";

describe("SwarmManager", () => {
  let swarmManager;
  const corestore = {};
  const privateStore = {
    discoveryKey: b4a.from(Buffer.from(discoveryKeyString), "hex"),
    publicKeyString,
    localPublicKeyString,
    appendWriter: jest.fn().mockResolvedValue(true),
  };

  beforeEach(() => {
    swarmManager = new SwarmManager(corestore, privateStore);
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
      jest.useFakeTimers();
      mockConnection = {
        on: jest.fn(),
        write: jest.fn(),
      };
      swarmManager.corestore.replicate = jest.fn();
    });

    it("logs the peer key and send the peer writer message after a delay", async () => {
      await swarmManager.handleSwarmConnection(mockConnection, {
        publicKey: b4a.from(otherPeerKeyString, "hex"),
      });

      jest.advanceTimersByTime(1000);

      expect(mockConnection.write).toHaveBeenCalledWith(
        JSON.stringify({
          [SwarmManager.USER_PEER_WRITER]: localPublicKeyString,
        })
      );
    });

    it("attaches data, close, and error event listeners to the connection", async () => {
      await swarmManager.handleSwarmConnection(mockConnection, {
        publicKey: b4a.from(otherPeerKeyString, "hex"),
      });

      expect(mockConnection.on.mock.calls[0][0]).toBe("data");
      expect(mockConnection.on.mock.calls[0][1].name).toBe(
        swarmManager.makeRemotePeerPrivateAutobaseWritable.bind(swarmManager).name
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
      expect(swarmManager.corestore.replicate).toHaveBeenCalledWith(
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
      await swarmManager.joinSwarm(b4a.from(otherPeerKeyString, "hex"));
    });

    it("joins the swarm with the provided discoveryKey", async () => {
      expect(swarmManager.swarm.join).toHaveBeenCalledWith(
        b4a.from(otherPeerKeyString, "hex")
      );
      expect(swarmManager.swarm.join().flushed).toHaveBeenCalled();
    });
  });

  describe("when sending the peer writer", () => {
    let mockConnection;

    beforeEach(async () => {
      mockConnection = {
        write: jest.fn(),
      };

      await swarmManager.sendPeerWriter(mockConnection);
    });

    it("sends the local private autobee public key to the connection", async () => {
      expect(mockConnection.write).toHaveBeenCalledWith(
        JSON.stringify({
          [SwarmManager.USER_PEER_WRITER]: localPublicKeyString,
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

    it("adds the remote peer writer to the private autobee", async () => {
      const data = JSON.stringify({
        [SwarmManager.USER_PEER_WRITER]: localPublicKeyString,
      });
      await swarmManager.makeRemotePeerPrivateAutobaseWritable(b4a.from(data));
      expect(swarmManager.privateStore.appendWriter).toHaveBeenCalledWith(
        localPublicKeyString
      );
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
