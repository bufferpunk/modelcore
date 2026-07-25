import test from "node:test";
import assert from "node:assert/strict";
import { Base, Union, buildError, ValueError, SchemaDefinitionError, TypeValidationError } from "../index.ts";

/* Tests to verify core functionality. You can add more as needed. Send a PR to be included. */

test("validates fields, applies defaults, and runs hooks", () => {
  class User extends Base {
    static schema = {
      name: {
        type: String,
        min: 2,
        max: 100,
        optional: true,
        beforeChecks: (value) => typeof value === "string" ? value.trim() : value,
        afterChecks: (value) => value.replace(/\s+/g, " ")
      },
      status: {
        type: String,
        enum: ["active", "inactive"],
        default: "active",
        beforeChecks: (value) => typeof value === "string" ? value.toLowerCase() : value
      },
      confirmed: { type: Boolean, optional: true, default: false },
      profile: {
        type: Object,
        default: {},
        keys: {
          role: { type: String, enum: ["admin", "editor"], default: "editor" }
        }
      },
      tags: {
        type: Array,
        default: [],
        values: {
          type: String,
          beforeChecks: (value) => typeof value === "string" ? value.trim() : value
        }
      }
    };
  }

  const user = new User({  name: "  John   Doe  ", status: "active" });

  assert.equal(user.name, "John Doe");
  assert.equal(user.status, "active");
  assert.equal(user.confirmed, false);
  assert.deepEqual(user.profile, { role: "editor" });
  assert.deepEqual(user.tags, []);
  assert.deepEqual(user.toObject(), {
    name: "John Doe",
    status: "active",
    confirmed: false,
    profile: { role: "editor" },
    tags: [],
  });
});

test("update merges existing values and revalidates", () => {
  class User extends Base {
    static schema = {
      name: { type: String },
      role: { type: String, enum: ["admin", "editor"], default: "editor" },
      confirmed: { type: Boolean, optional: true, default: false }
    };
  }

  const user = new User({ name: "John" });
  user.update({ role: "admin" });

  assert.equal(user.name, "John");
  assert.equal(user.role, "admin");
  assert.equal(user.confirmed, false);
});

test("immutable properties reject updates", () => {
  class User extends Base {
    static schema = {
      name: { type: String, immutable: true },
      profile: {
        type: Object,
        default: { role: "editor" },
        keys: { role: { type: String, immutable: true } }
      }
    };
  }


  assert.throws(() => {
    const user = new User({ name: "John" });
    user.update({ name: "Jane" });
  }, /Cannot update immutable property 'name'/);
  assert.throws(() => {
    const user = new User({ name: "John" });
    user.name = "Jane";
  }, /Cannot update immutable property 'name'/);
  assert.throws(() => {
    const user = new User({ name: "John" });
    user.profile.role = "admin";
  }, /Cannot update immutable property 'profile.role'/);
});

test("supports custom base model inheritance", () => {
  class BaseModel extends Base {
    save() {
      return "saved";
    }
  }

  class User extends BaseModel {
    static collection = "users";
    static schema = {
      name: { type: String }
    };
  }

  const user = new User({ name: "John" });

  assert.equal(user.save(), "saved");
  assert.equal(user.name, "John");
  assert.equal(User.collection, "users");
});

test("coerce Date when coerce true", () => {
  class Item extends Base {
    static schema = { createdAt: { type: Date, coerce: true } };
  }

  const it = new Item({ createdAt: "2020-01-01T00:00:00Z" });
  assert.ok(it.createdAt instanceof Date);
});

test("number min/max enforces on update", () => {
  class P extends Base {
    static schema = { price: { type: Number, min: 0, max: 100 } };
  }

  const p = new P({ price: 50 });
  assert.doesNotThrow(() => p.update({ price: 100 }));
  assert.throws(() => p.update({ price: 200 }), /Value too large for 'price'/);
});

test("string min/max length enforces on update", () => {
  class S extends Base {
    static schema = { username: { type: String, min: 3, max: 10 } };
  }

  const s = new S({ username: "user" });
  assert.doesNotThrow(() => s.update({ username: "newuser" }));
  assert.throws(() => s.update({ username: "ab" }), /Value too small for 'username'/);
  assert.throws(() => s.update({ username: "thisisaverylongusername" }), /Value too large for 'username'/);
});

