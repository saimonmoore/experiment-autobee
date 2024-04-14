import { User } from "../../domain/entity/User/index.js";

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
    const writers = [this.privateStore.localPublicKeyString];

    await this.privateStore.appendOperation(
      JSON.stringify({
        type: User.ACTIONS.CREATE,
        user: user.toProperties(),
        writers,
      })
    );

    if (user) {
      user.writers = writers;
      this.currentUser = user;
    }

    return true;
  }

  async login(partialUser) {
    const record = await this.privateStore.get(partialUser.key);
    const user = record && User.fromProperties(record.value.user);

    if (user) {
      user.writers = record.value.writers;
      this.currentUser = user;
    }

    return user;
  }

  async directLogin(userKey) {
    const record = await this.privateStore.get(userKey);
    const user = record && User.fromProperties(record.value.user);

    if (user) {
      user.writers = record.value.writers;
      this.currentUser = user;
    }

    return user;
  }

  async updateWriter(writer) {
    this.loggedInUser().writers = writer;

    console.log("[UserUseCase#updateWriter] updating writer", {
      writer,
      writers: this.loggedInUser().writers,
      writers_: this.loggedInUser()._writers,
      user: this.loggedInUser().toProperties(),
    });

    await this.privateStore.appendOperation(
      JSON.stringify({
        type: User.ACTIONS.UPDATE,
        user: this.loggedInUser().toProperties(),
        writers: this.loggedInUser().writers,
      })
    );

    const record = await this.privateStore.get(this.loggedInUser().key);

    console.log("[UserUseCase#updateWriter] GOT current user data", {
      userKey: this.loggedInUser().key,
      writers: record?.writers,
      user: record?.user,
    });
  }
}
