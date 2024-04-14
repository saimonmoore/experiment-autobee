import { User } from "../../domain/entity/User/index.js";

export class UserIndexer {
  constructor(privateStore) {
    this.privateStore = privateStore;
  }

  async handleOperation(batch, operation) {
    if (operation.type === User.ACTIONS.CREATE) {
      await this.indexUsers(batch, operation);
    }

    if (operation.type === User.ACTIONS.UPDATE) {
      await this.indexUsers(batch, operation);
    }
  }

  async indexUsers(batch, operation) {
    const { user: userData } = operation;
    const writers = operation.writers || [];

    const user = new User(userData);
    user.writers = writers;

    // Check if the user already exists
    // get() is proxied to the underlying autobee
    const result = await this.privateStore.get(user.key);

    if (result) {
      const existingUser = result.value?.user;
      const existingWriters = result.value?.writers || [];
    }

    await batch.put(user.key, {
      user: user.toProperties(),
      writers: user.writers,
    });
  }
}