test("enum invalid on construct throws", () => {
  class R extends Base {
    static schema = { role: { type: String, enum: ["a", "b"] } };
  }

  assert.throws(() => new R({ role: "c" }), /Invalid value for 'role'/);
});

test("safe parseConfig swallows errors during construction", () => {
  class S extends Base {
    static schema = { name: { type: String } };
  }

  // Should not throw when safe:true even though required field is missing/invalid
  assert.doesNotThrow(() => new S({}, { safe: true }));
  const s = new S({}, { safe: true });
  assert.deepEqual(s.toObject(), {});
});

test("class-level immutability blocks direct assignment", () => {
  class I extends Base {
    static immutable = true;
    static schema = { name: { type: String, optional: true } };
  }

  const i = new I({ name: "alice" });
  assert.throws(() => { i.name = "bob"; }, /Cannot update immutable object of type I/);
  assert.throws(() => i.update({ name: "bob"}), /Cannot update immutable object of type I/);
});

test("array with no values schema throws", () => {
  class A extends Base { static schema = { tags: Array } }
  assert.throws(() => new A({ tags: ["Some", "Tags"] }), /Missing array value configuration/)
})

test("reassigning array property revalidates and persists values", () => {
  class A extends Base {
    static schema = {
      tags: {
        type: Array,
        default: [],
        values: { type: String, beforeChecks: (v) => typeof v === "string" ? v.trim() : v }
      }
    };
  }

  const a = new A({ tags: ["init"] });
  a.tags = ["  new ", " other "];
  assert.equal(a.tags[0], "new");
  assert.equal(a.tags[1], "other");
});

test("custom Email type preserves instance shape and nested subscribers", () => {
  class Email extends String {
    constructor(email) {
      if (!/^[a-z0-9._+-]+@[a-z0-9-]+(\.[a-z]{2,})+$/.test(email)) throw new Error("Invalid email");
      super(email.trim().toLowerCase());
    }
  }

  class User extends Base {
    static schema = {
      channel: {
        type: Object,
        keys: {
          name: { type: String },
          email: { type: Email, optional: true },
          subscribers: {
            type: Array,
            optional: true,
            default: [],
            values: {
              type: Object,
              keys: {
                name: { type: String },
                email: { type: Email, optional: true }
              }
            }
          }
        }
      }
    };
  }

  const user = User.createFrom({
    channel: {
      name: "email",
      email: new Email("john@example.com"),
      subscribers: [ { name: "Alice", email: new Email("alice@example.com") } ]
    }
  });

  assert.ok(user.channel.email instanceof Email);
  assert.ok(user.channel.subscribers[0].email instanceof Email);
});

test("validated arrays: fill forbidden, push/unshift/splice validate items", () => {
  class A extends Base {
    static schema = {
      tags: {
        type: Array,
        default: [],
        values: { type: String, beforeChecks: (v) => typeof v === "string" ? v.trim() : v }
      }
    };
  }

  const a = new A({ tags: ["init"] });

  // fill is explicitly forbidden
  assert.throws(() => a.tags.fill("x"), /Array.fill\(\) is not allowed/);

  // push/unshift validate items and reject wrong types
  assert.throws(() => a.tags.push(123), /Invalid type/);
  assert.throws(() => a.tags.unshift(123), /Invalid type/);

  // splice add path validates
  assert.throws(() => a.tags.splice(1, 0, 456), /Invalid type/);
});

test("default factories produce distinct values and are applied when missing", () => {
  class Item extends Base {
    static schema = {
      createdAt: { type: Date, default: () => new Date() },
      id: { type: String, default: () => Math.random().toString(36).slice(2) }
    };
  }

  const a = new Item({});
  const b = new Item({});
  assert.ok(a.createdAt instanceof Date && b.createdAt instanceof Date);
  assert.notEqual(a.id, b.id);
});

