import { test } from 'brittle';

import { DelegatingProxy } from '../delegatingProxy.js';

class ProxiedClass {
  constructor() {
    this.proxiedValue = 'proxied value';
  }

  getProxiedValue() {
    return this.proxiedValue;
  }

  setProxiedValue(newValue) {
    this.proxiedValue = newValue;
  }

  delegatedMethod() {
    return 'delegated method result';
  }
}

class TestClass {
  constructor() {
    this.value = 'test value';
    this.proxiedClass = new ProxiedClass();
  }

  getValue() {
    return this.value;
  }

  setValue(newValue) {
    this.value = newValue;
  }
}

test('DelegatingProxy - basic functionality', (t) => {
  t.plan(4);

  const testInstance = new TestClass();
  const proxy = new DelegatingProxy(testInstance);
  proxy.setDelegate('proxiedClass');

  t.is(proxy.getValue(), 'test value', 'Proxied method call should work');
  t.is(proxy.value, 'test value', 'Proxied property access should work');

  proxy.setValue('new value');
  t.is(testInstance.value, 'new value', 'Proxied property write should work');

  t.is(proxy.delegatedMethod(), 'delegated method result', 'Delegated method call should work');
});

test('DelegatingProxy - non-existent property', (t) => {
  t.plan(1);

  const testInstance = new TestClass();
  const proxy = new DelegatingProxy(testInstance);
  proxy.setDelegate('proxiedClass');

  t.exception(() => proxy.nonExistentProperty, /has no such property/, 'Accessing non-existent property should throw an error');
});

test('DelegatingProxy - non-existent delegate property', (t) => {
  t.plan(1);

  const testInstance = new TestClass();
  const proxy = new DelegatingProxy(testInstance);
  proxy.setDelegate('nonExistentDelegateProperty');

  t.exception(() => proxy.delegatedMethod(), /has no such property/, 'Accessing non-existent delegate property should throw an error');
});