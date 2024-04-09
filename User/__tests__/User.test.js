import { jest, expect } from "@jest/globals";

jest.unstable_mockModule("../../helpers/sha256.js", () => ({
  sha256: jest.fn(),
}));

const { sha256 } = await import("../../helpers/sha256.js");
const { User } = await import("../../User/index.js");

describe("User", () => {
  let user;
  const mockHash = "mockHash";

  beforeEach(() => {
    sha256.mockReturnValue(mockHash);

    user = new User({
      email: "test@example.com",
      username: "testuser",
    });
  });

  it("should return correct properties when toProperties is called", () => {
    const expectedProperties = {
      hash: mockHash,
      email: "test@example.com",
      username: "testuser",
    };

    expect(user.toProperties()).toEqual(expectedProperties);
  });

  it("should return correct key", () => {
    const expectedKey = User.USERS_KEY + mockHash;

    expect(user.key).toEqual(expectedKey);
  });

  it("should create user from properties correctly", () => {
    const properties = {
      email: "test@example.com",
      username: "testuser",
    };

    const userFromProperties = User.fromProperties(properties);

    expect(userFromProperties.toProperties()).toEqual(user.toProperties());
  });
});