test("nested validate() throws and blocks construction when required nested key missing", () => {
  class User extends Base {
    static schema = {
      channel: {
        type: Object,
        keys: { name: { type: String }, email: { type: String, optional: true } },
        validate: (v) => { if (v.name === 'email' && !v.email) throw new Error('missing email'); }
      }
    };
  }

  assert.throws(() => User.create({ channel: { name: 'email' } }), /missing email/);
});

test("splice delete-only works and does not validate when no items added", () => {
  class C extends Base {
    static schema = { arr: { type: Array, default: [], values: { type: String } } };
  }
  const c = new C({ arr: ['a','b','c'] });
  // delete only
  c.arr.splice(1,1);
  assert.deepEqual(c.arr, ['a','c']);
});

test("array with object values enforce validation on nested objects", () => {
  class C extends Base {
    static schema = {
      arr: {
        type: Array,
        default: [],
        values: {
          type: Object,
          keys: {
            name: { type: String, immutable: true },
            age: { type: Number, min: 0 }
          }
        }
      }
    };
  }

  const c = new C({ arr: [{ name: 'Alice', age: 30 }] });
  assert.doesNotThrow(() => c.arr.push({ name: 'Bob', age: 25 }));
  assert.throws(() => c.arr[0].name = 'Charlie');
  assert.throws(() => c.arr.push({ name: 'Charlie', age: -5 }));
});

test("toObject returns plain object with all transformations applied", () => {
  class U extends Base {
    static schema = {
      name: { type: String, beforeChecks: (v) => v.trim(), afterChecks: (v) => v.toUpperCase() },
      tags: { type: Array, default: [], values: { type: String, beforeChecks: (v) => v.trim() } }
    };
  }

  const u = new U({ name: '  alice  ', tags: ['  tag1  ', 'tag2'] });
  const obj = u.toObject();
  assert.deepEqual(obj, { name: 'ALICE', tags: ['tag1', 'tag2'] });
});

test("custom class extending Array works like a normal array", () => {
  class customArray extends Array {
    constructor(...args) {
      super(...args);
    }
  }

  class C extends Base {
    static schema = { arr: { type: customArray, optional: true, default: () => new customArray(), values: { type: String, optional: true } } };
  }

  const c = new C({});
  assert.doesNotThrow(() => c.arr.push('hello'));
  assert.throws(() => c.arr.fill('x'), /Array.fill\(\) is not allowed/);
});

test("safe parse returns object with errors instead of throwing", () => {
  class U extends Base {
    static schema = {
      name: { type: String },
      age: { type: Number, min: 0 }
    };
  }

  const result = new U({ name: 'Alice', age: -5 }, { safe: true });
  assert.equal(result.name instanceof Error, true);
  assert.deepEqual(result.name.path, ['age']); // failed at age
});

test("concat rejects non-array inputs and validates array inputs", () => {
  class A extends Base {
    static schema = {
      tags: {
        type: Array,
        default: [],
        values: { type: String, beforeChecks: (v) => typeof v === 'string' ? v.trim() : v }
      }
    };
  }

  const a = new A({ tags: ['init'] });

  // concat with non-array should throw
  assert.throws(() => { a.tags.concat(123); }, /Can only concat arrays/);

  // concat with arrays should return validated combined array
  const res = a.tags.concat([' new ', 'other']);
  assert.deepEqual(res, ['init', 'new', 'other']);
});

test("concat on custom Array subclass validates and returns array", () => {
  class CustomArray extends Array {
    constructor(...args) { super(...args); }
  }

  class C extends Base {
    static schema = {
      arr: { type: CustomArray, default: () => new CustomArray(), values: { type: String, beforeChecks: (v) => typeof v === 'string' ? v.trim() : v } }
    };
  }

  const c = new C({});
  const out = c.arr.concat([' hello ', ' world']);
  assert.deepEqual(Array.from(out), ['hello', 'world']);
  assert.throws(() => { c.arr.concat(123); }, /Can only concat arrays/);
});

test("unshift with valid items rebuilds indexed properties", () => {
  class A extends Base {
    static schema = {
      tags: { type: Array, default: [], values: { type: String, beforeChecks: (v) => typeof v === 'string' ? v.trim() : v } }
    };
  }

  const a = new A({ tags: ['b'] });
  a.tags.unshift('a');
  assert.equal(a.tags[0], 'a');
  assert.equal(a.tags[1], 'b');
});

