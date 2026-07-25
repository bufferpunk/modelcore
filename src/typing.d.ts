export interface FieldConfig {
    type: any;
    immutable?: boolean;
    optional?: boolean;
    required?: boolean;
    default?: any;
    enum?: any[] | readonly any[];
    max?: number;
    min?: number;
    beforeChecks?: (value: any) => any;
    afterChecks?: (value: any) => any;
    validate?: (value: any) => void;
    keys?: Record<string, FieldConfig | Function>;
    properties?: Record<string, FieldConfig | Function>;
    values?: FieldConfig | Function;
    coerce?: boolean;
    [key: string]: any;
}
export interface SchemaDefinition {
    [key: string]: Function | FieldConfig;
}
export interface parserConfig {
    safe?: boolean;
}
export interface BaseConstructor {
    schema: SchemaDefinition;
    immutable?: boolean;
    version?: number;
    __proxyHandler?: ProxyHandler<any>;
}
export interface errorObject {
    message: string;
    source?: string | Function;
    path?: string;
    expected?: any;
    received?: any;
    code?: string;
}
export declare function Union<T extends readonly (abstract new (...args: any) => any)[]>(...args: T): {
    new (): InstanceType<T[number]>;
    unionTypes: T;
    isArray(arg: any): arg is any[];
    from<T_1>(arrayLike: ArrayLike<T_1>): T_1[];
    from<T_1, U>(arrayLike: ArrayLike<T_1>, mapfn: (v: T_1, k: number) => U, thisArg?: any): U[];
    from<T_1>(iterable: Iterable<T_1> | ArrayLike<T_1>): T_1[];
    from<T_1, U>(iterable: Iterable<T_1> | ArrayLike<T_1>, mapfn: (v: T_1, k: number) => U, thisArg?: any): U[];
    of<T_1>(...items: T_1[]): T_1[];
    readonly [Symbol.species]: ArrayConstructor;
};
export declare class ModelCoreUnion extends Array<any> {
    static unionTypes: readonly any[];
}
type UnwrapTypeConstructor<T> = T extends {
    unionTypes: readonly any[];
} ? InstanceType<T['unionTypes'][number]> : T extends StringConstructor ? string : T extends NumberConstructor ? number : T extends BooleanConstructor ? boolean : T extends DateConstructor ? Date : T extends SetConstructor ? Set<any> : T extends MapConstructor ? Map<any, any> : T extends ArrayConstructor ? any[] : T extends ObjectConstructor ? Record<string, any> : T extends new (...args: any[]) => infer R ? R : unknown;
type NormalizeField<T> = T extends FieldConfig ? T : {
    type: T;
};
type InferFieldConfigRaw<F extends FieldConfig> = F['type'] extends typeof Set ? InferSet<F> : F['type'] extends typeof Map ? InferMap<F> : F['type'] extends typeof Object ? InferObject<F> : F['type'] extends typeof Array ? InferArray<F> : UnwrapTypeConstructor<F['type']>;
type InferFieldRaw<T> = T extends FieldConfig ? InferFieldConfigRaw<T> : T extends Function ? UnwrapTypeConstructor<T> : InferFieldConfigRaw<{
    type: T;
} & FieldConfig>;
type OptionalKeys<T extends Record<string, any>> = {
    [K in keyof T]: NormalizeField<T[K]>['optional'] extends true ? K : NormalizeField<T[K]>['required'] extends false ? K : never;
}[keyof T];
type RequiredKeys<T extends Record<string, any>> = {
    [K in keyof T]: NormalizeField<T[K]>['optional'] extends true ? never : NormalizeField<T[K]>['required'] extends false ? never : K;
}[keyof T];
type InferObject<T extends FieldConfig> = T['keys'] extends Record<string, any> ? {
    [K in RequiredKeys<T['keys']>]: InferFieldRaw<T['keys'][K]>;
} & {
    [K in OptionalKeys<T['keys']>]?: InferFieldRaw<T['keys'][K]>;
} : T['properties'] extends Record<string, any> ? {
    [K in RequiredKeys<T['properties']>]: InferFieldRaw<T['properties'][K]>;
} & {
    [K in OptionalKeys<T['properties']>]?: InferFieldRaw<T['properties'][K]>;
} : Record<string, T['keys']>;
type InferMap<T extends FieldConfig> = T['keys'] extends Record<string, any> ? Map<string, InferFieldRaw<T['keys'][keyof T['keys']]>> : T['properties'] extends Record<string, any> ? Map<string, InferFieldRaw<T['properties'][keyof T['properties']]>> : Map<string, T['keys']>;
type InferArray<T extends FieldConfig> = T['type'] extends ArrayConstructor ? Array<InferFieldRaw<T['values']>> : any[];
type InferSet<T extends FieldConfig> = T['type'] extends SetConstructor ? Set<InferFieldRaw<T['values']>> : Set<any>;
export type SchemaToType<S extends Record<string, any>> = {
    [K in RequiredKeys<S>]: InferFieldRaw<S[K]>;
} & {
    [K in OptionalKeys<S>]?: InferFieldRaw<S[K]>;
};
export {};
