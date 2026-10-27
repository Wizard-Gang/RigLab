// An independent evaluator for the closed JSON Schema 2020-12 subset RigLab publishes in schemas/, after MapLab's.
// Written from the dialect, not from src/format: unknown keywords, nested $defs, remote or unresolved $ref, and an object
// schema that leaves `additionalProperties` open are refused when a schema is compiled.

export const DIALECT = "https://json-schema.org/draft/2020-12/schema";

type Node = Readonly<Record<string, any>>;
type Schema = boolean | Node;

export interface Compiled {
  readonly name: string;
  readonly root: Node;
  readonly defs: Readonly<Record<string, Schema>>;
  readonly patterns: ReadonlyMap<string, RegExp>;
}

export interface Violation {
  readonly keyword: string;
  readonly path: string;
}

const ANNOTATION = new Set(["$schema", "$id", "$comment", "title", "description", "$defs"]);
const ASSERTION = new Set(["type", "const", "enum", "required", "dependentRequired", "properties", "additionalProperties",
  "propertyNames", "minProperties", "maxProperties", "prefixItems", "items", "minItems", "maxItems", "uniqueItems", "minimum",
  "maximum", "exclusiveMinimum", "exclusiveMaximum", "pattern", "minLength", "maxLength", "oneOf", "$ref"]);
const REF = /^#\/\$defs\/([A-Za-z0-9_-]+)$/;
const isObject = (v: unknown): v is Node => v !== null && typeof v === "object" && !Array.isArray(v);

/** Canonical JSON: object members sorted, so `const`, `enum` and `uniqueItems` compare values, not member order. */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (isObject(value)) return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`;
  return JSON.stringify(value);
}

const pathText = (path: readonly (string | number)[]): string =>
  path.reduce<string>((text, at) => (typeof at === "number" ? `${text}[${at}]` : `${text}.${at}`), "$");

/** Compiles one published schema; `name` labels diagnostics. Throws on any construct outside the subset. */
export function compile(schema: unknown, name: string): Compiled {
  const bad = (message: string): never => { throw new Error(`${name}: ${message}`); };
  if (!isObject(schema) || schema.$schema !== DIALECT) bad("root must declare JSON Schema 2020-12");
  const root = schema as Node;
  const defs: Record<string, Schema> = isObject(root.$defs) ? root.$defs : root.$defs === undefined ? {} : bad("$defs must be an object");
  const patterns = new Map<string, RegExp>();
  const visit = (node: unknown, at: string): void => {
    if (typeof node === "boolean") return;
    if (!isObject(node)) return bad(`schema expected at ${at}`);
    for (const [k, v] of Object.entries(node)) {
      if (!ANNOTATION.has(k) && !ASSERTION.has(k)) bad(`unsupported keyword ${k} at ${at}`);
      if ((k === "$defs" || k === "$schema") && at !== "#") bad(`nested ${k} at ${at}`);
      if (k === "$ref" && !(typeof v === "string" && REF.test(v) && Object.hasOwn(defs, REF.exec(v)![1]!))) bad(`non-local or unresolved $ref at ${at}`);
      if (k === "pattern") {
        try { patterns.set(v, new RegExp(v, "u")); } catch { bad(`invalid pattern at ${at}`); }
      }
    }
    if (node.type === "object" && node.additionalProperties === undefined) bad(`open object at ${at}`);
    if (isObject(node.properties)) for (const [k, v] of Object.entries(node.properties)) visit(v, `${at}/properties/${k}`);
    if (Array.isArray(node.prefixItems)) node.prefixItems.forEach((v, i) => visit(v, `${at}/prefixItems/${i}`));
    if (Array.isArray(node.oneOf)) node.oneOf.forEach((v, i) => visit(v, `${at}/oneOf/${i}`));
    for (const k of ["items", "propertyNames"]) if (node[k] !== undefined) visit(node[k], `${at}/${k}`);
    if (isObject(node.additionalProperties)) visit(node.additionalProperties, `${at}/additionalProperties`);
    else if (node.additionalProperties !== undefined && node.additionalProperties !== false) bad(`additionalProperties must be false or a schema at ${at}`);
  };
  visit(root, "#");
  for (const [k, v] of Object.entries(defs)) visit(v, `#/$defs/${k}`);
  return { name, root, defs, patterns };
}