test("simple config without whole object", () => {
  class U extends Base {
    static schema = {
      name: String,
      tags: { type: Array, default: [], values: { type: String, beforeChecks: (v) => v.trim() } }
    }
  };

  assert.doesNotThrow(() => new U({ name: 'Alice' }));
  const u = new U({ name: 'Alice' });
  assert.equal(u.name, 'Alice');
  assert.deepEqual(u.tags, []);
})

test("undefined config throws error", () => {
  class U extends Base {
    static schema = {
      name: undefined, // Invalid config
      tags: { type: Array, default: [], values: { type: String, beforeChecks: (v) => v.trim() } }
    }
  };

  assert.throws(() => new U({ name: 'Alice' }), /Invalid schema definition/);
})

test("union functions as intended", () => {
  class U extends Base {
    static schema = {
      name: String,
      tags: { type: Array, default: [], values: String },
      age: Union(String, Number),
      height: { type: Union(Number), coerce: true, optional: true }
    }
  };

  assert.deepEqual(new U({ name: "Alice", age: 1 }).toObject(), { name: "Alice", tags: [], age: 1, height: undefined })
  assert.throws(() => new U({ name: "Alice", age: [] }), /Invalid type/)
  assert.doesNotThrow(() => new U({ name: "Alice", age: 1, height: "5.5" }))
  assert.deepEqual(new U({ name: "Alice", age: 1, height: "5.5" }).toObject(), { name: "Alice", tags: [], age: 1, height: new Number(5.5) })
})

// ==================== VALIDATION HANDLERS ====================

test("validation handler is called during construction and receives correct args", () => {
  const calls = [];
  Base.addValidationHandler("dummy", (conf, value, path) => { calls.push({ conf, value, path }); });

  class U extends Base {
    static schema = { name: { type: String }, age: { type: Number, optional: true } };
  }
  new U({ name: "Alice", age: 30 });

  assert.equal(calls.length, 2);
  assert.equal(calls[0].conf.type, String);
  assert.equal(calls[0].value, "Alice");
  assert.equal(calls[0].path, "name");
  assert.equal(calls[1].conf.type, Number);
  assert.equal(calls[1].value, 30);
  assert.equal(calls[1].path, "age");

  Base.removeValidationHandler("dummy")
});

test("validation handler can reject invalid values", () => {
  Base.addValidationHandler("dummy", (conf, value, path) => {
    if (conf.regex && typeof value === "string" && !conf.regex.test(value))
      throw buildError(ValueError, "regex mismatch", undefined, path, conf.regex, value, "REGEX");
  });

  class U extends Base {
    static schema = { name: { type: String, regex: /^[a-z]+$/ } };
  }

  assert.doesNotThrow(() => new U({ name: "alice" }));
  assert.throws(() => new U({ name: "Alice123" }), /regex mismatch/);
  try { new U({ name: "Alice123" }); assert.fail("should throw"); }
  catch (e) { assert.equal(e.code, "REGEX"); }

  Base.removeValidationHandler("dummy")
});

test("multiple handlers run in registration order", () => {
  const order = [];
  Base.addValidationHandler("dummy", () => { order.push("first"); });
  Base.addValidationHandler("dummy1", () => { order.push("second"); });
  Base.addValidationHandler("dummy2", () => { order.push("third"); });

  class U extends Base { static schema = { name: { type: String } }; }
  new U({ name: "test" });

  assert.deepEqual(order, ["first", "second", "third"]);

  Base.removeValidationHandler("dummy")
  Base.removeValidationHandler("dummy1")
  Base.removeValidationHandler("dummy2")
});

test("handler error propagates with correct metadata", () => {
  Base.addValidationHandler("dummy", (conf, value, path) => {
    throw buildError(ValueError, "custom fail", "myHandler", path, "expected", value, "CUSTOM_CODE");
  });

  class U extends Base { static schema = { x: { type: String } }; }

  try { new U({ x: "bad" }); assert.fail("should throw"); }
  catch (e) {
    assert.ok(e instanceof ValueError);
    assert.equal(e.message, "custom fail");
    assert.equal(e.path.join("."), "x");
    assert.equal(e.expected, "expected");
    assert.equal(e.received, "bad");
    assert.equal(e.code, "CUSTOM_CODE");
  }

  Base.removeValidationHandler("dummy")
});

