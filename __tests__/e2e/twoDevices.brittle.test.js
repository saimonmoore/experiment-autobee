import { test } from "brittle";
import RAM from "random-access-memory";
import b4a from "b4a";
import createTestnet from "hyperdht/testnet.js";
import { Mneme, sha256 } from "../../index.js";
import { waitUntil } from "../testHelpers.js";

const user1Email = "personalLocal@bar.com";
const user1Hash = sha256(user1Email);
const user1Key = Mneme.USERS_KEY + user1Hash;
const user2Email = "personalRemote@bar.com";
const user2Hash = sha256(user2Email);
const user2Key = Mneme.USERS_KEY + user2Hash;

test("when I have two devices", async (t) => {
  let testnet;
  let mnemeA;
  let mnemeB;

  const onConnection = async (connection, peerInfo) => {
    const numberOfPeersA = mnemeA.swarm.peers.size;
    const numberOfPeersB = mnemeB.swarm.peers.size;

    if (numberOfPeersA < 1 || numberOfPeersB < 1) {
      return;
    }

    const autobeeDeviceBIsReplicated = t.test("autobee on device B has user stored on device A replicated to it");
    autobeeDeviceBIsReplicated.plan(16);

    autobeeDeviceBIsReplicated.ok(
      numberOfPeersB === 1,
      "device A connected to device B"
    );
    autobeeDeviceBIsReplicated.ok(
      numberOfPeersA === 1,
      "device B connected to device A"
    );
    autobeeDeviceBIsReplicated.is(
      mnemeB.privateAutoBee.writable,
      false,
      "should NOT be writable"
    );

    // wait a few seconds for the cores to be fully replicated
    await new Promise((resolve) => {
      setTimeout(resolve, 1000);
    });

    await autobeeDeviceBIsReplicated.execution(async () => {
      let result;
      try {
        result = await waitUntil(async () => {
          return await mnemeB.privateAutoBee.get(user1Key);
        });

        autobeeDeviceBIsReplicated.ok(
          result,
          "the user's data should be replicated"
        );
        autobeeDeviceBIsReplicated.is(
          result.key,
          user1Key,
          "and the index key should match"
        );
        autobeeDeviceBIsReplicated.alike(
          result.value,
          { hash: user1Hash, email: user1Email },
          "and original data should match"
        );
      } catch (error) {
        t.fail(error);
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

    autobeeDeviceBIsReplicated.is(
      mnemeB.privateAutoBee.writable,
      true,
      "should be writable"
    );

    await mnemeB.addUser(user2Email);

    await autobeeDeviceBIsReplicated.execution(async () => {
      let result;
      try {
        result = await waitUntil(async () => {
          return await mnemeB.privateAutoBee.get(user2Key);
        });

        autobeeDeviceBIsReplicated.ok(
          result,
          "the user 2's data should be retrievable on device B"
        );
        autobeeDeviceBIsReplicated.is(
          result.key,
          user2Key,
          "and the index key should match"
        );
        autobeeDeviceBIsReplicated.alike(
          result.value,
          { hash: user2Hash, email: user2Email },
          "and original data should match"
        );
      } catch (error) {
        t.fail(error);
      }
    });

    // Wait a few seconds for the core on device A to be replicated to.
    await new Promise((resolve) => {
      setTimeout(resolve, 1000);
    });

    await autobeeDeviceBIsReplicated.execution(async () => {
      let result;
      try {
        result = await waitUntil(async () => {
          return await mnemeA.privateAutoBee.get(user2Key);
        });

        autobeeDeviceBIsReplicated.ok(
          result,
          "the user 2's data should also be retrievable on device A (replicated)"
        );
        autobeeDeviceBIsReplicated.is(
          result.key,
          user2Key,
          "and the index key should match"
        );
        autobeeDeviceBIsReplicated.alike(
          result.value,
          { hash: user2Hash, email: user2Email },
          "and original data should match"
        );
      } catch (error) {
        t.fail(error);
      }
    });

    mnemeA && (await mnemeA.destroy());
    mnemeB && (await mnemeB.destroy());

    await autobeeDeviceBIsReplicated;
  };

  // Setup
  testnet = await createTestnet(2, { teardown: t.teardown });

  mnemeA = new Mneme(undefined, RAM.reusable(), testnet.bootstrap);
  mnemeA.swarm.on("connection", onConnection);

  t.teardown(async () => {
    mnemeA && (await mnemeA.destroy());
    mnemeB && (await mnemeB.destroy());
  });

  // ACTION
  await mnemeA.start();

  const whenSignupOnDeviceA = t.test(
    "when signup up for first time on device A"
  );
  whenSignupOnDeviceA.plan(3);
  await whenSignupOnDeviceA.execution(async () => {
    const isWritable = await waitUntil(() => mnemeA.privateAutoBee.writable);
    whenSignupOnDeviceA.ok(isWritable, "should be writable");
  });

  whenSignupOnDeviceA.pass("private autobee is writable on device A");
  await whenSignupOnDeviceA;

  const whenUserDataIsStoredOnDeviceA = t.test(
    "and when a user is stored on private autobee on device A"
  );
  whenUserDataIsStoredOnDeviceA.plan(5);

  // ACTION
  await mnemeA.addUser(user1Email);

  await whenUserDataIsStoredOnDeviceA.execution(async () => {
    let result;
    try {
      result = await waitUntil(async () => {
        return await mnemeA.privateAutoBee.get(user1Key);
      });

      whenUserDataIsStoredOnDeviceA.ok(
        result,
        "the user's data should be retrievable"
      );
      whenUserDataIsStoredOnDeviceA.is(
        result.key,
        user1Key,
        "and the index key should match"
      );
      whenUserDataIsStoredOnDeviceA.alike(
        result.value,
        { hash: user1Hash, email: user1Email },
        "and original data should match"
      );
    } catch (error) {
      t.fail(error);
    }
  });
  whenUserDataIsStoredOnDeviceA.pass("user data is stored on device A");
  await whenUserDataIsStoredOnDeviceA;

  const whenUserLogInOnOnDeviceB = t.test("and when user logs in on device B");
  whenUserLogInOnOnDeviceB.plan(3);

  const dbKeyA = b4a.toString(mnemeA.privateAutoBee.key, "hex");
  whenUserLogInOnOnDeviceB.ok(
    dbKeyA,
    "and autobee on device (the server) A's database key should exist"
  );

  await whenUserLogInOnOnDeviceB.execution(async () => {
    mnemeB = new Mneme(dbKeyA, RAM.reusable(), testnet.bootstrap, {
      onConnection,
    });

    mnemeB.swarm.on("connection", onConnection);

    await mnemeB.start();

    // wait a few seconds for the connection to be established
    await new Promise((resolve) => setTimeout(resolve, 1000));
  });
  whenUserLogInOnOnDeviceB.pass("device B is connected to device A");
  await whenUserLogInOnOnDeviceB;
});
