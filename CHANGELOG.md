# CHANGELOG

All notable changes to this project will be documented in this file.

## [2.0.0] - 2026-07-18

### ⚠️ Breaking Changes

- **Source code refactored into `src/` modules**: Single-file `base.ts` split into `src/typing.ts` (types, type inference, `Union`), `src/errors.ts` (error classes, `parsePath`), `src/utils.ts` (helpers, Proxy handlers), and `src/base.ts` (Base class). Unified re-exports from `index.ts`. Import paths unchanged (`@bufferpunk/modelcore`), but users importing directly from `base.ts` must update to `index.ts`.
- **Named exports**: `Base` is now a named export — `import { Base } from '@bufferpunk/modelcore'` (was default export `import Base from ...`).
- **Container runtime type guards**: `isArray` now requires `value instanceof Array`; `isSet` requires `value instanceof Set`; `isMap` requires `value instanceof Map`; `isObject` requires `Object.prototype.toString.call(value) === "[object Object]"`. A schema field `{ type: Array }` will reject non-array inputs, `{ type: Set }` rejects non-Set inputs, etc. This prevents subtle bugs in Union schemas and improves type safety.
- **`normalizeConf` validates `type` is a function**: `{ type: undefined }`, `{ type: null }`, or `{ type: "string" }` now throws `SchemaDefinitionError` at construction time (was silently accepted).
- **`isNaN` check for Date and Number**: placed check after coercion to ensure invalid dates and numbers are rejected.

### Added

- **Extended test coverage**: 8 new tests (60 total) — `{ type: undefined/null/"string" }` schema rejection, `Union(Array, String)` value discrimination, scalar-only coerce tests, and `Union(Object, String)` skipping object-key validation for string values.
- **Readonly enum array support**: Updated `FieldConfig.enum` to allow `readonly any[]` for `as const` schema declarations.

### Changed

- **Module structure**: Clean separation of concerns — types, errors, and utils each in their own file with proper exports.
- **Performance**: Optimized container type-dispatch with early runtime-type checks to avoid unnecessary iteration on mismatched Union branches.

## 1.6.0 - 2026-07-12

### Added

- **`Set` schema type**: Define `{ type: Set, values: { type: String } }` fields. Backed by a Proxy handler that validates `.add()` calls. Accepts any `Iterable` at construction — converts via `Array.from()`. Object values with nested `keys` are supported.
- **`Map` schema type**: Define `{ type: Map, keys: { score: { type: Number, min: 0 } } }` fields. Backed by a Proxy handler that validates `.set()` calls per-key schema. Proxies `.get()`, `.has()`, `.delete()`, `.forEach()`, `.keys()`, `.values()`, `.entries()` to the raw Map.
- **Named validation handlers**: `Base.addValidationHandler(name, fn)` and `Base.removeValidationHandler(name)` replace the anonymous array-based API. Duplicate names are silently ignored. Handlers live on `constructor.validationHandlers` (a `Map<string, Function>`) and are shared via prototype chain.
- **Extended test coverage**: 11 new tests covering Set/Map construction and mutation, handler duplicate-name dedup, prototype-chain sharing, and error metadata (`buildError`, `expected` field values).

### Changed

- Validation pipeline order: handlers now run after `enum` check and before `afterChecks` (was after `afterChecks`/`validate`).
- Error `expected` field now carries meaningful values (`conf.type`, `conf.max`, `conf.min`, `conf.enum`, `"Array"`) instead of `null`.
- `static version` removed entirely (class-level versioning dropped; `update` no longer sets `this.version`).
- `base.js` synced with `base.ts` for Set/Map/handler changes.

## [1.5.0] - 2026-07-10

### Added

- **`Base.autorequire` global toggle**: Control whether missing non-optional fields throw a `RequiredError`. Set `Base.autorequire = false` to silently allow missing fields — useful for gradual schema adoption. Explicit `required: true` / `optional: false` always take precedence over the global flag.
- **Extended test coverage**: 13 new tests covering validation handler lifecycle (calls, rejection, ordering, args, nested, error metadata) and autorequire behavior (default, true, false, precedence, defaults).

## [1.4.0] - 2026-07-10

### Added