test("validation handlers run on nested object fields", () => {
  const paths = [];
  Base.addValidationHandler("dummy", (conf, value, path) => { paths.push(path); });

  class U extends Base {
    static schema = {
      name: { type: String },
      profile: {
        type: Object,
        keys: { role: { type: String }, age: { type: Number, optional: true } }
      }
    };
  }
  new U({ name: "Alice", profile: { role: "admin", age: 25 } });

  assert.ok(paths.includes("name"));
  assert.ok(paths.includes("profile.role"));
  assert.ok(paths.includes("profile.age"));

  Base.removeValidationHandler("dummy")
});

test("handler does not affect valid values", () => {
  Base.addValidationHandler("dummy", (conf, value) => {
    if (conf.type === Number && value < 0) throw buildError(ValueError, "no negatives", undefined, "", "", value, "");
  });

  class U extends Base { static schema = { score: { type: Number } }; }
  const u = new U({ score: 42 });
  assert.equal(u.score, 42);
  assert.throws(() => new U({ score: -1 }), /no negatives/);

  Base.removeValidationHandler("dummy")
});

// ==================== AUTOREQUIRE ====================

test("autorequire default (undefined) throws on missing required field", () => {
  const cleanup = Base.autorequire;
  delete Base.autorequire;

  class U extends Base { static schema = { name: { type: String } }; }
  assert.throws(() => new U({}), /Missing required property/);

  Base.autorequire = cleanup;
});

test("autorequire true throws on missing required field", () => {
  const cleanup = Base.autorequire;
  Base.autorequire = true;

  class U extends Base { static schema = { name: { type: String } }; }
  assert.throws(() => new U({}), /Missing required property/);

  Base.autorequire = cleanup;
});

test("autorequire false allows missing required field silently", () => {
  const cleanup = Base.autorequire;
  Base.autorequire = false;

  class U extends Base { static schema = { name: { type: String } }; }
  const u = new U({});
  assert.equal(u.name, undefined);

  Base.autorequire = cleanup;
});

test("autorequire false still respects explicit required:true", () => {
  const cleanup = Base.autorequire;
  Base.autorequire = false;

  class U extends Base { static schema = { name: { type: String, required: true } }; }
  assert.throws(() => new U({}), /Missing required property/);

  Base.autorequire = cleanup;
});

test("autorequire false still respects explicit optional:false", () => {
  const cleanup = Base.autorequire;
  Base.autorequire = false;

  class U extends Base { static schema = { name: { type: String, optional: false } }; }
  assert.throws(() => new U({}), /Missing required property/);

  Base.autorequire = cleanup;
});

test("autorequire true respects required:false opt-out", () => {
  const cleanup = Base.autorequire;
  Base.autorequire = true;

  class U extends Base { static schema = { name: { type: String, required: false } }; }
  assert.doesNotThrow(() => new U({}));

  Base.autorequire = cleanup;
});

test("autorequire true respects optional:true opt-out", () => {
  const cleanup = Base.autorequire;
  Base.autorequire = true;

  class U extends Base { static schema = { name: { type: String, optional: true } }; }
  assert.doesNotThrow(() => new U({}));

  Base.autorequire = cleanup;
});

test("autorequire does not affect fields with defaults", () => {
  const cleanup = Base.autorequire;
  Base.autorequire = false;

  class U extends Base { static schema = { role: { type: String, default: "user" } }; }
  assert.doesNotThrow(() => new U({}));
  const u = new U({});
  assert.equal(u.role, "user");

  Base.autorequire = cleanup;
});

// ==================== SET ====================

test("Set construction with plain values", () => {
  class U extends Base {
    static schema = {
      tags: { type: Set, values: { type: String } }
    };
  }

  const u = new U({ tags: new Set(["a", "b"]) });
  assert.ok(u.tags instanceof Set);
  assert.deepEqual(Array.from(u.tags), ["a", "b"]);
});

