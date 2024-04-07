import { test } from "brittle";
import RAM from "random-access-memory";
import b4a from "b4a";
import createTestnet from "hyperdht/testnet.js";
import { Mneme } from "../../Mneme.js";
import { User } from "../../User.js";
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
const user2Key = user2.key;

test("When single own device A, ", async (t) => {
  const withPrivateAutobee = t.test("with private autobee");
  withPrivateAutobee.plan(2);

  let testnet;
  let mnemeA;

  // Setup
  testnet = await createTestnet(1, { teardown: t.teardown });
  t.teardown(() => testnet.destroy(), { order: Infinity });

  mnemeA = new Mneme(undefined, RAM.reusable(), testnet.bootstrap);

  // Action
  await mnemeA.start();

  await withPrivateAutobee.execution(async () => {
    const isWritable = await waitUntil(() => mnemeA.privateStore.autoBee.writable);
    withPrivateAutobee.ok(isWritable, "should be writable");
  });

  await withPrivateAutobee;

  const whenUserDataIsStored = t.test("when user data is stored on device");
  whenUserDataIsStored.plan(6);

  // Action
  await mnemeA.createUser(user1);

  await whenUserDataIsStored.execution(async () => {
    let result;
    try {
      result = await waitUntil(async () => {
        return await mnemeA.privateStore.get(user1.key);
      });

      whenUserDataIsStored.ok(result, "the user's data should be retrievable");
      whenUserDataIsStored.is(
        result.key,
        user1.key,
        "and the index key should match"
      );
      whenUserDataIsStored.alike(
        result.value.user,
        {
          hash: user1.hash,
          email: user1.email,
          username: user1.username,
        },
        "and original data should match"
      );
    } catch (error) {
      t.fail(error);
    }
  });

  const dbKeyA = mnemeA.privateStore.publicKeyString;
  whenUserDataIsStored.ok(dbKeyA, "Database key should exist");

  whenUserDataIsStored.pass("User data is stored successfully on device");
  await whenUserDataIsStored;

  mnemeA && mnemeA.destroy();
});
