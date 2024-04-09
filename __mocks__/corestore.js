import { jest } from "@jest/globals";

export default function () {
  return {
    namespace: jest.fn().mockImplementation(() => jest.fn()),
  };
}