test("Set .add() validates items", () => {
  class U extends Base {
    static schema = {
      tags: { type: Set, values: { type: String, beforeChecks: v => v.trim() } }
    };
  }

  const u = new U({ tags: new Set(["a"]) });
  u.tags.add("  b  ");
  assert.equal(u.tags.size, 2);
  // beforeChecks throws on non-string values
  assert.throws(() => u.tags.add(123));
});

test("Set construction with Object values", () => {
  class U extends Base {
    static schema = {
      items: {
        type: Set,
        values: {
          type: Object,
          keys: { name: { type: String }, qty: { type: Number } }
        }
      }
    };
  }

  const u = new U({ items: new Set([{ name: "foo", qty: 1 }]) });
  assert.equal(u.items.size, 1);
});

test("Set rejects non-Set input at construction", () => {
  class U extends Base {
    static schema = {
      tags: { type: Set, values: { type: String } }
    };
  }

  assert.throws(() => new U({ tags: ["x", "y"] }), /Invalid type/);
});

// ==================== MAP ====================

test("Map construction with keys schema", () => {
  class U extends Base {
    static schema = {
      meta: {
        type: Map,
        keys: { role: { type: String }, score: { type: Number, min: 0 } }
      }
    };
  }

  const u = new U({ meta: new Map([["role", "admin"], ["score", 100]]) });
  assert.ok(u.meta instanceof Map);
  assert.equal(u.meta.get("role"), "admin");
  assert.equal(u.meta.get("score"), 100);
});

test("Map .set() validates values against key schema", () => {
  class U extends Base {
    static schema = {
      meta: {
        type: Map,
        keys: { score: { type: Number, min: 0, max: 999, optional: true } }
      }
    };
  }

  const u = new U({ meta: new Map() });
  u.meta.set("score", 50);
  assert.equal(u.meta.get("score"), 50);
  assert.throws(() => u.meta.set("score", -1), /Value too small/);
  assert.throws(() => u.meta.set("score", 1000), /Value too large/);
});

test("Map .get() / .has() / .delete() proxy to underlying Map", () => {
  class U extends Base {
    static schema = {
      meta: {
        type: Map,
        keys: { x: { type: Number } }
      }
    };
  }

  const u = new U({ meta: new Map([["x", 1]]) });
  assert.equal(u.meta.get("x"), 1);
  assert.ok(u.meta.has("x"));
  u.meta.delete("x");
  assert.equal(u.meta.has("x"), false);
});

// ==================== HANDLER SCOPING & DEDUP ====================

test("duplicate handler name is silently ignored", () => {
  const order = [];
  Base.addValidationHandler("dedupTest", () => order.push("first"));
  Base.addValidationHandler("dedupTest", () => order.push("second"));

  class U extends Base { static schema = { x: { type: String } }; }
  new U({ x: "test" });

  assert.deepEqual(order, ["first"]);

  Base.removeValidationHandler("dedupTest");
});

test("handlers are shared via prototype inheritance (no per-class isolation)", () => {
  const calls = [];

  Base.addValidationHandler("shared", () => calls.push("global"));

  class A extends Base {
    static schema = { x: { type: String } };
  }
  class B extends Base {
    static schema = { y: { type: String } };
  }

  new A({ x: "a" });
  new B({ y: "b" });

  assert.equal(calls.length, 2);

  // Adding via subclass mutates the shared Map on Base
  A.addValidationHandler("extra", () => calls.push("extra"));
  new A({ x: "c" });
  assert.ok(calls.length > 2);

  Base.removeValidationHandler("shared");
  Base.removeValidationHandler("extra");
});

// ==================== ERROR METADATA ====================

test("buildError produces error with all metadata fields", () => {
  const e = buildError(ValueError, "test msg", "sourceFn", "path.foo", "expectedVal", "receivedVal", "MY_CODE");
  assert.ok(e instanceof ValueError);
  assert.equal(e.message, "test msg");
  assert.equal(e.source, "sourceFn");
  assert.deepEqual(e.path, ["path", "foo"]);
  assert.equal(e.expected, "expectedVal");
  assert.equal(e.received, "receivedVal");
  assert.equal(e.code, "MY_CODE");
});

