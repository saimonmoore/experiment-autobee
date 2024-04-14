import { sha256 } from "../../../../../helpers/sha256.js";

export class Record {
  static RECORDS_KEY = "org.mneme.records!";
  static ACTIONS = {
    CREATE: "createRecord",
  };

  constructor({ url }) {
    this.url = url;
  }

  static fromProperties(properties) {
    return new Record(properties);
  }

  get hash() {
    return sha256(this.url);
  }

  get key() {
    return Record.RECORDS_KEY + this.hash;
  }

  toProperties() {
    return {
      hash: this.hash,
      url: this.url,
    };
  }
}
