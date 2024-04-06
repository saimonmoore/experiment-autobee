import { test } from "brittle";
import RAM from "random-access-memory";
import b4a from "b4a";
import createTestnet from "hyperdht/testnet.js";
import { Mneme, sha256 } from "../index.js";
import { waitUntil } from "./testHelpers.js";

const friend1Email = "personalLocal@bar.com";
const friend1Hash = sha256(friend1Email);
const friend1Key = Mneme.USERS_KEY + friend1Hash;
const friend2Email = "personalRemote@bar.com";
const friend2Hash = sha256(friend2Email);
const friend2Key = Mneme.USERS_KEY + friend2Hash;

test("E2E test", async (t) => {
  // t.test("When single own device A, ", async (t) => {
  //   let testnet;
  //   let mnemeA;

  //   // Setup
  //   testnet = await createTestnet(1, { teardown: t.teardown });
  //   t.teardown(() => testnet.destroy(), { order: Infinity });

  //   mnemeA = new Mneme(undefined, RAM.reusable(), testnet.bootstrap);

  //   t.teardown(() => mnemeA && mnemeA.destroy());

  //   await mnemeA.start();

  //   t.test("autobee", async (t) => {
  //     await t.execution(async () => {
  //       const isWritable = await waitUntil(
  //         () => mnemeA.privateAutoBee.writable
  //       );
  //       t.ok(isWritable, "should be writable");
  //     });
  //   });

  //   t.test("when a friend is stored", async (t) => {
  //     await mnemeA.addFriend(friend1Email);

  //     await t.execution(async () => {
  //       let result;
  //       try {
  //         result = await waitUntil(async () => {
  //           return await mnemeA.privateAutoBee.get(friend1Key);
  //         });

  //         t.ok(result, "the friend's data should be retrievable");
  //         t.is(result.key, friend1Key, "and the index key should match");
  //         t.alike(
  //           result.value,
  //           { hash: friend1Hash, email: friend1Email },
  //           "and original data should match"
  //         );
  //       } catch (error) {
  //         t.fail(error);
  //       }
  //     });
  //   });

  //   const dbKeyA = b4a.toString(mnemeA.privateAutoBee.key, "hex");
  //   t.ok(dbKeyA, "Database key should exist");
  // });

  // TODO: Use inverted tests exclusively (split appropriately) and await the test promise before moving on (set the plan)
  t.test("When both own devices A & B, ", async (t) => {
    let testnet;
    let mnemeA;
    let mnemeB;

    const onConnection = async (connection, peerInfo) => {
      const numberOfPeersA = mnemeA.swarm.peers.size;
      const numberOfPeersB = mnemeB.swarm.peers.size;

      if (numberOfPeersA < 1 || numberOfPeersB < 1) {
        return;
      }

      const connectedAutobeeDeviceB = t.test("autobee on device B");

      connectedAutobeeDeviceB.ok(
        numberOfPeersB === 1,
        "device A connected to device B"
      );
      connectedAutobeeDeviceB.ok(
        numberOfPeersA === 1,
        "device B connected to device A"
      );
      connectedAutobeeDeviceB.is(
        mnemeB.privateAutoBee.writable,
        false,
        "should NOT be writable"
      );

      const autobeeDeviceBIsReplicated = connectedAutobeeDeviceB.test(
        "autobee on device B has friend stored on device A replicated to it"
      );

      // wait a few seconds for the cores to be fully replicated
      await new Promise((resolve) => {
        setTimeout(resolve, 1000);
      });

      await autobeeDeviceBIsReplicated.execution(async () => {
        let result;
        try {
          result = await waitUntil(async () => {
            return await mnemeB.privateAutoBee.get(friend1Key);
          });

          autobeeDeviceBIsReplicated.ok(
            result,
            "the friend's data should be replicated"
          );
          autobeeDeviceBIsReplicated.is(
            result.key,
            friend1Key,
            "and the index key should match"
          );
          autobeeDeviceBIsReplicated.alike(
            result.value,
            { hash: friend1Hash, email: friend1Email },
            "and original data should match"
          );
        } catch (error) {
          autobeeDeviceBIsReplicated.fail(error);
        }
      });

      // Add autoBee on device B as a writer on device A
      // Now autobee on device B should be writable
      const writerKey = b4a.toString(mnemeB.privateAutoBee.local.key, "hex");

      await mnemeA.addPrivateWriter(writerKey);

      // Wait a few seconds for the core on device B to become writable
      await new Promise((resolve) => {
        setTimeout(resolve, 1000);
      });

      connectedAutobeeDeviceB.is(
        mnemeB.privateAutoBee.writable,
        true,
        "should be writable"
      );

      await mnemeB.addFriend(friend2Email);

      await connectedAutobeeDeviceB.execution(async () => {
        let result;
        try {
          result = await waitUntil(async () => {
            return await mnemeB.privateAutoBee.get(friend2Key);
          });

          connectedAutobeeDeviceB.ok(result, "the friend 2's data should be retrievable on device B");
          connectedAutobeeDeviceB.is(result.key, friend2Key, "and the index key should match");
          connectedAutobeeDeviceB.alike(
            result.value,
            { hash: friend2Hash, email: friend2Email },
            "and original data should match"
          );
        } catch (error) {
          connectedAutobeeDeviceB.fail(error);
        }
      });

      // Wait a few seconds for the core on device A to be replicated to.
      await new Promise((resolve) => {
        setTimeout(resolve, 1000);
      });

      await connectedAutobeeDeviceB.execution(async () => {
        let result;
        try {
          result = await waitUntil(async () => {
            return await mnemeA.privateAutoBee.get(friend2Key);
          });

          connectedAutobeeDeviceB.ok(result, "the friend 2's data should also be retrievable on device A (replicated)");
          connectedAutobeeDeviceB.is(result.key, friend2Key, "and the index key should match");
          connectedAutobeeDeviceB.alike(
            result.value,
            { hash: friend2Hash, email: friend2Email },
            "and original data should match"
          );
        } catch (error) {
          connectedAutobeeDeviceB.fail(error);
        }
      });


      mnemeA && (await mnemeA.destroy());
      mnemeB && (await mnemeB.destroy());

      connectedAutobeeDeviceB.end();
      // success
      process.exit(0);
    };

    // Setup
    testnet = await createTestnet(2, { teardown: t.teardown });

    mnemeA = new Mneme(undefined, RAM.reusable(), testnet.bootstrap);
    mnemeA.swarm.on("connection", onConnection);

    t.teardown(async () => {
      mnemeA && (await mnemeA.destroy());
      mnemeB && (await mnemeB.destroy());
    });

    await mnemeA.start();

    t.test("autobee on device A", async (t) => {
      await t.execution(async () => {
        const isWritable = await waitUntil(
          () => mnemeA.privateAutoBee.writable
        );
        t.ok(isWritable, "should be writable");
      });
    });

    t.test("and when a friend is stored on device A", async (t) => {
      await mnemeA.addUser(friend1Email);

      await t.execution(async () => {
        let result;
        try {
          result = await waitUntil(async () => {
            return await mnemeA.privateAutoBee.get(friend1Key);
          });

          t.ok(result, "the friend's data should be retrievable");
          t.is(result.key, friend1Key, "and the index key should match");
          t.alike(
            result.value,
            { hash: friend1Hash, email: friend1Email },
            "and original data should match"
          );
        } catch (error) {
          t.fail(error);
        }
      });
    });

    const dbKeyA = b4a.toString(mnemeA.privateAutoBee.key, "hex");
    t.ok(
      dbKeyA,
      "and autobee on device (the server) A's database key should exist"
    );

    await t.execution(async () => {
      mnemeB = new Mneme(dbKeyA, RAM.reusable(), testnet.bootstrap, {
        onConnection,
      });

      mnemeB.swarm.on("connection", onConnection);

      await mnemeB.start();

      // wait a few seconds for the connection to be established
      await new Promise((resolve) => setTimeout(resolve, 1000));
    });
  });
});
