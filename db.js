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
      const core = viewStore.get(coreName);

      return new Hyperbee(core, {
        keyEncoding: "utf-8",
        ...autobeeOptions,
      });
    };

    const apply =
      "apply" in autobeeOptions ? autobeeOptions.apply : Autobee.apply;

    super(store, bootstrap, {
      ...autobeeOptions,
      open,
      apply,
      close: (_view) => {},
      ackInterval: 1000, // enable auto acking with the interval
    });
  }

  static async apply(batch, view, base) {
    for (const node of batch) {
      const operation = JSON.parse(node.value);

      if (operation.type === "addWriter") {
        console.log("addWriter", operation.key);
        await base.addWriter(b4a.from(operation.key, "hex"));
        continue;
      }
    }
  }

  appendOperation(operation) {
    return this.append(operation);
  }

  appendWriter(key) {
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