const typeOk = (type: unknown, v: unknown): boolean => {
  switch (type) {
    case "null": return v === null;
    case "boolean": return typeof v === "boolean";
    case "string": return typeof v === "string";
    case "number": return typeof v === "number";
    case "integer": return typeof v === "number" && Number.isInteger(v);
    case "array": return Array.isArray(v);
    case "object": return isObject(v);
    default: return false;
  }
};

/** Every violation `{keyword, path}` of `value` against the compiled schema, up to `limit`; empty when it conforms. */
export function validate(compiled: Compiled, value: unknown, limit = 20): Violation[] {
  const out: Violation[] = [];
  const run = (node: Schema, v: unknown, path: readonly (string | number)[], sink: Violation[]): void => {
    if (sink.length >= limit || node === true) return;
    const fail = (keyword: string, at = path): void => { if (sink.length < limit) sink.push({ keyword, path: pathText(at) }); };
    if (node === false) return fail("false");
    if (node.$ref !== undefined) run(compiled.defs[REF.exec(node.$ref)![1]!]!, v, path, sink);
    if (node.type !== undefined && !typeOk(node.type, v)) return fail("type");
    if (node.const !== undefined && canonical(node.const) !== canonical(v)) fail("const");
    if (node.enum !== undefined && !node.enum.some((e: unknown) => canonical(e) === canonical(v))) fail("enum");
    if (typeof v === "number") {
      if (node.minimum !== undefined && v < node.minimum) fail("minimum");
      if (node.maximum !== undefined && v > node.maximum) fail("maximum");
      if (node.exclusiveMinimum !== undefined && v <= node.exclusiveMinimum) fail("exclusiveMinimum");
      if (node.exclusiveMaximum !== undefined && v >= node.exclusiveMaximum) fail("exclusiveMaximum");
    }
    if (typeof v === "string") {
      const length = [...v].length;
      if (node.minLength !== undefined && length < node.minLength) fail("minLength");
      if (node.maxLength !== undefined && length > node.maxLength) fail("maxLength");
      if (node.pattern !== undefined && !compiled.patterns.get(node.pattern)!.test(v)) fail("pattern");
    }
    if (Array.isArray(v)) {
      if (node.minItems !== undefined && v.length < node.minItems) fail("minItems");
      if (node.maxItems !== undefined && v.length > node.maxItems) fail("maxItems");
      if (node.uniqueItems === true && new Set(v.map(canonical)).size !== v.length) fail("uniqueItems");
      const prefix: readonly Schema[] = Array.isArray(node.prefixItems) ? node.prefixItems : [];
      v.forEach((item, i) => {
        const sub = i < prefix.length ? prefix[i] : node.items;
        if (sub !== undefined) run(sub, item, [...path, i], sink);
      });
    }
    if (isObject(v)) {
      const keys = Object.keys(v);
      const props: Node = isObject(node.properties) ? node.properties : {};
      if (node.minProperties !== undefined && keys.length < node.minProperties) fail("minProperties");
      if (node.maxProperties !== undefined && keys.length > node.maxProperties) fail("maxProperties");
      for (const r of node.required ?? []) if (!Object.hasOwn(v, r)) fail("required", [...path, r]);
      for (const [k, needs] of Object.entries(node.dependentRequired ?? {})) {
        if (Object.hasOwn(v, k)) for (const r of needs as string[]) if (!Object.hasOwn(v, r)) fail("dependentRequired", [...path, r]);
      }
      for (const k of keys) {
        if (node.propertyNames !== undefined) {
          const s: Violation[] = [];
          run(node.propertyNames, k, [...path, k], s);
          if (s.length) fail("propertyNames", [...path, k]);
        }
        if (Object.hasOwn(props, k)) run(props[k], v[k], [...path, k], sink);
        else if (node.additionalProperties === false) fail("additionalProperties", [...path, k]);
        else if (isObject(node.additionalProperties)) run(node.additionalProperties, v[k], [...path, k], sink);
      }
    }
    if (Array.isArray(node.oneOf)) {
      const passing = node.oneOf.filter((sub: Schema) => { const s: Violation[] = []; run(sub, v, path, s); return s.length === 0; }).length;
      if (passing !== 1) fail("oneOf");
    }
  };
  run(compiled.root, value, [], out);
  return out;
}