- **Validation handler / middleware system** (`Base.addValidationHandler(handler)`): Register functions `(conf, value, path) => void` that run during every `validateType` call, after built-in checks (type, min/max, enum) and before `afterChecks`. Handlers can throw to reject a value. Registered once on `Base`, applied to every model and every field automatically.
- **`FieldConfig` index signature** (`[key: string]: any`): Schemas can now carry arbitrary metadata properties (e.g., `regex`, `minWords`) alongside standard config keys, consumed by custom validation handlers.
- **`buildError()` is now exported**: Enables custom handlers to throw typed `ModelCoreError` subclasses with proper `source`, `path`, `expected`, `received`, and `code` properties.

### Changed

- `version` instance property removed from type declaration (was redundant — `ctor.version` handles versioning at the class level).
- Updated README with validation handler documentation, `buildError` reference, autorequire toggle docs, and expanded API docs.
- Updated `examples/user.ts` to demonstrate custom `regex` validation with a handler.
- `base.js` synced with `base.ts` for `autorequire` and handler loop logic.

## [1.3.0] - 2026-07-10

### Performance (3-4x improvement)

- This version brings significant performance improvements to the core model construction and validation logic, as well as bulk updates.
 This was achieved by eliminating the javascript Object.defineProperty() calls that slowed down execution.
 **Benchmark results (100K iterations, Node 24)**:

  | Operation | v1.2.0 | v1.3.0 |
  |---|---|---|
  | `construct + validate` | ~85K ops/sec | ~383K ops/sec |
  | `Model.create()` factory method | ~92K ops/sec | ~383K ops/sec |
  | `batch update` | ~46K ops/sec | ~399K ops/sec |


## [1.2.0] - 2026-06-04

### Added
- `Union(...)` helper for typed union schema fields and runtime validation.
- support shorthand constructors inside nested `keys` and `values`, so nested fields like `make: String` work naturally.
- `required` alias support for `optional: false` and clearer required-field intent.
- `properties` alias support for `Object` field schemas in addition to `keys`.

### Changed
- improved TypeScript inference for union fields and nested schema shorthand.
- updated README and docs with union support and nested shorthand examples.

### Fixed
- corrected schema typings so `Union(String, Number)` behaves correctly with `createFrom` and compile-time inference.

## [1.1.0] - 2026-06-02

### Added
- Rich and detailed error handling with descriptive error classes to enable programmatic error handling and clearer error semantics.

### Changed
- Removed redundant checks
- Fixed loop on error thrown during construction to properly set all properties to the error object instead of just the enumerable ones.

### Notes
- These changes improve runtime safety and the test coverage baseline; see tests in `test/base.test.js` for usage patterns.

## [1.0.0] - 2024-06-30
- Project renamed from `@bufferpunk/schema` to `@bufferpunk/modelcore` to better reflect its focus on runtime entities and validation rather than just schema definition.
- Improve TypeScript ergonomics: recommend `as const` schemas and provide `createFrom` factory for single-source-of-truth typed instantiation.
- Map runtime constructors (including custom classes) to instance types for better editor hovers and instance validation.
- Harden array behavior: non-writable index properties, guarded `push`/`unshift`/`splice` that validate items, and forbid `fill` to maintain integrity.
- Preserve schema literal types and avoid broad index signatures that produced `any` in editor hovers.
- Expand test coverage: added/merged comprehensive tests covering arrays, immutability, nested validation, defaults, and custom types.
- Add GitHub Actions CI workflow to run build, tests, and coverage.
- Rewrite README to focus on technical usage and TypeScript guidance; extract manifesto into `manifesto.md` for positioning and goals.
- `createFrom()` factory for typed model instantiation from static `schema`.
- Improved TypeScript mapped types to infer instance shapes from `schema` definitions when used with `as const`.
- Custom constructor handling so class types (e.g., `Email`) map to their instances at the type level and are validated at runtime.
- Extensive tests covering mutation semantics and validation rules.
- `.github/workflows/ci.yml` to run build and tests on push/PR.

### Fixed
- Fixed array mutation edge-cases (splice/delete-only behavior) and ensured index descriptors are rebuilt after guarded mutations.
- Removed class-level coerce which is dangerous and not commonly needed; coercion should be opt-in per field or via constructor config.

