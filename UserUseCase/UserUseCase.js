import { User } from "../User/index.js";

export class UserUseCase {
  currentUser;

  constructor(privateStore) {
    this.privateStore = privateStore;
  }

  loggedIn() {
    return !!this.currentUser;
  }

  loggedInUser() {
    return this.currentUser;
  }

  async signup(user) {
    await this.privateStore.appendOperation(
      JSON.stringify({
        type: User.ACTIONS.CREATE,
        user: user.toProperties(),
        writers: [this.privateStore.localPublicKeyString],
      })
    );

    return true;
  }

  async login(partialUser) {
    const record = await this.privateStore.get(partialUser.key);
    const user = record && User.fromProperties(record.value.user);

    if (user) this.currentUser = user;

    return user;
  }
}
