import { Mneme } from "./Mneme/index.js";
import { User } from "./modules/User/domain/entity/User/index.js";
import { Record } from "./modules/Record/domain/entity/Record/index.js";

const isTestRunning = process.env["NODE_ENV"] === "test";

let mneme;

if (!isTestRunning) {
  console.log("======================");
  console.log("Starting Mneme demo...");
  console.log("======================");
  const args = process.argv.slice(2);
  const bootstrapPrivateCorePublicKey = args[0];
  const storage = args[1];

  console.log("Starting Mneme with args", { args });

  mneme = new Mneme(bootstrapPrivateCorePublicKey, storage);
  mneme.info();

  await mneme.start();
}

export { Mneme, User, Record };

// For hrepl
export { mneme };
