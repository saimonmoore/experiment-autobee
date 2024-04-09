import { jest, expect } from "@jest/globals";

jest.mock("corestore");

import Corestore from "corestore";

jest.unstable_mockModule("../../PrivateStore/PrivateStore.js", () => ({
  PrivateStore: jest.fn(() => ({
    start: jest.fn(),
    destroy: jest.fn(),
  })),
}));

jest.unstable_mockModule("../../SwarmManager/SwarmManager.js", () => ({
  SwarmManager: jest.fn(() => ({
    start: jest.fn(),
    destroy: jest.fn(),
  })),
}));

jest.unstable_mockModule("../../UserUseCase/UserUseCase.js", () => ({
  UserUseCase: jest.fn(() => ({
    createUser: jest.fn(),
  })),
}));


const { PrivateStore } = await import("../../PrivateStore/PrivateStore.js");
const { SwarmManager } = await import("../../SwarmManager/SwarmManager.js");
const { Mneme } = await import("../index.js");
const { User } = await import("../../User/index.js");

describe("Mneme", () => {
  let mneme;
  const bootstrapPrivateCorePublicKey = "bootstrapPrivateKey";
  const storage = "./data";
  const testingDHT = "testingDHT";

  describe("when initial owner", () => {
    beforeEach(() => {
      mneme = new Mneme(undefined, storage, testingDHT);
    });

    it("instantiates the private store and swarm manager", async () => {
      expect(SwarmManager).toHaveBeenCalledWith(
        expect.anything(),
        mneme.privateStore,
        testingDHT
      );
      expect(PrivateStore).toHaveBeenCalledWith(expect.anything(), undefined);
    });
  });

  describe("when 2nd owner", () => {
    beforeEach(() => {
      mneme = new Mneme(bootstrapPrivateCorePublicKey, storage, testingDHT);
    });

    it("instantiates the private store and swarm manager", async () => {
      expect(SwarmManager).toHaveBeenCalledWith(
        expect.anything(),
        mneme.privateStore,
        testingDHT
      );
      expect(PrivateStore).toHaveBeenCalledWith(
        expect.anything(),
        bootstrapPrivateCorePublicKey
      );
    });
  });

  describe("start", () => {
    beforeEach(() => {
      mneme = new Mneme(bootstrapPrivateCorePublicKey, storage, testingDHT);
    });

    it("should start private store and swarm manager", async () => {
      await mneme.start();

      expect(mneme.privateStore.start).toHaveBeenCalled();
      expect(mneme.swarmManager.start).toHaveBeenCalled();
    });
  });

  describe("createUser", () => {
    let createUserSpy;

    beforeEach(() => {
      mneme = new Mneme(undefined, storage, testingDHT);

      jest.spyOn(mneme.userManager, "createUser");
    });

    it("delegates to the UserManager", async () => {
      const user = new User({
        email: "test@example.com",
        username: "testuser",
      });

      await mneme.createUser(user);

      expect(mneme.userManager.createUser).toHaveBeenCalledWith(user);
    });
  });

  describe("destroy", () => {
    beforeEach(async () => {
      await mneme.destroy();
    });

    it("should destroy p2p connections", async () => {
      expect(mneme.swarmManager.destroy).toHaveBeenCalled();
      expect(mneme.privateStore.destroy).toHaveBeenCalled();
    });
  });
});
