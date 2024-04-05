import RAM from "random-access-memory";
import createTestnet from "hyperdht/testnet";
import b4a from "b4a";
import { Mneme, sha256 } from "../index";
import { waitUntil } from "./testHelpers";

describe("E2E tests", () => {
  let mnemeA;
  let mnemeB;
  let testnetA;
  let testnetB;

  const friend1Email = "personalLocal@bar.com";
  const friend1Hash = sha256(friend1Email);
  const friend2Email = "personalRemote@bar.com";
  const friend2Hash = sha256(friend2Email);

  beforeEach((done) => {
    testnetA = createTestnet(1, { teardown: done });
    // testnetB = createTestnet(3, done);
  });

  afterEach(async () => {
    mnemeA && (await mnemeA.destroy());
    // mnemeB && await mnemeB.destroy();
  });

  describe("Owner device", () => {
    beforeEach(async () => {
      mnemeA = new Mneme(undefined, RAM.reusable(), testnetA.bootstrap);

      await mnemeA.start();
    });

    it("should allow inserting a friend", async () => {
      await expect(
        waitUntil(async () => mnemeA.privateAutoBee.writable)
      ).resolves.toBe(true);

      await mnemeA.addFriend(friend1Email);

      const friend1Key = Mneme.USERS_KEY + friend1Hash;

      // Now I expect to be able to retrieve the friend from the autobee
      await expect(
        waitUntil(async () => {
          const result = await mnemeA.privateAutoBee.get(friend1Key);
          expect(result.key).toBe(friend1Key);

          return result.value;
        })
      ).resolves.toStrictEqual({ hash: friend1Hash, email: friend1Email });

      const dbKeyA = b4a.toString(mnemeA.privateAutoBee.key, "hex");

      console.log({ dbKeyA });
      expect(dbKeyA).not.toBeUndefined();

      // Now I login on my other device
      // mnemeB = new Mneme(dbKeyA, RAM.reusable(), testnetB.bootstrap);
      // await mnemeB.start();

      // // Other device autobee should not be writable at this stage
      // await expect(
      //   waitUntil(async () => mnemeB.privateAutoBee.writable)
      // ).resolves.toBe(false);

      // // I also expect to be able to retrieve the friend from the other devie's autobee
      // await expect(
      //   waitUntil(async () => {
      //     const result = await mnemeB.privateAutoBee.get(friend1Key);
      //     expect(result.key).toBe(friend1Key);

      //     return result.value;
      //   })
      // ).resolves.toStrictEqual({ hash: friend1Hash, email: friend1Email });
    });
  });
});
