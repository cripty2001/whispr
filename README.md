# Whispr

A tiny observable state manager for TypeScript.

Whispr helps you build **reactive state** using plain values—arrays, objects, numbers, anything. It’s lightweight, flexible, and designed for **long-lived** applications where **memory safety matters**.

Observables in Whispr automatically **clean themselves up**: derived values are passively tracked and disconnected when no longer used, **avoiding leaks** without the boilerplate of manual unsubscriptions.

No decorators, no UI frameworks, no globals — just a simple core that’s easy to reason about and safe to embed anywhere.

## Features

- 🧼 Zero dependencies – Works out of the box, no build tools or bundlers required.
- 🧹 Automatic cleanup – Derived observables unsubscribe themselves when unused.
- 🧠 Computed values – Create reactive state from other observables with Whispr.from.
- 💓 Liveness tracking – Get notified when your observable is no longer referenced and clean up resources using the onDie callback.
- 💤 .wait() and .load() – React to async availability of state without extra libraries or polling.
- ✅ Written in TypeScript – Fully typed, safe, and ergonomic.

Whispr is small on purpose. It won’t manage your app. But it will whisper when your data changes, and stay out of the way when they doesn’t.

## 📦 Installation

```bash
npm install @cripty2001/whispr
```

## 🚀 Quick Start

```ts
import { Whispr } from "@cripty2001/whispr";

// Create a Whispr counter
const [counter, setCounter] = Whispr.create(
  0, // Initial Value
  () => {
    // (optional) onDie callback
    console.log("Counter is dead 😢");
  }
);

// Subscribe to changes
const unsubscribe = counter.subscribe((value) => {
  console.log("Counter is now", value);
});

// Update the Whispr value
const ok = set(5);
if (!ok) {
  console.log("Counter is dead 😢");
}

// Access the latest value directly
console.log(counter.value);

// Unsubscribe from changes
unsubscribe();

// Create a derived Whispr
const doubled = Whispr.from({ value: counter }, ({ value }) => value * 2);
doubled.subscribe((val) => {
  console.log("Doubled:", val);
});
```

> ℹ️ Once an observable is "dead", it will not be revived. If `set()` returns `false` or `onDie()` is triggered, please clean up or stop updating. Whispr handles gracefully updates on dead items, but it is still a waste of resources.

## 🔐 Safe Cloning (Safe by Default)

By default, Whispr does its best to **protect your data from accidental mutations**, even when you're working with complex structures.

When you access `.value` Whispr uses a custom `safeClone()` function to **deeply clone what it can**, while leaving uncloneable parts (like functions, DOM nodes, or Proxies) untouched. The same happens to `set()`, to ensure no live references are left exposed.

This means:

- You can safely mutate the data you receive.
- Your changes **won’t** affect the original observable unless you explicitly `update()` it.
- Even partial structures are protected — **only the truly uncloneable parts are shared**.

```ts
const [original] = Whispr.create({
  a: "hi",
  b: { c: () => console.log("hi") },
});

const v = original.value;

v.a = "ehi";
v.b.c = () => console.log(";)");
v.b = { d: "ahahah" };

console.log(original.value);
// → { a: 'hi', b: { c: [Function: c] } }
```

The cloning isn’t all-or-nothing. It’s **recursive**, forgiving, and careful:

- If a part of your data can’t be cloned, that part stays as-is.
- Everything else is cloned as deeply as possible.

### 🧠 What about class instances?

JavaScript doesn’t have a reliable way to detect _all_ class instances — and cloning them blindly would break methods, prototypes, and internal state. To handle this safely, `safeClone()` uses multiple heuristics to detect likely class instances.

If a class instance has a `.clone()` method, it is used to clone that object.<br>
If no `.clone()` method is found:

- The object is considered **uncloneable** and returned as-is.
- A warning is emitted to help catch silent cloning issues.

```ts
class MyCustomType {
  constructor(public val: number) {}
  clone() {
    return new MyCustomType(this.val);
  }
}
```

You can silence this warning by setting the flag `skipSafeClone = true` on the class.
This is useful for classes like `Whispr` where cloning isn’t meaningful

```ts
class Whispr {
  public skipSafeClone = true;
}
```

> If you’re using custom classes and want to ensure they’re cloned properly, just add a `.clone()` method.

### 📣 A note about edge cases

Some class instances may slip through detection and get treated as plain objects. If that happens to you:

- You can add a `.clone()` method to your class to fix it.
- Or open an issue or discussion — we’re open to improving detection heuristics.

### 🧰 Using `safeClone()` yourself

You can use this logic in your own code too — `safeClone()` is exported for convenience:

```ts
import { safeClone } from "@cripty2001/whispr";
```