## Migration notes
- Install the new package: `npm install @bufferpunk/modelcore`
- Update imports from `@bufferpunk/schema` to `@bufferpunk/modelcore`
- If using TypeScript, update schema definitions to use `as const satisfies SchemaDefinition` for better type inference, and use the `createFrom` factory method for instantiation to get typed instances.
- Review the new README and manifesto for updated usage patterns and design philosophy.

## [3.1.0] - 2026-05-12

### ⚠️ Breaking Changes

- **Immutability error messages**: Error message wording changed for consistency
  ```
  // Before: "Cannot change immutable property 'name'"
  // After: "Cannot update immutable property 'name'"
  ```

- **Property setter enforcement**: Class-level immutability now prevents direct property assignment (not just `.update()`)
  ```ts
  class ImmutableUser extends Base {
    static immutable = true;
    static schema = { name: { type: String } };
  }
  
  const user = new ImmutableUser({ name: "John" });
  user.name = "Jane"; // Error: Cannot update immutable object of type ImmutableUser
  ```

### ✨ New Features

- **`json()` method**: Serialize instance to JSON string
  ```ts
  const user = new User({ name: "John" });
  const jsonStr = user.json();
  ```

- **`parseConfig` parameter**: Pass `coerce` and `safe` options to constructor and `.update()`
  ```ts
  // Coerce string to Date on construction
  const user = new User({ createdAt: "2020-01-01" }, { coerce: true });
  
  // Silently ignore validation errors during construction
  const user = new User({}, { safe: true });
  ```

- **Property setter validation**: Direct property assignment now validates and revalidates values
  ```ts
  const user = new User({ name: "John" });
  user.name = "  Jane  "; // Runs beforeChecks/afterChecks hooks
  ```

- **Fixed nested object property leak**: Nested `keys` properties now correctly attach to their parent object, not the root instance

### 🐛 Bug Fixes

- Property setters now persist validated values instead of discarding them
- Nested object child properties no longer leak to the root object during initialization
- Immutability is now enforced on direct property assignment (not just `.update()`)

## [3.0.0] - 2026-05-06

### ⚠️ Breaking Changes

- **Constructor signature changed**: Removed `addVersion` parameter from constructor. Version is now automatically included if `static version` is defined on the class.
  ```ts
  // Before
  new User(data, true);
  
  // After
  new User(data);
  ```

- **Hook names renamed**:
  - `beforeValidate` → `beforeChecks`
  - `afterValidate` → `afterChecks`

- **Array field config changed**: `child` → `values`
  ```ts
  // Before
  cars: { type: Array, child: { type: Object, children: { ... } } }
  
  // After
  cars: { type: Array, values: { type: Object, keys: { ... } } }
  ```

- **Object field config changed**: `children` → `keys`
  ```ts
  // Before
  address: { type: Object, children: { street: {...}, city: {...} } }
  
  // After
  address: { type: Object, keys: { street: {...}, city: {...} } }
  ```

### ✨ New Features

- **Immutability support**: Mark fields or entire classes as immutable
  ```ts
  class ImmutableUser extends Base {
    static immutable = true; // entire class cannot be updated
    
    static schema = {
      id: { type: String, immutable: true }, // this field cannot change
      name: { type: String }
    };
  }
  ```

- **Update method**: Safely update instance properties after creation
  ```ts
  const user = new User({ name: 'John' });
  user.update({ name: 'Jane' }); // returns void, modifies instance
  ```

- **Better error messages**: Property paths now include quotes for clarity
  ```
  // Before: "Invalid value for address.street, expected one of: ..."
  // After: "Invalid value for 'address.street', expected one of: ..."
  ```

### 📝 Migration Guide

If upgrading from v2.x:

1. Replace all `beforeValidate` with `beforeChecks`
2. Replace all `afterValidate` with `afterChecks`
3. Replace all `child` with `values` in Array types
4. Replace all `children` with `keys` in Object types
5. Remove the second parameter from all constructor calls (version now auto-applies)
6. If using immutability, enable with `static immutable = true` or field-level `immutable: true`
7. For instance updates, use the new `update()` method instead of reassigning properties
