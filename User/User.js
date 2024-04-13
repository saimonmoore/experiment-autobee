import { sha256 } from "../helpers/sha256.js";

export class User {
  static USERS_KEY = "org.mneme.users!";
  static ACTIONS = {
    CREATE: "createUser",
    UPDATE: "updateUser",
  };

  constructor({ email, username }) {
    this.email = email;
    this.username = username;
    this._writers = new Set();
  }

  static fromProperties(properties) {
    return new User(properties);
  }

  get hash() {
    return sha256(this.email);
  }

  get key() {
    return User.USERS_KEY + this.hash;
  }

  set writers(writers) {
    Array(writers || [])
      .flat()
      .forEach((writer) => this._writers.add(writer));
  }

  get writers() {
    return Array.from(this._writers);
  }

  toProperties() {
    return {
      hash: this.hash,
      email: this.email,
      username: this.username,
    };
  }
}