## 🧼 Automatic Cleanup (Reactive Magic)

`Whispr` automatically tracks the lifecycle of each observable. When the returned `data` is no longer strongly referenced (i.e. it's orphaned), the optional `onDie` callback is triggered—giving you a clean opportunity to stop ongoing tasks like:

- Unsubscribing from WebSockets
- Stopping intervals or timeouts
- Disconnecting listeners or tearing down resources

This cleanup logic is **automatically propagated** through `Whispr.from` chains as well—meaning derived observables clean up when all of their sources are gone. You don’t need to manually manage chains or subscriptions.

Just declare what needs to happen on cleanup, and let `Whispr` take care of the dirty work.

## 🔔 (Asyncronous) Listener Behavior

Whispr observables support **asynchronous** reactive subscriptions using `.subscribe(callback, immediate = true)`.

At first glance, this might seem simple, but reactive flows have subtle tradeoffs. The way listeners are fired, how errors are handled, and when (or whether) updates are awaited all affect how predictable your app is, especially as it grows.

Here are some **key properties and design choices** behind Whispr’s listener model, and how they may affect your expectations:

### ✅ Synchronous updates

When `set()` is called, all listeners of that Whispr are fired **synchronously**, during the same update tick.

```ts
const [counter, setCounter] = Whispr.create(0);
counter.subscribe((val) => {
  console.log("Received value:", val);
});
setCounter((prev) => prev + 1);
// Listener is fired *immediately* here
```

This means the state is guaranteed to be consistent across all listeners and reads. Also, if the listener is syncronous, there are no race conditions or async propagation delays.

### 🔁 Fire-and-forget

Whispr does **not** wait for listeners to complete. If a listener is `async`, it’s still invoked synchronously and then left to run in the background:

```ts
counter.subscribe(async (val) => {
  await delay(1000);
  console.log("This ran later:", val);
});
setCounter((prev) => prev + 1);
console.log("next"); // This logs immediately. The async listener finishes later.
```

This is intentional: the component or logic performing the `.set()` operation **does not need to know or wait** for all listeners to finish.

### 🛑 STOP mechanism

Listeners (sync or async) can return `"STOP"` to unsubscribe themselves automatically.

```ts
const unsub = counter.subscribe((val) => {
  if (val > 3) return "STOP";
});
```

This avoids manual unsubscribe logic in many simple cases.

### 🧯 Error isolation

All listener callbacks are wrapped in try-catch. If a listener throws an error, Whispr catches it and logs it to the console. The subscription is kept active, though.

```ts
counter.subscribe((val) => {
  throw new Error("Oops!");
});
```

This prevents one faulty listener from disrupting the others or crashing the observable logic.

### ⚡ Immediate invocation

By default, `.subscribe()` fires the callback immediately with the current value:

```ts
const unsub = counter.subscribe((val) => {
  console.log("Initial value:", val); // immediately logs current value
});
```

This behavior can be turned off by passing `false` as the second argument:

```ts
counter.subscribe((val) => {
  console.log("Only future updates");
}, false);
```

⚠️ **Note:** Even immediate listeners are fire-and-forget. If the callback is `async`, there's no guarantee it completes before the `.subscribe()` call returns.

### 📌 Tip: For current value, use `.value`

If you just need the latest value, use `.value`:

```ts
const now = counter.value;
```

> Do **not** subscribe unless you need to react to _future_ changes. This avoids bugs where your async listener may not fire exactly when you think it will.

## 🧪 Listener Debug Checklist

If your listener isn't working as expected, here's a quick list of things to check before you panic and rewrite your app at 2am:

### ✅ Did you actually subscribe?

> Common mistake: forgetting to call `.subscribe()`

```ts
  // ❌ Nothing happens here
counter.subscribe;

// ✅ You need to call it!
counter.subscribe((val) => { ... });

```

### ⚡ Did you mean to skip the initial value?

> By default, `subscribe()` fires the listener immediately. You can disable that:

```ts
  counter.subscribe((val) => { ... }, false); // skips first fire
```

### 🔁 Is your listener `async`?

Async listeners **don’t block** the update cycle, and Whispr **won’t wait for them**:

```ts
counter.subscribe(async (val) => {
  await delay(500);
  console.log("This runs later");
});
```

→ If you need the current value _immediately_, use `.value`.

### 🧯 Did your listener throw an error?

If it crashed, you’ll see a warning in the console. The error is caught and the listener is kept alive. If you want to unsubsribe a listener after an error, just wrap it into a `try catch` block and return "STOP" from the `catch`

```ts
counter.subscribe((val) => {
  throw new Error("oops");
});
// Logs error, doesn't stop other listeners
```

### 🛑 Did it self-unsubscribe?

If your listener returns `"STOP"`, it won’t be called again. That’s on purpose:

```ts
counter.subscribe((val) => {
  if (val > 10) return "STOP";
});
```

> Check your conditions.

### 💭 Still not sure?

- Confirm `.value` has the data you expect
- Confirm your update logic is actually mutating the value
- Try adding a debug listener that logs _every update_ to see if things are working upstream

```ts
counter.subscribe((val) => console.log("DEBUG:", val));
```

## ⚠️ Async Updates? Handle With Care

It might seem tempting to support async update functions like this:

```ts
async function update(cb: (curr: T) => Promise<T>);
```

But here's the issue: **what is the `curr` value in this case?**

- The value at the time `update()` was called?
- The value at the time your async function starts executing?
- Or worse, at the time it resolves?

In an async environment, **update interleaving becomes inevitable**. What seems like a harmless API leads to race conditions, overwrite bugs, and subtle inconsistencies that are **nearly impossible to track** in production.

> Any solution here would be based on assumptions about developer intent—and assumptions don't scale.

### ✅ Whispr’s Design: Simple, Predictable, Safe

Whispr intentionally **does not offer an async update method**.

Instead, it gives you:

- A safe, read-only `.value` accessor (data is **always cloned** before access)
- A pure, synchronous `update(cb)` setter

This mirrors the simplicity and reliability of React’s `useState`, ensuring you always work with predictable, up-to-date values, and never mutate data by mistake.

### 🌀 [Stay Tuned] For Async and Streaming Flows: Use (Fluctu - Coming Soon)

Need to manage async requests, intermediate results, or streaming data?

Enter (`@cripty2001/fluctu` - Coming Soon): a **powerful async layer built on top of Whispr**.

Fluctu uses Whispr under the hood for its reactivity core, and provides a flexible async interface designed to **fit every data flow pattern**—not just the common ones.

It includes convenient built-in modes for popular use cases:

| Mode                  | When it Publishes                | Best For                                  |
| --------------------- | -------------------------------- | ----------------------------------------- |
| **Debounced Mode**    | Only if it's still the latest    | Stable UI, no flicker, final answers only |
| **Async Result Mode** | Always, unless newer result won  | Intermediate results are helpful          |
| **Streaming Mode**    | Anytime (if no newer result won) | Real-time, chunked, or partial data flows |

But this is just the beginning.

> Like Whispr, Fluctu gives you a **generic low-level interface**—the building blocks to design any async behavior you want.

Whether you're implementing a data loader, a streaming API handler, or a debounce/cancel logic across changing parameters, Fluctu lets you **express your intent without boilerplate**.

And since it’s all powered by Whispr, your async flows **remain fully observable, reactive, and memory-aware**.

## 🧱 `WhisprMap` – Reactive collections made easy

Sometimes you need an **observable collection of observables**: for example, a map of users where each user has its own state. While you could manually manage maps of `Whispr` instances, this gets messy fast when trying to derive reactive values from them.

Enter `WhisprMap`, a specialized collection types that:

- Expose a `data` observable that automatically derives the **unwrapped values** of the individual `Whispr`s.
- Allow you to manipulate the collection via a `mutations` interface, as `Whispr` does.
- Work seamlessly with `Whispr.from()` and other reactive utilities: no need to manually subscribe or sync nested observables.

```ts
const [userMap, mutations] = WhisprMap.create<number, string>();

// Create some observables
const [user1, update1] = Whispr.create("Alice");
const [user2, update2] = Whispr.create("Bob");

// Add them to the map
mutations.set(1, user1);
mutations.set(2, user2);

// userMap.value === { 1: "Alice", 2: "Bob" }
```

> 🧠 `userMap` is a `Whispr<Record<number, string>>`, giving you the current values directly, with no manual unwraps.

Available mutations:

```ts
interface WhisprMapMutations<K, V> {
  set(key: K, value: Whispr<V>, force?: boolean): void;
  delete(key: K): void;
}
```

These utilities make it trivial to build rich UIs and stateful logic involving dynamic collections **while still maintaining full reactivity** and **clean composition** with `Whispr.from()` and derived observables.

## 🎓 Pro Tips

### Wait

Wait until an observable matches a specific condition:

```ts
const [user, setUser] = Whispr.create<User | null>(null);

fetch("/user")
  .then((data) => data.json())
  .then((data) => setUser(data));

await user.wait((u) => u !== null);

// This will implicitly pause the execution until the fetch completed successfully
```

### Load

You are just waiting for a non-null and non-undefined value? Use `load()`

```ts
const [user, setUser] = Whispr.create<User | null>(null);

fetch("/user")
  .then((data) => data.json())
  .then((data) => setUser(data));

await user.load();

// This will implicitly pause the execution until the fetch completed successfully
```

### Derived Whispr

Easily build merged Whisprs with `Whispr.from`, having it kept in sync automatically

```ts
// users is a list of users id
// profiles is a map of data indexed by user id

const merged = Whispr.from(
  {
    users: users,
    profiles: profiles,
  },
  ({ users, profiles }) => {
    return users.map((item) => ({
      id: item,
      profile: profiles[id],
    }));
  }
);
```

> ✨ Merged is kept in sync with both `users` and `profiles`, and, when it goes out of scope, it is automatically unsubscribed from both to save resources

#### Shorthand

If the derived Whispr is equal to its input, you can use the `Whispr.consolidate` instead.
This is particularly useful to merge a series of Whispr into a single one, to consolidate reactivity and improve developer experience.

```ts
const [userId] = Whispr.create('user');
const profile = loadUserProfile(userId) // Returns Whispr(UserProfile | null) - null while loading

const merged_from = Whispr.from(
  {
    id: userId,
    profile: profile
  },
  ({id, profile} => ({
    id,
    profile
  }))
)

const merged_consolidate = Whispr.consolidate({id, profile})

// merged_from and merged_consolidate are practically the same
```

---

If you are just transforming a single `Whispr`, use w.transform

```ts
const user: Whispr<User>;

const uid = user.transform((u) => u.id);
const uid_from = Whispr.from({ user: user }, ({ user }) => {
  return user.id;
});

// uid and uid_from are practically the same
```

### Liveness Notifications

Easily bind cleanup to object liveness

```ts
// Create a Whispr observable for the latest message
const [message, setMessage] = Whispr.create<string | null>(null, () => {
  ws.close();
});

// Open a websocket
const ws = new WebSocket("wss://example.org");

// Listen for messages
ws.addEventListener("message", (event) => {
  set(event.data);
});
```

> Due to the unsubscribe callback, the wss is automatically closed when message dies. The good thing? This can be applied to anything!

### 🛡️ Type Safety

All the Whispr library is fully typed.

```ts
const a = Whispr.create<
  T // Type of a.value
>()

const f = Whispr.from<
  I // Type of the input, as a map,
  O // Type of the output
>()

const m = WhisprMap.create<
  K // Type of the key
  V // Type of the value
>()
```

## 🧠 API Reference

### `safeClone(value: any): any`

Deeply clones a value using a safe, recursive strategy.

Used internally by `Whispr` to ensure immutability and protect against side effects. See the Safe Clone section for details.

---

## 🔄 `Whispr<T>`

A reactive observable container with safe updates, subscriptions, and lifecycle management.

### `Whispr.create<T>(initial: T, onDie?: () => void): [Whispr<T>,  WhisprMutations<T> ]`

Creates a new observable instance. When the observable is no longer referenced, `onDie` will be called.

```ts
const [user, setUser] = Whispr.create({ name: "Alice" });
```

### Instance Properties & Methods

#### `value: T`

Returns the current observable value. If cloning is enabled, the result is deeply cloned.

#### `subscribe(cb: (data: T) => void | "STOP", immediate?: boolean): () => void`

Subscribes to the observable. The callback is called on every change. Return `"STOP"` to unsubscribe automatically.

#### `wait(cb: (data: T) => R | null | undefined): Promise<R>`

Waits for the first non-null result from `cb(data)`. Automatically unsubscribes after resolution.

#### `load(): Promise<NonNullable<T>>`

Waits until the observable emits a defined, non-null value. Equivalent to `wait(data => data)`.

## 🧩 `Whispr.from(...)`

Creates a computed observable from multiple source observables.

---

## 🗺 `WhisprMap<K, V>`

An observable map of observable values. It flattens and exposes the internal values, while still keeping for-key reactivity.

### `WhisprMap.create<K, V>(): { data: WhisprMap<K, V>, mutations: WhisprMapMutations<K, V> }`

```ts
const { data: user1 } = Whispr.create("Alice");
const { data: user2 } = Whispr.create("Bob");

const { data: userMap, mutations } = WhisprMap.create<string, string>();
await mutations.set("a", user1);
await mutations.set("b", user2);
```

### Map API

- `value: Map<K, V>` — A live view of all the observable entries.
- `subscribe(cb, immediate?)` — Called when the map structure or any observable changes.
- `wait(cb)` / `load()` — As in `Whispr`.

### `WhisprMapMutations<K, V>`

- `set(key: K, value: Whispr<V>, force?: boolean): void` — Adds or replaces an entry.
- `delete(key: K): void` — Removes a key. No-op if the key doesn't exist.

## 🔧 License

MIT

## 👋 Author

Built with care by Fabio Mauri (cripty2001[at]outlook[dot]com).

Contributions and issues welcome (especially on tests)!
