import Autobase from "autobase";
import b4a from "b4a";
import Hyperbee from "hyperbee";

export default class Autobee extends Autobase {
  constructor(storeObject, bootstrap, options = {}) {
    if (
      bootstrap &&
      typeof bootstrap !== "string" &&
      !b4a.isBuffer(bootstrap)
    ) {
      options = bootstrap;
      bootstrap = null;
    }

    const { store, coreName = "autobee" } = storeObject;
    const autobeeOptions = {
      valueEncoding: "json",
      extension: false,
      ...options,
    };

    const open = (viewStore) => {
      const core = viewStore.get(coreName, { valueEncoding: 'json' });
      console.log("[Autobee#open] Getting core", { coreName, autobeeOptions });

      return new Hyperbee(core, {
        keyEncoding: "utf-8",
        ...autobeeOptions,
      });
    };

    const apply =
      "apply" in autobeeOptions ? autobeeOptions.apply : Autobee.apply;
    console.log("[Autobee()] Getting apply: ", { apply, autobeeOptions });

    super(store, bootstrap, {
      ...autobeeOptions,
      open,
      apply,
      close: (_view) => {},
      ackInterval: 1000, // enable auto acking with the interval
    });
  }

  static async apply(batch, view, base) {
    const b = view.batch({ update: false });
    console.log("[Autobee#apply] ");

    // Process operation nodes
    for (const node of batch) {
      const op = node.value;
      console.log("[Autobee#apply] Applying operation", { node, op });

      if (op.type === "addWriter") {
        await b.addWriter(b4a.from(op.key, "hex"));
        // continue;
      }
    }

    console.log("[Autobee#apply] Flushing batch...");
    await b.flush();
  }

  appendOperation(operation) {
    // console.log("[Autobee#append] Appending operation: ", { operation });
    return this.append(operation);
  }

  addWriter(key) {
    return this.appendOperation(
      JSON.stringify({
        type: "addWriter",
        key,
      })
    );
  }

  get(key, opts) {
    return this.view.get(key, opts);
  }

  peek(opts) {
    return this.view.peek(opts);
  }

  createReadStream(range, opts) {
    return this.view.createReadStream(range, opts);
  }
}

// const db = new Autobee(store, bootstrap, {
//   apply: async (batch, view, base) => {
//     // Add .addWriter functionality
//     for (const node of batch) {
//       const op = node.value;
//       if (op.type === "addWriter") {
//         console.log("\rAdding writer", op.key);
//         await base.addWriter(b4a.from(op.key, "hex"));
//         continue;
//       }
//     }

//     // Pass through to Autobee's apply
//     await Autobee.apply(batch, view, base);
//   },

//   // Set encodings for autobase/hyperbee
//   valueEncoding: "json",
// })
//   // Print any errors from apply() etc
//   .on("error", console.error);

// await db.update();

// // List db on update
// db.view.core.on("append", async () => {
//   // Skip append event for hyperbee's header block
//   if (db.view.version === 1) return;

//   rl.pause();
//   console.log("\rcurrent db key/value pairs");
//   for await (const node of db.createReadStream()) {
//     console.log("key", node.key);
//     console.log("value", node.value);
//     console.log();
//   }
//   rl.prompt();
// });
