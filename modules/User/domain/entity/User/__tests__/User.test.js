import { jest, expect } from "@jest/globals";

jest.unstable_mockModule("../../../../../../helpers/sha256.js", () => ({
  sha256: jest.fn(),
}));

const { sha256 } = await import("../../../../../../helpers/sha256.js");
const { User } = await import("../index.js");

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

  describe("#toProperties", () => {
    it("returns correct properties", () => {
      const expectedProperties = {
        hash: mockHash,
        email: "test@example.com",
        username: "testuser",
      };

      expect(user.toProperties()).toEqual(expectedProperties);
    });
  });

  describe("#key", () => {
    it("should return correct key", () => {
      const expectedKey = User.USERS_KEY + mockHash;

      expect(user.key).toEqual(expectedKey);
    });
  });

  describe("#fromProperties", () => {
    it("should create user from properties correctly", () => {
      const properties = {
        email: "test@example.com",
        username: "testuser",
      };

      const userFromProperties = User.fromProperties(properties);

      expect(userFromProperties.toProperties()).toEqual(user.toProperties());
    });
  });

  describe("#get/set writers", () => {
    it("adds unique writers", () => {
      const properties = {
        email: "test@example.com",
        username: "testuser",
      };
      const writers = ["writer1", "writer2", "writer1"];
      const expectedWriters = ["writer1", "writer2"];

      const userFromProperties = User.fromProperties(properties);
      userFromProperties.writers = writers;

      expect(userFromProperties.writers).toEqual(expectedWriters);
    });
  });
});
