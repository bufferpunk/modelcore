# ModelCore

**Runtime entity integrity for JavaScript and TypeScript.**

[![Build Status](https://img.shields.io/github/actions/workflow/status/bufferpunk/modelcore/ci.yml?branch=main)](https://github.com/bufferpunk/modelcore) [![Coverage](https://img.shields.io/badge/coverage-95.71%25-green)](https://github.com/bufferpunk/modelcore) [![npm version](https://img.shields.io/npm/v/@bufferpunk/modelcore)](https://npmjs.com/package/@bufferpunk/modelcore) [![License](https://img.shields.io/npm/l/@bufferpunk/modelcore)](https://github.com/bufferpunk/modelcore/blob/main/LICENSE)

---

Most validation libraries protect the boundary. They check data when it arrives, then step aside.

ModelCore does something different: **it stays**.

Once you define a schema, the rules travel with the object — through mutations, reassignments, nested updates, and transport. An invalid state can't sneak in after creation. Your entities mean what they say, always.

> *Pydantic-inspired • Zero dependencies • Frontend & backend*

---

## Why this gap exists

You probably already use Zod, Joi, or Yup. They're great at what they do: validate a plain object at a boundary, then hand it off. But once the object leaves the validator, the rules are gone. The object can drift. It can become invalid silently.

TypeORM and Sequelize give you class-based models, but they're coupled to databases. MobX and Vue reactivity track *what* changed — but not *whether that change should have happened*.

ModelCore fills the gap none of them cover:

| Feature | ModelCore | Zod / Joi / Yup | TypeORM / Sequelize | MobX / Vue |
|---|---|---|---|---|
| Class-based models | ✅ | ❌ | ✅ | ❌ |
| Runtime validation | ✅ | ✅ | Limited | ❌ |
| Continuous enforcement | ✅ | ❌ | ❌ | ❌ |
| Immutability enforcement | ✅ | ❌ | Limited | ❌ |
| Automatic coercion | ✅ | Limited | ❌ | ❌ |
| Nested object validation | ✅ | ✅ | Limited | ❌ |
| Zero dependencies | ✅ | ❌ | ❌ | ❌ |
| Frontend & backend | ✅ | ✅ | Backend only | Frontend only |


## Installation

```bash
npm install @bufferpunk/modelcore
```

---

## Quick start

```typescript
import { Base, SchemaDefinition } from '@bufferpunk/modelcore';

class User extends Base {
  static schema = {
    name: {
      type: String,
      min: 2,
      max: 80,
      beforeChecks: (v: any) => typeof v === 'string' ? v.trim() : v,
      afterChecks: (v: any) => v.replace(/\s+/g, ' ')
    },
    role: {
      type: String,
      enum: ['admin', 'editor', 'viewer'],
      default: 'viewer',
      beforeChecks: (v: any) => typeof v === 'string' ? v.toLowerCase() : v
    },
    confirmed: { type: Boolean, optional: true, default: false }
  } as const satisfies SchemaDefinition;
}

const user = new User({ name: '   John    Doe   ', role: 'EDITOR' });
// → { name: 'John Doe', role: 'editor', confirmed: false }

user.role = 'SUPERUSER'; // throws — 'superuser' is not in enum
user.name = '  Jane  ';  // coerced and trimmed automatically
```

For the best TypeScript experience, use `Model.create()` or `Model.createFrom()` — it infers the instance shape from the schema without any duplication:

```typescript
const user = User.createFrom({ name: 'Ana Silva', role: 'admin' });
// or 
const user = User.create({ name: 'Ana Silva', role: 'admin' });
```

---

## Validation pipeline

Every assignment and construction runs through this exact sequence:

1. **`beforeChecks`** — sanitize/transform raw input (trim, lowercase, etc.)
2. **Required / optional / default resolution** — missing required fields throw; optional fields resolve to `undefined`; defaults are applied
3. **Type validation and coercion** — checks `value.constructor === conf.type`; optional `coerce: true` calls the constructor
4. **`min` / `max` constraints** — applies to `String.length` or numeric value
5. **`enum` check** — value must be in the allowed set
6. **Validation handlers** — registered middleware functions run in order — see [Validation handlers](#validation-handlers)
7. **`afterChecks`** — post-type transformation
8. **Custom `validate` hook** — after everything has been checked, transformed and set
9. **Immutability check** — if the field or class is immutable, reject the mutation

---

## Schema reference

### `FieldConfig`

```typescript
interface FieldConfig {
  type: Function;                    // Constructor: String, Number, Boolean, Date, Array, Object, or custom class
  immutable?: boolean;               // Reject writes after construction
  optional?: boolean;                // Allow undefined
  required?: boolean;                // Alias for optional: false
  default?: any | (() => any);       // Default value (function = factory)
  enum?: any[];                      // Allowed values
  min?: number;                      // Min length (String) or min value (Number)
  max?: number;                      // Max length (String) or max value (Number)
  beforeChecks?: (value: any) => any; // Pre-validation transform
  afterChecks?: (value: any) => any;  // Post-validation transform
  validate?: (value: any) => void;    // Custom validation hook
  keys?: Record<string, FieldConfig | Function>; // Nested object schema
  properties?: Record<string, FieldConfig | Function>; // Alias for keys
  values?: FieldConfig | Function;    // Array item schema
  coerce?: boolean;                   // Auto-coerce via constructor
  [key: string]: any;                 // Custom properties for validation handlers
}
```

### Shorthand syntax

Any field value that is a constructor function (e.g., `String`, `Email`) is normalized to `{ type: thatFunction }`. So `name: String` is equivalent to `name: { type: String }`.

The `type` property must be a constructor function — `{ type: undefined }`, `{ type: null }`, or `{ type: "string" }` will throw a `SchemaDefinitionError` at construction time.

---

## Immutability

Mark a class or individual fields as immutable and ModelCore will enforce it at runtime — not just in TypeScript types.

```typescript
class Order extends Base {
  static immutable = true; // entire class is frozen after creation

  static schema = {
    id:     { type: String, immutable: true },
    total:  { type: Number }
  } as const satisfies SchemaDefinition;
}

const order = new Order({ id: 'ord_123', total: 49.99 });
order.total = 99.99; // throws ImmutableObjectError
```

Immutable fields lock their first value at construction. Immutable classes block all direct assignment and `.update()` calls after construction.

---

## Nested objects and arrays

```typescript
class Post extends Base {
  static schema = {
    title: { type: String, min: 1, max: 200 },
    tags:  { type: Array, values: { type: String, beforeChecks: v => v.trim() } },
    author: {
      type: Object,
      keys: {
        name:  String,
        email: { type: String, validate: v => { if (!v.includes('@')) throw Error('bad email'); } }
      }
    }
  } as const satisfies SchemaDefinition;
}

const post = new Post({
  title: 'Hello',
  tags: ['  one  ', '  two  '],   // items are trimmed
  author: { name: 'Alice', email: 'a@b.com' }
});

post.tags.push('  three  ');  // validated and trimmed
post.author.name = 'Bob';      // validated via nested proxy
```

Nested structures are wrapped in handlers that enforce the same rules. Array mutations (`push`, `unshift`, `splice`, `concat`, index assignment) are all validated. `fill()` is forbidden to prevent bulk silent corruption.

Container types (Array, Set, Map, Object) are validated against the **runtime type of the input value**. A schema field declared as `{ type: Array }` will reject non-array inputs; `{ type: Set }` requires `instanceof Set`; `{ type: Map }` requires `instanceof Map`; `{ type: Object }` requires a plain object (`[object Object]`). This improves type-safety for union schemas — a `Union(Object, String)` field will skip object-key validation when the value is a string.

---

## Custom types

Any class can be a field type. ModelCore validates that the value is an instance of the class and runs its constructor logic during coercion.

```typescript
class Email {
  value: string;
  constructor(value: string) {
    if (!/^\S+@\S+\.\S+$/.test(value)) throw new Error('Invalid email');
    this.value = value;
  }
}

class User extends Base {
  static schema = {
    email: Email,
    name:  String
  } as const satisfies SchemaDefinition;
}

const user = new User({ email: 'alice@example.com', name: 'Alice' });
// user.email is an Email instance, validated at construction
```

---

## Set

```typescript
class User extends Base {
  static schema = {
    tags: { type: Set, values: { type: String, beforeChecks: v => v.trim() } },
    achievements: {
      type: Set,
      values: { type: Object, keys: { name: String, date: Date } }
    }
  };
}

const user = new User({
  tags: new Set(['  one  ', '  two  ']),
  achievements: new Set([{ name: 'Star Gazer', date: new Date() }])
});

user.tags.add('  three  '); // validated and trimmed
```

Accepts any `Iterable` (not just `Set`) — `Array.from()` converts internally.

---

## Map

```typescript
class User extends Base {
  static schema = {
    metadata: {
      type: Map,
      keys: {
        role:  { type: String, enum: ['admin', 'user'] },
        score: { type: Number, min: 0 }
      }
    }
  };
}

const user = new User({
  metadata: new Map([['role', 'admin'], ['score', 100]])
});

user.metadata.set('score', 200); // validated against key schema
```

Everything behave naturally, with added validation.

---

## Validation handlers (middleware)

Register reusable validation logic that runs on **every field, every model, every time** — like a plugin system for the validation pipeline.

```typescript
import { Base, buildError, ValueError } from '@bufferpunk/modelcore';

// 1. Define a handler that reads custom config properties
function validateRegex(conf: any, value: any, path: string) {
  if (conf.regex && typeof value === 'string') {
    if (!conf.regex.test(value))
      throw buildError(ValueError,
        `Value does not match regex ${conf.regex}`,
        validateRegex, path, conf.regex, value, "INVALID_REGEX");
  }
}

// 2. Register it with a unique name — applies everywhere
Base.addValidationHandler("regexValidator", validateRegex);

// 3. Use custom properties in your field config (the index signature allows it)
class User extends Base {
  static schema = {
    name: {
      type: String,
      regex: /^[a-zA-Z\s]+$/,       // custom property, consumed by validateRegex
      beforeChecks: v => v.trim(),
    },
    nickname: {
      type: String,
      minWords: 2,                    // another custom property for a different handler
    },
  } as const satisfies SchemaDefinition;
}
```

Handler functions receive `(FieldConfig, value, path)` and are called **after** built-in checks (type, min/max, enum) and **before** `afterChecks` hook. Throw any `ModelCoreError` subclass (or a regular `Error`) to reject the value.

### Registration

Validation handlers live on `constructor.validationHandlers` (a `Map<string, Function>`). Because of JavaScript's prototype chain, setting a handler on `User` mutates a Map shared with `Base` and all sibling subclasses — there is no per-class isolation. Deleting from `User` or `Base` both affect the same underlying Map.

| Method | Description |
|---|---|
| `Base.addValidationHandler(name, fn)` | Register a global handler. Duplicate names are silently ignored. |
| `User.addValidationHandler(name, fn)` | Register a handler — stored on `User`'s prototype chain (shared with `Base` and siblings). |
| `Base.removeValidationHandler(name)` | Remove a global handler by name. |
| `User.removeValidationHandler(name)` | Remove a handler — walks the same shared Map. |

### Custom field config properties

Because `FieldConfig` includes `[key: string]: any`, you can attach arbitrary metadata to field definitions without TypeScript errors. This lets handlers carry their own configuration alongside the field:

```typescript
// Define handlers that read your custom properties
Base.addValidationHandler("minWords", (conf, value, path) => {
  // your implementation here, using conf.minWords
});

// Use them in schemas with zero boilerplate
class Article extends Base {
  static schema = {
    title:   { type: String, minWords: 3 },
    body:    { type: String, minWords: 50 },
    summary: { type: String, minWords: 1, optional: true },
  } as const satisfies SchemaDefinition;
}
```

### Internal exports

In addition to `Base`, the package exposes its internals for advanced use cases:

```typescript
import {
  Base,
  buildError,                 // Typed error factory
  normalizeConf,              // Schema config normalizer
  isNone,                     // null/undefined check
  createProxyHandler,         // Main Proxy handler
  createArrayHandler,         // Array mutation validator
  createSetHandler,           // Set mutation validator
  createMapHandler,           // Map mutation validator
  createObjectHandler,        // Object mutation validator
  ModelCoreError,             // Base error class
  ModelCoreUnion,             // Union base class
  Union,                      // Union type helper
  SchemaDefinitionError,      // Schema validation error
  // … other error classes
} from '@bufferpunk/modelcore';
```

### `buildError()` helper

To let handlers throw consistent, typed errors:

```typescript
import { buildError, ValueError } from '@bufferpunk/modelcore';

throw buildError(
  ValueError,             // Error class (any ModelCoreError subclass)
  "Human-readable message",
  myHandlerFunction,      // source
  "field.path",           // path
  "expected value",       // expected
  "received value",       // received
  "CUSTOM_ERROR_CODE"     // code
);
```

---

## Union types

```typescript
import { Base, SchemaDefinition, Union } from '@bufferpunk/modelcore';

class User extends Base {
  static schema = {
    identifier: Union(String, Number),
  } as const satisfies SchemaDefinition;
}

const a = new User({ identifier: 'abc' }); // OK
const b = new User({ identifier: 42 });     // OK
const c = new User({ identifier: true });   // throws — not String or Number
```

`Union` accepts any number of constructors (primitives or custom classes) and validates at runtime that the value matches one of them.

---

## Updating instances

```typescript
const user = new User({ name: 'John', role: 'editor' });

user.name = 'Jane';                        // direct assignment, validated
user.update({ name: 'Jane', role: 'admin' }); // bulk update, validated
```

`update()` performs a batch update — it iterates the schema and validates only the fields present in the data object. Fields not included in the update data are left untouched (no re-validation), making partial updates efficient.

---

## Construct / parse options

Pass a second argument to the constructor or `update()` to control behavior:

```typescript
// Coerce string values into their typed counterparts
class User extends Base {
  static schema = {
    name: String,
    createdAt: { type: Date, coerce: true, required: false },
  } as const satisfies SchemaDefinition;
}

// Silently swallow construction errors, marking fields with the error
const user = new User({ name: { not: 'valid' } }, { safe: true });
// user.name === Error (the caught error object)
```

---

## Autorequire (global required-field toggle)

By default, ModelCore throws a `RequiredError` when a field's schema doesn't mark it as `optional` and the value is missing. You can relax this globally with `Base.autorequire`:

```typescript
// Default behavior — missing non-optional fields throw
class User extends Base {
  static schema = { name: { type: String } };
}
new User({}); // throws RequiredError

// Disable autorequire — missing fields silently become undefined
Base.autorequire = false;
new User({}); // { name: undefined }

// Re-enable
Base.autorequire = true; // or delete Base.autorequire
```

### Precedence

| Config | `autorequire` | Behavior |
|---|---|---|
| `optional: true` | any | Allowed, value stays `undefined` |
| `required: false` | any | Allowed, value stays `undefined` |
| `required: true` | any | **Always throws** — explicit override |
| `optional: false` | any | **Always throws** — explicit override |
| _(neither set)_ | `undefined` (default) | Throws `RequiredError` |
| _(neither set)_ | `true` | Throws `RequiredError` |
| _(neither set)_ | `false` | Silently allowed, value stays `undefined` |

This is useful for gradual adoption — start with `autorequire = false` while you migrate schemas, then flip it on once all fields are properly annotated.

This can also be used by ORMs, when you query the DB with maybe just an id field, and you want to allow the rest of the fields to be undefined until you fetch them.

---

## Error system

ModelCore throws typed error classes for every failure mode:

| Error class | Trigger |
|---|---|
| `ValidationError` | Custom `validate` hook throws |
| `TypeValidationError` | Value constructor doesn't match schema type, or value has no prototype chain |
| `RequiredError` | Required field is missing |
| `EnumValueError` | Value not in allowed enum set |
| `RangeError` | Value exceeds min/max |
| `ImmutableObjectError` | Write to immutable class |
| `ImmutablePropertyError` | Write to immutable field |
| `SchemaDefinitionError` | Malformed schema definition, `{ type: undefined }`, `{ type: null }`, or missing `static schema` |
| `MissingPropertyError` | Nested required property missing |
| `ValueError` | Array method misuse (e.g., `fill()`) |

All errors extend `ModelCoreError`, which carries `source`, `path`, `expected`, `received`, and `code` properties for programmatic handling.

---

## Defensive guarantees

ModelCore guards against several degenerate inputs that would otherwise cause raw `TypeError` crashes or silent data corruption:

| Input | Before | After |
|---|---|---|
| `{ type: undefined }` in schema | Raw `TypeError: Cannot read properties of undefined` | `SchemaDefinitionError` with path and code |
| `{ type: null }` in schema | Raw `TypeError` | `SchemaDefinitionError` with path and code |
| `Object.create(null)` as field value | Raw `TypeError: Cannot read properties of undefined (reading 'name')` | `TypeValidationError` with message `"...got null-prototype object"` |
| `Union(Array, String)` with string input | String silently split into char array `['h','e','l','l','o']` | String preserved as-is |
| `"42"` for a `Number` field (no `coerce: true`) | Silently accepted as string | `TypeValidationError` — use `coerce: true` to auto-convert |
| Subclass with no `static schema` | Silent empty object | `SchemaDefinitionError` with class name |



## Performance

ModelCore achieves **>200K ops/sec** on full model construction with nested containers (5 fields, 100K iterations, Node 24). Scalar-only models reach **~1.9M ops/sec**.

| Operation | Ops/sec |
|---|---|---|
| `construct + validate` (3 scalar fields) | ~380K |
| `construct + validate` (5 fields incl. nested) | ~380K |
| `Model.create()` factory | ~380K |
| `bulk update validated fields` (partial 3/5 fields) | ~390K |

Run the included benchmark yourself:

```bash
BENCH_ITERATIONS=100000 npm run bench
```

---

## API reference

### `class Base`

```typescript
import { Base } from '@bufferpunk/modelcore';

class Base {
  static schema: SchemaDefinition;
  static immutable?: boolean;
  static autorequire?: boolean;
  static validationHandlers?: Map<string, Function>;

  constructor(obj: Record<string, any>, parseConfig?: parserConfig);

  static createFrom<T>(obj, parseConfig?): SchemaToType<T['schema']>;
  static create<T>(obj, parseConfig?): SchemaToType<T['schema']>;
  static addValidationHandler(handlerName: string, handler: Function): void;
  static removeValidationHandler(handlerName: string): void;

  update(obj: Record<string, any>, parseConfig?: parserConfig): void;
  toObject(): Record<string, any>;
  json(): string;
}
```

| Method | Description |
|---|---|
| `new Model(data, opts?)` | Creates and validates instance. Returns a Proxy. |
| `Model.createFrom(data, opts?)` | Factory — return type is inferred from schema. |
| `Model.create(data, opts?)` | Alias for `createFrom`. |
| `Base.autorequire` | Global toggle: `false` allows missing non-optional fields silently (default: `undefined` = throw). |
| `Base.addValidationHandler(name, fn)` | Register a named middleware function `(conf, value, path) => void`. Duplicate names are silently ignored. |
| `Base.removeValidationHandler(name)` | Remove a previously registered handler by name. |
| `instance.update(data, opts?)` | Batch/Bulk-update validated fields. |
| `instance.toObject()` | Returns a plain object with all current values. |
| `instance.json()` | To make things easier for you |

