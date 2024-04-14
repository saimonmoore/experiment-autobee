import Corestore from "corestore";
import goodbye from "graceful-goodbye";
import EventEmitter from "eventemitter2";

import { PrivateStore } from "../PrivateStore/index.js";
import { SwarmManager } from "../SwarmManager/index.js";
import { UserUseCase } from "../UserUseCase/index.js";
import { User } from "../User/index.js";

export class Mneme {
  static EVENTS = {
    USER_LOGIN: "user:login",
  };

  // If bootstrapPrivateCorePublicKey is not provided, this node is the first node
  // and will be the owner of the private core.
  // If bootstrapPrivateCorePublicKey is provided, this node is the second node
  // and this token will be the way we "login" (or synchronize devices!!).
  // If we supply this token, we can send it to the first node to verify the identity
  // of the second node and allow them to become writers.
  // So we don't need to use the currently logged in user's key to verify identity.
  // TODO: Replace usage of loginKey with this key (we need to send it to the first node first)
  // TODO: Do we need to login first before starting the swarm?
  constructor(bootstrapPrivateCorePublicKey, storage, testingDHT) {
    console.log("[Mneme] Initializing Mneme...", {
      bootstrapPrivateCorePublicKey,
      storage,
      testingDHT,
    });

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

  loggedIn() {
    return this.userManager.loggedIn();
  }

  loggedInUser() {
    return this.userManager.loggedInUser();
  }

  async start() {
    await this.privateStore.start();
    await this.swarmManager.start();

    goodbye(async () => {
      await this.destroy();
    });
  }

  async signup(potentialUserData) {
    if (this.userManager.loggedIn()) {
      throw new Error("User is already logged in");
    }

    const potentialUser = new User(potentialUserData);

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
      console.log("[Mneme#setupEventBus] user logged in", {
        user,
        shareWithOtherOwnDevicesOnly: this.privateStore.publicKeyString,
      });
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
