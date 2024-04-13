import Corestore from "corestore";
import goodbye from "graceful-goodbye";

import { PrivateStore } from "../PrivateStore/index.js";
import { SwarmManager } from "../SwarmManager/index.js";
import { UserUseCase } from "../UserUseCase/index.js";

export class Mneme {
  constructor(bootstrapPrivateCorePublicKey, storage, testingDHT) {
    // Persistence
    this.corestore = new Corestore(storage || "./data");

    this.privateStore = new PrivateStore(
      this.corestore,
      bootstrapPrivateCorePublicKey
    );

    // Application
    this.userManager = new UserUseCase(this.privateStore);

    // Networking
    this.swarmManager = new SwarmManager(
      this.privateStore,
      testingDHT
    );
  }

  async start() {
    await this.privateStore.start();
    // Wait for the main user to login/signup before starting the swarm
    await this.swarmManager.start();

    goodbye(async () => {
      await this.destroy();
    });
  }

  async signup(potentialUser) {
    if (this.userManager.loggedIn()) {
      throw new Error("User is already logged in");
    }

    await this.userManager.signup(potentialUser);

    return potentialUser;
  }

  async login(partialUser) {
    return this.userManager.login(partialUser);
  }

  async destroy() {
    console.log("[Mneme#destroy] destroying p2p connections...");

    await this.swarmManager.destroy();
    await this.privateStore.destroy();
  }

  info() {
    console.log("Usage:");
    console.log();
    console.log("On first node:");
    console.log();
    console.log("`hrepl index.js`");
    console.log();
    console.log("On other nodes:");
    console.log();
    console.log(
      'hrepl index.js "privateCorePublicKeyFromFirstNode" "./data2"'
    );
  }
}