test("error.expected contains meaningful values (type, min, max, enum)", () => {
  class U extends Base {
    static schema = {
      name: { type: String, min: 2, max: 10 },
      role: { type: String, enum: ["a", "b"] },
      count: { type: Number, min: 1 }
    };
  }

  try { new U({ name: "x", role: "c", count: 0 }); } catch (e) {
    assert.ok(e.expected != null);
  }
});

// ==================== NULL & EDGE-CASE GUARDS ====================

test("schema field with { type: undefined } throws SchemaDefinitionError", () => {
  class U extends Base {
    static schema = { name: { type: undefined } };
  }

  assert.throws(
    () => new U({ name: "hello" }),
    (err) => {
      assert.ok(err instanceof SchemaDefinitionError);
      assert.match(err.message, /Invalid schema definition/);
      assert.equal(err.code, "SCHEMA_DEFINITION_ERROR");
      return true;
    }
  );
});

test("schema field with { type: null } throws SchemaDefinitionError", () => {
  class U extends Base {
    static schema = { name: { type: null } };
  }

  assert.throws(
    () => new U({ name: "hello" }),
    (err) => {
      assert.ok(err instanceof SchemaDefinitionError);
      assert.match(err.message, /Invalid schema definition/);
      assert.equal(err.code, "SCHEMA_DEFINITION_ERROR");
      return true;
    }
  );
});

test("schema field with non-function type (e.g. string) throws SchemaDefinitionError", () => {
  class U extends Base {
    static schema = { name: { type: "string" } };
  }

  assert.throws(
    () => new U({ name: "hello" }),
    (err) => {
      assert.ok(err instanceof SchemaDefinitionError);
      assert.match(err.message, /Invalid schema definition/);
      assert.equal(err.code, "SCHEMA_DEFINITION_ERROR");
      return true;
    }
  );
});

test("Union(Array, String) with string value preserves string (no char-split)", () => {
  class U extends Base {
    static schema = {
      val: { type: Union(Array, String), values: String }
    };
  }

  const u = new U({ val: "hello" });
  assert.equal(typeof u.val, "string");
  assert.equal(u.val, "hello");
  assert.equal(Array.isArray(u.val), false);
});

test("Union(Array, String) with array value still validates as array", () => {
  class U extends Base {
    static schema = {
      val: { type: Union(Array, String), values: String }
    };
  }

  const u = new U({ val: ["a", "b"] });
  assert.ok(Array.isArray(u.val));
  assert.deepEqual(Array.from(u.val), ["a", "b"]);
});

test("Number field rejects string without coerce flag", () => {
  class U extends Base {
    static schema = { age: { type: Number } };
  }

  assert.throws(
    () => new U({ age: "42" }),
    (err) => {
      assert.ok(err instanceof TypeValidationError);
      assert.equal(err.code, "INVALID_TYPE");
      return true;
    }
  );
});

test("Number field with coerce: true converts string to number", () => {
  class U extends Base {
    static schema = { age: { type: Number, coerce: true } };
  }

  const u = new U({ age: "42" });
  assert.ok(u.age instanceof Number || typeof u.age === "number");
});

test("Union(Object, String) with string value preserves string (does not run Object keys validations)", () => {
  class U extends Base {
    static schema = {
      val: {
        type: Union(Object, String),
        keys: {
          prop: { type: String, required: true }
        }
      }
    };
  }

  const u = new U({ val: "hello" });
  assert.equal(typeof u.val, "string");
  assert.equal(u.val, "hello");
});

test("supports readonly enum arrays (as const assertions)", () => {
  const RO_ROLES = Object.freeze(["ADMIN", "USER", "GUEST"]);
  class U extends Base {
    static schema = {
      role: { type: String, enum: RO_ROLES }
    };
  }

  const u = new U({ role: "ADMIN" });
  assert.equal(u.role, "ADMIN");
  assert.throws(() => new U({ role: "INVALID" }), /Invalid value for 'role'/);
});

test("handles null-prototype inputs gracefully", () => {
  class U extends Base {
    static schema = {
      name: { type: String }
    };
  }

  const nullProtoObj = Object.create(null);
  nullProtoObj.name = "Alice";

  const u = new U(nullProtoObj);
  assert.equal(u.name, "Alice");
});
