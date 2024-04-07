class DelegatingProxy {
  constructor(target) {
    this.target = target;
    this.delegateProperty = null;

    return new Proxy(this, {
      get: (target, property, receiver) => {
        console.log("[DelegateProxy] get", { property, target, receiver });

        if (property === "setDelegate") {
          return this.setDelegate.bind(this);
        }

        // If the property is a function, bind it to the target
        if (typeof this.target[property] === "function") {
          return this.target[property].bind(this.target);
          // If the delegate property is set and the property exists on the delegate and it is a function, bind it to the delegate
        } else if (
          this.delegateProperty &&
          typeof this.target[this.delegateProperty] !== "undefined" &&
          typeof this.target[this.delegateProperty][property] !== "undefined" &&
          typeof this.target[this.delegateProperty][property] === "function"
        ) {
          return this.target[this.delegateProperty][property].bind(
            this.target[this.delegateProperty]
          );
          // If none of the previous conditions are met, handle non-existent property
        } else if (
          typeof this.target[property] === "undefined" &&
          (!this.delegateProperty ||
            !this.target[this.delegateProperty] ||
            typeof this.target[this.delegateProperty][property] === "undefined")
        ) {
          throw new Error(`Property '${property}' has no such property`);
        } else {
          return Reflect.get(this.target, property, receiver);
        }
      },
      set: (target, property, value, receiver) => {
        if (typeof this.target[property] === "function") {
          this.target[property] = value;
          return true;
        } else if (
          this.delegateProperty &&
          typeof this.target[this.delegateProperty] !== "undefined" &&
          typeof this.target[this.delegateProperty][property] !== "undefined"
        ) {
          this.target[this.delegateProperty][property] = value;
          return true;
        } else {
          return Reflect.set(this.target, property, value, receiver);
        }
      },
    });
  }

  setDelegate(delegateProperty) {
    this.delegateProperty = delegateProperty;
    return this;
  }
}

export { DelegatingProxy };
