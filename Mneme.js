import Corestore from "corestore";
import goodbye from "graceful-goodbye";

import { PrivateStore } from "./PrivateStore.js";
import { SwarmManager } from "./SwarmManager.js";
import { UserUseCase } from "./UserUseCase.js";

export class Mneme {
  constructor(bootstrapPrivateCorePublicKey, storage, testingDHT) {
    // Persistence
    this.corestore = new Corestore(storage || "./data");
    this.privateCores = this.corestore.namespace("private");
    this.privateStore = new PrivateStore(
      this.privateCores,
      bootstrapPrivateCorePublicKey
    );

    // Application
    this.userManager = new UserUseCase(this.privateStore);

    // Networking
    this.swarmManager = new SwarmManager(
      this.corestore,
      this.privateStore,
      testingDHT
    );
  }

  async start() {
    await this.privateStore.start();
    await this.swarmManager.start();

    goodbye(async () => {
      await this.destroy();
    });
  }

  async createUser(user) {
    await this.userManager.createUser(user);
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
