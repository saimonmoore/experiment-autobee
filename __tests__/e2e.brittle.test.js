import { test } from "brittle";
import RAM from "random-access-memory";
import b4a from "b4a";
import createTestnet from "hyperdht/testnet.js";
import { Mneme, sha256 } from "../index.js";
import { waitUntil } from "./testHelpers.js";

const friend1Email = "personalLocal@bar.com";
const friend1Hash = sha256(friend1Email);
const friend2Email = "personalRemote@bar.com";
const friend2Hash = sha256(friend2Email);

test("E2E test", async (t) => {
  let testnetA;
  let mnemeA;

  // Setup
  testnetA = await createTestnet(1, { teardown: t.teardown });
  t.teardown(() => testnetA.destroy(), { order: Infinity });

  mnemeA = new Mneme(undefined, RAM.reusable(), testnetA.bootstrap);

  t.teardown(() => mnemeA.destroy());

  await mnemeA.start();

  // Test Logic
  await t.execution(async () => {
    const isWritable = await waitUntil(() => mnemeA.privateAutoBee.writable);
    t.ok(isWritable, "privateAutoBee should be writable");
  });

  t.pass("Is writable!");

  await mnemeA.addFriend(friend1Email);
  const friend1Key = Mneme.USERS_KEY + friend1Hash;

  await t.execution(async () => {
    let result;
    try {
      result = await waitUntil(async () => {
        return await mnemeA.privateAutoBee.get(friend1Key);
      });

      t.ok(result, "Friend data should be retrieved");
      t.is(result.key, friend1Key, "Retrieved key should match");
      t.alike(
        result.value,
        { hash: friend1Hash, email: friend1Email },
        "Data should match"
      );
    } catch (error) {
      t.fail(error); // Ensure errors from waitUntil are reported by Brittle
    }
  });

  const dbKeyA = b4a.toString(mnemeA.privateAutoBee.key, "hex");
  t.ok(dbKeyA, "Database key should exist");
});
