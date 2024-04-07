import { sha256 } from "./sha256.js";

export class User {
  static USERS_KEY = "org.mneme.users!";
  static ACTIONS = {
    CREATE: "createUser",
  };

  constructor({ email, username }) {
    this.email = email;
    this.username = username;
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

  toProperties() {
    return {
      hash: this.hash,
      email: this.email,
      username: this.username,
    };
  }
}
