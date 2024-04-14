import Corestore from "corestore";
import goodbye from "graceful-goodbye";
import EventEmitter from "eventemitter2";

import { PrivateStore } from "../stores/PrivateStore/index.js";
import { PublicStore } from "../stores/PublicStore/PublicStore.js";
import { SwarmManager } from "../modules/Network/SwarmManager/index.js";
import { User } from "../modules/User/domain/entity/User/index.js";
import { UserUseCase } from "../modules/User/application/UserUseCase/index.js";
import { RecordUseCase } from "../modules/Record/application/RecordUseCase/index.js";

export class Mneme {
  static OUT_OF_BAND_SYNC_KEY_DELIMITER = ":";
  static EVENTS = {
    USER_LOGIN: "user:login",
    MNEME_READY: "mneme:ready",
  };

  constructor(bootstrapCorePublicKeys, storage, testingDHT) {
    const [bootstrapPrivateCorePublicKey, bootstrapPublicCorePublicKey] =
      (bootstrapCorePublicKeys &&
        bootstrapCorePublicKeys.split(Mneme.OUT_OF_BAND_SYNC_KEY_DELIMITER)) ||
      [];

    // Setup an internal event emitter
    this.eventBus = new EventEmitter();
    this.setupEventBus();

    // Persistence
    this.corestore = new Corestore(storage || "./data");

    this.privateStore = new PrivateStore(
      this.corestore,
      bootstrapPrivateCorePublicKey
    );

    this.publicStore = new PublicStore(
      this.corestore,
      bootstrapPublicCorePublicKey
    );

    // Application
    this.userManager = new UserUseCase(this.privateStore);
    this.privateRecordManager = new RecordUseCase(this.privateStore);
    this.publicRecordManager = new RecordUseCase(this.publicStore);

    // Networking
    this.swarmManager = new SwarmManager(
      { private: this.privateStore, public: this.publicStore },
      this.userManager,
      this.eventBus,
      testingDHT
    );
  }

  // Is formed from both the public and private store public keys
  get outOfBandSyncKey() {
    return `${this.privateStore.publicKeyString}${Mneme.OUT_OF_BAND_SYNC_KEY_DELIMITER}${this.publicStore.publicKeyString}`;
  }

  loggedIn() {
    return this.userManager.loggedIn();
  }

  loggedInUser() {
    return this.userManager.loggedInUser();
  }

  async start() {
    await this.privateStore.start();
    (await this.publicStore) && this.publicStore.start();

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

  async addPrivateRecord(record) {
    await this.privateRecordManager.addRecord(record);
  }

  async addPublicRecord(record) {
    await this.publicRecordManager.addRecord(record);
  }

  async destroy() {
    await this.swarmManager.destroy();
    await this.privateStore.destroy();
    (await this.publicStore) && this.publicStore.destroy();
  }

  setupEventBus() {
    this.eventBus.on(Mneme.EVENTS.USER_LOGIN, (user) => {
      console.log("info: You are now logged in...");
      console.log();
      console.log("info: Use the following key to synchronise Mneme to your other devices: ", this.outOfBandSyncKey);
    });

    this.eventBus.on(Mneme.EVENTS.MNEME_READY, () => {
      console.log("info: Mneme is ready for business!");
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
