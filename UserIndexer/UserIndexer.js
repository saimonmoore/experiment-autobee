import { User } from "../User/index.js";

export class UserIndexer {
  constructor(privateStore) {
    this.privateStore = privateStore;
  }

  async handleOperation(batch, operation) {
    if (operation.type === User.ACTIONS.CREATE) {
      await this.indexUsers(batch, operation);
    }
  }

  async indexUsers(batch, operation) {
    const { user: userData } = operation;
    const writers = operation.writers || [];
    const user = new User(userData);

    // Check if the user already exists
    // get() is proxied to the underlying autobee
    console.log("[UserIndexer#indexUsers] getting user...", { user });
    const result = await this.privateStore.get(user.key);
    let existingWriters = [];

    // If doesn't exist, we can assume it's the first time the user is being added
    // because it's the private core and only the device owner can write to it
    // and all the device owner's devices should be in sync.
    // Action: We add the writer of the private core to the user's data.
    // If the user already exists, we can assume it's a new writer being added
    // because the user already exists and the account owner is adding the writer of
    // their other device to the user's data.
    // Action: We append the new writer to the user's data, so 'writers' should be a Set.
    if (result) {
      const existingUser = result.value?.user;
      existingWriters = result.value?.writers || [];

      console.log("[UserIndexer#indexUsers] User already exists", {
        hash: user.hash,
        key: user.key,
        newUser: user,
        existingUser: existingUser,
        existingWriters,
        newWriters: writers,
      });
    }

    console.log("[UserIndexer#indexUsers] Indexing user", {
      user,
      hash: user.hash,
      key: user.key,
    });

    await batch.put(user.key, {
      user: user.toProperties(),
      writers: Array.from(new Set([...existingWriters, ...writers])),
    });
  }
}
