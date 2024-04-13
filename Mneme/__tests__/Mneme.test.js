import { jest, expect } from "@jest/globals";

jest.mock("corestore", () =>
  jest.fn().mockImplementation(() => ({
    namespace: jest.fn(),
  }))
);

const Corestore = await import("corestore").default;

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
    signup: jest.fn(),
    login: jest.fn(),
    loggedIn: jest.fn(),
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
      expect(SwarmManager).toHaveBeenCalledWith(mneme.privateStore, testingDHT);
      expect(PrivateStore).toHaveBeenCalledWith(expect.anything(), undefined);
    });
  });

  describe("when 2nd owner", () => {
    beforeEach(() => {
      mneme = new Mneme(bootstrapPrivateCorePublicKey, storage, testingDHT);
    });

    it("instantiates the private store and swarm manager", async () => {
      expect(SwarmManager).toHaveBeenCalledWith(mneme.privateStore, testingDHT);
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

  describe("signup", () => {
    let signupSpy;

    const user = new User({
      email: "test@example.com",
      username: "testuser",
    });

    beforeEach(() => {
      mneme = new Mneme(undefined, storage, testingDHT);

      jest.spyOn(mneme.userManager, "signup");
    });

    describe("when user is already logged in", () => {
      beforeEach(() => {
        mneme.userManager.loggedIn.mockReturnValue(true);
      });

      it("throws an error", async () => {
        await expect(mneme.signup(user)).rejects.toThrow(
          "User is already logged in"
        );
      });
    });

    describe("when user is not already logged in", () => {
      beforeEach(() => {
        mneme.userManager.loggedIn.mockReturnValue(false);
      });

      it("delegates to the UserManager", async () => {
        expect(await mneme.signup(user)).toBeTruthy();

        expect(mneme.userManager.signup).toHaveBeenCalledWith(user);
      });
    });
  });

  describe("login", () => {
    let loginSpy;

    const potentialUser = new User({
      email: "test@example.com",
      username: "testuser",
    });

    const actualUser = new User({
      email: "test@example.com",
      username: "testuser",
    });

    beforeEach(() => {
      mneme = new Mneme(undefined, storage, testingDHT);

      jest.spyOn(mneme.userManager, "login").mockResolvedValue(actualUser);
    });

    it("delegates to the UserManager", async () => {
      await mneme.login(potentialUser);

      expect(mneme.userManager.login).toHaveBeenCalledWith(potentialUser);
    });

    it("returns the actual user", async () => {
      const user = await mneme.login(potentialUser);

      expect(user.toProperties()).toStrictEqual(actualUser.toProperties());
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
