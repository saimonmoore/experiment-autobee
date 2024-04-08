import { User } from "../User/index.js";

export class UserUseCase {
  constructor(privateStore) {
    this.privateStore = privateStore;
  }

  async createUser(user) {
    await this.privateStore.appendOperation(
      JSON.stringify({
        type: User.ACTIONS.CREATE,
        user: user.toProperties(),
        writers: [this.privateStore.localPublicKeyString],
      })
    );
  }
}
