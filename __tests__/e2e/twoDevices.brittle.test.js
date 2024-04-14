import { test } from "brittle";
import RAM from "random-access-memory";
import b4a from "b4a";
import createTestnet from "hyperdht/testnet.js";

import { Mneme } from "../../Mneme/Mneme.js";
import { User } from "../../User/User.js";
import { waitUntil } from "../testHelpers.js";

const user1Email = "personalLocal@bar.com";
const user1 = User.fromProperties({
  email: user1Email,
  username: user1Email.split("@")[0],
});

const user2Email = "personalRemote@bar.com";
const user2 = User.fromProperties({
  email: user2Email,
  username: user2Email.split("@")[0],
});

test("when I have two devices", async (t) => {
  let testnet;
  let mnemeA;
  let mnemeB;

  const onConnection = async (connection, peerInfo) => {
    console.log(
      "[TEST] onConnection =====================> ",
      connection,
      peerInfo
    );
    const numberOfPeersA = mnemeA.swarmManager.swarm.peers.size;
    const numberOfPeersB = mnemeB.swarmManager.swarm.peers.size;
    console.log(
      "[TEST] onConnection =====================> ",
      numberOfPeersA,
      numberOfPeersB
    );

    if (numberOfPeersA < 1 || numberOfPeersB < 1) {
      return;
    }

    // PLAN: Autobee on device B has user stored on device A replicated to it
    const autobeeDeviceBIsReplicated = t.test(
      "autobee on device B has user stored on device A replicated to it"
    );
    autobeeDeviceBIsReplicated.plan(10);

    autobeeDeviceBIsReplicated.ok(
      numberOfPeersB === 1,
      "device A connected to device B"
    );
    autobeeDeviceBIsReplicated.ok(
      numberOfPeersA === 1,
      "device B connected to device A"
    );
    autobeeDeviceBIsReplicated.is(
      mnemeB.privateStore.autoBee.writable,
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
          return await mnemeB.privateStore.get(user1.key);
        });

        autobeeDeviceBIsReplicated.ok(
          result,
          "the user's data should be replicated"
        );
        autobeeDeviceBIsReplicated.is(
          result.key,
          user1.key,
          "and the index key should match"
        );
        autobeeDeviceBIsReplicated.alike(
          result.value.user,
          { hash: user1.hash, email: user1.email, username: user1.username },
          "and original data should match"
        );
      } catch (error) {
        t.fail(error);
      }
    });

    // Wait a few seconds for the core on device B to become writable
    // and for device B's autobee to become synchronized
    await new Promise((resolve) => {
      setTimeout(resolve, 1000);
    });

    autobeeDeviceBIsReplicated.is(
      mnemeB.privateStore.autoBee.writable,
      true,
      "should be writable"
    );

    // Wait a few more seconds for the auth handshake to complete and device B to be directly logged in.
    await new Promise((resolve) => {
      setTimeout(resolve, 3000);
    });

    autobeeDeviceBIsReplicated.ok(
      mnemeB.loggedIn(),
      "should be logged in on device B"
    );

    autobeeDeviceBIsReplicated.alike(
      mnemeB.loggedInUser().writers,
      [
        mnemeA.privateStore.publicKeyString,
        mnemeB.privateStore.localPublicKeyString,
      ],
      "should have both device A and device B's public keys as writers"
    );

    // TODO: This should be some other mutation but not signup nor login
    // ACTION: Store user data from device B
    // await mnemeB.signup(user2);

    // await autobeeDeviceBIsReplicated.execution(async () => {
    //   let result;
    //   try {
    //     result = await waitUntil(async () => {
    //       return await mnemeB.privateStore.get(user2.key);
    //     });

    //     autobeeDeviceBIsReplicated.ok(
    //       result,
    //       "the user 2's data should be retrievable on device B"
    //     );
    //     autobeeDeviceBIsReplicated.is(
    //       result.key,
    //       user2.key,
    //       "and the index key should match"
    //     );
    //     autobeeDeviceBIsReplicated.alike(
    //       result.value.user,
    //       { hash: user2.hash, email: user2.email, username: user2.username },
    //       "and original data should match"
    //     );
    //   } catch (error) {
    //     t.fail(error);
    //   }
    // });

    // // Wait a few seconds for the core on device A to be replicated to.
    // await new Promise((resolve) => {
    //   setTimeout(resolve, 1000);
    // });

    // await autobeeDeviceBIsReplicated.execution(async () => {
    //   let result;
    //   try {
    //     result = await waitUntil(async () => {
    //       return await mnemeA.privateStore.get(user2.key);
    //     });

    //     autobeeDeviceBIsReplicated.ok(
    //       result,
    //       "the user 2's data should also be retrievable on device A (replicated)"
    //     );
    //     autobeeDeviceBIsReplicated.is(
    //       result.key,
    //       user2.key,
    //       "and the index key should match"
    //     );
    //     autobeeDeviceBIsReplicated.alike(
    //       result.value.user,
    //       { hash: user2.hash, email: user2.email, username: user2.username },
    //       "and original data should match"
    //     );
    //   } catch (error) {
    //     t.fail(error);
    //   }
    // });

    mnemeA && (await mnemeA.destroy());
    mnemeB && (await mnemeB.destroy());

    await autobeeDeviceBIsReplicated;
  };

  // Setup
  testnet = await createTestnet(2, { teardown: t.teardown });

  mnemeA = new Mneme(undefined, RAM.reusable(), testnet.bootstrap);
  mnemeA.swarmManager.swarm.on("connection", onConnection);

  // t.teardown(async () => {
  //   mnemeA && (await mnemeA.destroy());
  //   mnemeB && (await mnemeB.destroy());
  // });

  // ACTION: Start mneme on device A
  console.log(
    "[TEST] whenSignupOnDeviceA =====================> STARTING MNEME A"
  );
  await mnemeA.start();

  // wait a few seconds for the first device to join the swarm...
  await new Promise((resolve) => setTimeout(resolve, 3000));

  // PLAN: When signup up for first time on device A
  const whenSignupOnDeviceA = t.test(
    "when signup up for first time on device A"
  );
  whenSignupOnDeviceA.plan(3);
  await whenSignupOnDeviceA.execution(async () => {
    const isWritable = await waitUntil(
      () => mnemeA.privateStore.autoBee.writable
    );
    whenSignupOnDeviceA.ok(isWritable, "should be writable");
  });

  whenSignupOnDeviceA.pass("private autobee is writable on device A");
  await whenSignupOnDeviceA;

  // PLAN: When user data is stored on device A
  const whenUserDataIsStoredOnDeviceA = t.test(
    "and when a user is stored on private autobee on device A"
  );
  whenUserDataIsStoredOnDeviceA.plan(6);

  // ACTION: Store user data from device A
  await mnemeA.signup(user1);

  await whenUserDataIsStoredOnDeviceA.execution(async () => {
    let result;
    try {
      result = await waitUntil(async () => {
        return await mnemeA.privateStore.get(user1.key);
      });

      whenUserDataIsStoredOnDeviceA.ok(
        result,
        "the user's data should be retrievable"
      );
      whenUserDataIsStoredOnDeviceA.is(
        result.key,
        user1.key,
        "and the index key should match"
      );
      whenUserDataIsStoredOnDeviceA.alike(
        result.value.user,
        { hash: user1.hash, email: user1.email, username: user1.username },
        "and original data should match"
      );
    } catch (error) {
      t.fail(error);
    }
  });
  whenUserDataIsStoredOnDeviceA.ok(
    mnemeA.loggedIn(),
    "user is logged in on device A"
  );
  whenUserDataIsStoredOnDeviceA.pass(
    "user data is stored on device A and is logged in"
  );
  await whenUserDataIsStoredOnDeviceA;

  // PLAN: When user attempts to synchronize device B with device A
  const whenUserLogInOnOnDeviceB = t.test(
    "and when user attempts to synchronize device B with device A"
  );
  whenUserLogInOnOnDeviceB.plan(3);

  const dbKeyA = mnemeA.privateStore.publicKeyString;
  whenUserLogInOnOnDeviceB.ok(
    dbKeyA,
    "and autobee on device (the server) A's database key should exist"
  );

  await whenUserLogInOnOnDeviceB.execution(async () => {
    mnemeB = new Mneme(dbKeyA, RAM.reusable(), testnet.bootstrap);
    // mnemeB.swarmManager.swarm.on("connection", onConnection);

    console.log(
      "[TEST] whenUserLogInOnOnDeviceB =====================> STARTING MNEME B",
      { dbKeyA }
    );
    await mnemeB.start();

    // wait a few seconds for the connection to be established
    await new Promise((resolve) => setTimeout(resolve, 2000));
  });
  whenUserLogInOnOnDeviceB.pass("device B is connected to device A");
  await whenUserLogInOnOnDeviceB;
});
