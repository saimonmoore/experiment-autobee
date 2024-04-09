import { jest, expect } from "@jest/globals";

import { UserUseCase } from "../index.js";
import { User } from "../../User/index.js";

describe("UserUseCase", () => {
  let userUseCase;
  let mockPrivateStore;
  let user;

  beforeEach(() => {
    mockPrivateStore = {
      appendOperation: jest.fn(),
      localPublicKeyString: "testKey",
    };
    userUseCase = new UserUseCase(mockPrivateStore);
    user = new User({
      email: "test@example.com",
      username: "testuser",
    });
  });

  it("should call appendOperation with correct arguments when createUser is called", async () => {
    await userUseCase.createUser(user);

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
