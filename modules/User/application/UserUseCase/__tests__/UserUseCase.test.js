import { jest, expect } from "@jest/globals";

import { UserUseCase } from "../index.js";
import { User } from "../../../domain/entity/User/index.js";

describe("UserUseCase", () => {
  let userUseCase;
  let mockPrivateStore;
  let user;

  beforeEach(() => {
    mockPrivateStore = {
      appendOperation: jest.fn(),
      get: jest.fn(),
      localPublicKeyString: "testKey",
    };
    userUseCase = new UserUseCase(mockPrivateStore);
    user = new User({
      email: "test@example.com",
      username: "testuser",
    });
  });

  describe("when signup is called", () => {
    it("should call appendOperation with correct arguments", async () => {
      await userUseCase.signup(user);

      const expectedArgument = JSON.stringify({
        type: User.ACTIONS.CREATE,
        user: user.toProperties(),
        writers: [mockPrivateStore.localPublicKeyString],
      });

      expect(mockPrivateStore.appendOperation).toHaveBeenCalledWith(
        expectedArgument
      );
    });
  });

  describe("when login is called", () => {
    const email = "foo@bar.com";
    const username = "foobar";

    const partialUser = new User({ email });
    const user = new User({ email, username });

    describe("when user is not found", () => {
      beforeEach(() => {
        mockPrivateStore.get.mockResolvedValue(null);
      });

      it("calls privateStore#get with correct arguments", async () => {
        const record = await userUseCase.login(partialUser);

        expect(mockPrivateStore.get).toHaveBeenCalledWith(partialUser.key);
      });

      it("returns null", async () => {
        const record = await userUseCase.login(partialUser);

        expect(record).toBeFalsy();
      });
    });

    describe("when user is found", () => {
      beforeEach(() => {
        mockPrivateStore.get.mockResolvedValue({
          value: { user: user.toProperties() },
        });
      });

      it("calls privateStore#get with correct arguments", async () => {
        const record = await userUseCase.login(partialUser);

        expect(mockPrivateStore.get).toHaveBeenCalledWith(partialUser.key);
      });

      it("returns user", async () => {
        const record = await userUseCase.login(partialUser);

        expect(record.toProperties()).toStrictEqual(user.toProperties());
      });

      it("sets logged in user", async () => {
        await userUseCase.login(partialUser);

        expect(userUseCase.loggedInUser()).toBeInstanceOf(User);
        expect(userUseCase.loggedInUser().toProperties()).toStrictEqual(
          user.toProperties()
        );
        expect(userUseCase.loggedIn()).toBe(true);
      });
    });
  });
});
