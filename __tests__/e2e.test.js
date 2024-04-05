import RAM from "random-access-memory";
import createTestnet from "hyperdht/testnet";
import b4a from "b4a";
import { Mneme, sha256 } from "../index";

// const waitUntil = (condition) =>
//   new Promise((resolve) => {
//     setTimeout(() => resolve(condition), 1000);
//   });

// const waitUntil = (condition, timeout = 3000, interval = 100) =>
//   new Promise((resolve, reject) => {
//     const check = () => {
//       const result = condition(); // Evaluate the condition and store the result
//       if (result) {
//         resolve(result); // Resolve with the result of the condition
//       } else {
//         setTimeout(check, interval);
//       }
//     };

//     setTimeout(() => reject("Timeout exceeded"), timeout);
//     check();
//   });

// const waitUntil = async (condition, timeout = 3000, interval = 100) =>
//   new Promise((resolve, reject) => {
//     const check = async () => {
//       try {
//         const result = await condition(); // Await the potential promise
//         resolve(result);
//       } catch (error) {
//         reject(error); // Forward errors from the condition promise
//       }
//     };

//     setTimeout(() => reject("Timeout exceeded"), timeout);
//     check();
//   });

const waitUntil = async (condition, timeout = 3000, interval = 100) =>
  new Promise((resolve, reject) => {
    let timeoutId; // Store the timeout ID

    const check = async () => {
      try {
        const result = await condition();
        clearTimeout(timeoutId); // Clear timeout on success
        resolve(result);
      } catch (error) {
        clearTimeout(timeoutId); // Clear timeout on error
        reject(error);
      }
    };

    timeoutId = setTimeout(() => {
      clearTimeout(timeoutId); // Redundant, but safe
      reject("Timeout exceeded");
    }, timeout);

    check();
  });

describe("E2E tests", () => {
  let testnet;
  let mneme;

  const friend1Email = "personalLocal@bar.com";
  const friend1Hash = sha256(friend1Email);
  const friend2Email = "personalRemote@bar.com";
  const friend2Hash = sha256(friend2Email);

  beforeAll(async () => {
    testnet = await createTestnet();
  });

  afterAll(async () => {
    testnet.destroy();
  });

  describe("Owner device", () => {
    const mnemeA = new Mneme(undefined, RAM.reusable(), testnet);

    beforeEach(async () => {
      await mnemeA.start();
    });

    it("should allow inserting a friend", async () => {
      await expect(
        waitUntil(async () => mnemeA.privateAutoBee.writable)
      ).resolves.toBe(true);

      await mnemeA.addFriend(friend1Email);

      const friend1Key = Mneme.USERS_KEY + friend1Hash;

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
      const mnemeB = new Mneme(dbKeyA, RAM.reusable(), testnet);
      await mnemeB.start();

    });
  });
});
