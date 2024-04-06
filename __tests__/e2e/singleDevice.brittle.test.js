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
    const isWritable = await waitUntil(() => mnemeA.privateAutoBee.writable);
    withPrivateAutobee.ok(isWritable, "should be writable");
  });

  await withPrivateAutobee;

  const whenUserDataIsStored = t.test("when user data is stored on device");
  whenUserDataIsStored.plan(6);

  // Action
  await mnemeA.addUser(user1Email);

  await whenUserDataIsStored.execution(async () => {
    let result;
    try {
      result = await waitUntil(async () => {
        return await mnemeA.privateAutoBee.get(user1Key);
      });

      whenUserDataIsStored.ok(result, "the user's data should be retrievable");
      whenUserDataIsStored.is(
        result.key,
        user1Key,
        "and the index key should match"
      );
      whenUserDataIsStored.alike(
        result.value,
        { hash: user1Hash, email: user1Email },
        "and original data should match"
      );
    } catch (error) {
      t.fail(error);
    }
  });

  const dbKeyA = b4a.toString(mnemeA.privateAutoBee.key, "hex");
  whenUserDataIsStored.ok(dbKeyA, "Database key should exist");

  whenUserDataIsStored.pass("User data is stored successfully on device");
  await whenUserDataIsStored;

  mnemeA && mnemeA.destroy();
});
