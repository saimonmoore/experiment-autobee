import { Mneme } from "./Mneme.js";
import { User } from "./User.js";

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

export { Mneme, User };

// For hrepl
export { mneme };
