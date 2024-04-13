import Corestore from "corestore";
import goodbye from "graceful-goodbye";
import EventEmitter from "eventemitter2";

import { PrivateStore } from "../PrivateStore/index.js";
import { SwarmManager } from "../SwarmManager/index.js";
import { UserUseCase } from "../UserUseCase/index.js";

export class Mneme {
  static EVENTS = {
    USER_LOGIN: "user:login",
  };

  constructor(bootstrapPrivateCorePublicKey, storage, testingDHT) {
    // Setup an internal event emitter
    this.eventBus = new EventEmitter({ delimiter: ":" });
    this.setupEventBus();

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
      this.userManager,
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

    if (potentialUser) {
      this.eventBus.emit(Mneme.EVENTS.USER_LOGIN, potentialUser);
    }

    return potentialUser;
  }

  async login(partialUser) {
    const user = await this.userManager.login(partialUser);

    if (user) {
      this.eventBus.emit(Mneme.EVENTS.USER_LOGIN, user);
    }

    return user;
  }

  async destroy() {
    console.log("[Mneme#destroy] destroying p2p connections...");

    await this.swarmManager.destroy();
    await this.privateStore.destroy();
  }

  setupEventBus() {
    this.eventBus.on(Mneme.EVENTS.USER_LOGIN, (user) => {
      console.log("[Mneme#setupEventBus] user logged in", user);
    });
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
    console.log('hrepl index.js "privateCorePublicKeyFromFirstNode" "./data2"');
  }
}
