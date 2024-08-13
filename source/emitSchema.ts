// :copyright: Copyright (c) 2023 ftrack
import type {
  QuerySchemasResponse,
  Schema,
  SchemaProperties,
  TypedSchemaProperty,
} from "@ftrack/api";
import { type CustomAttributeConfiguration } from "./emitCustomAttributes";
import { TypeScriptEmitter } from "./typescriptEmitter";

// Add schemas from the schemas folder, to be used for finding extended schemas
export async function emitSchemaInterface(
  typescriptEmitter: TypeScriptEmitter,
  schema: Schema,
  allSchemas: QuerySchemasResponse,
  customAttributes: CustomAttributeConfiguration[]
) {
  const interfaceName = getTypeScriptInterfaceNameForInterface(typescriptEmitter, schema);

  // If the schema is a subtype of TypedContext, return that
  if (typeof schema?.alias_for === "object" && schema.alias_for.id === "Task") {
    typescriptEmitter.appendCode(`
      export type ${interfaceName} = Omit<TypedContext<"${interfaceName}">, 'custom_attributes'> & {
        custom_attributes: Array<
          ${customAttributes
            .filter(
              (x) => x.is_hierarchical || x.object_type?.name === interfaceName
            )
            .map((x) => `TypedCustomAttributeValue<"${x.key}">`)
            .join("|")}
        >
      };
    `)
    return;
  }
  
  // Check if the schema extends another schema and get that base schema
  const baseSchema = getBaseSchema(schema, allSchemas);

  // Get the typedContext schema, to filter the properties for typedContext subtypes
  const typedContextSchema = allSchemas.find((schema) => {
    return schema.id === "TypedContext";
  });

  typescriptEmitter.appendCode(`
    export interface ${interfaceName}${getTypeExtensionSuffix(baseSchema, schema)} {
  `);

  // For each property, add a type to the interface
  emitTypeProperties(
    typescriptEmitter,
    schema,
    baseSchema?.properties,
    typedContextSchema?.properties
  );

  // Entity type and permissions are missing from the source schema, so add them to the interface
  emitEntityTypeAndPermissionProperties(
    typescriptEmitter,
    interfaceName,
  );

  typescriptEmitter.appendCode(`}`);
}

function getTypeScriptInterfaceNameForInterface(typescriptEmitter: TypeScriptEmitter, schema: Schema) {
  let interfaceName = getId(typescriptEmitter, schema);

  // Adds a generic to the interface to TypedContext, which is used for subtypes of TypedContext
  if (interfaceName === "TypedContext") {
    interfaceName =
      "TypedContext<K extends TypedContextSubtype = TypedContextSubtype>";
  }
  return interfaceName;
}

function getId(typescriptEmitter: TypeScriptEmitter, schema: Schema) {
  const id = schema.id;
  if (!id) {
    typescriptEmitter.appendError(`No ID defined for schema ${schema.id}`);
  }

  return id;
}
function emitEntityTypeAndPermissionProperties(
  typescriptEmitter: TypeScriptEmitter,
  interfaceName: string
) {
  if (interfaceName === "TypedContext") {
    typescriptEmitter.appendCode(`__entity_type__?: K;`);
  } else {
    typescriptEmitter.appendCode(`__entity_type__?: "${interfaceName}";`);
  }
  typescriptEmitter.appendCode(`__permissions?: Record<string, any>;`);
}

function getTypeExtensionSuffix(baseSchema?: Schema, schema?: Schema) {
  const omit = `"__entity_type__" | "__permissions"`;

  const baseSchemaSuffix = baseSchema?.id
    ? ` extends Omit<${baseSchema.id}, ${omit}>`
    : "";

  const typedContextSubtypeSuffix =
    typeof schema?.alias_for === "object" && schema.alias_for.id === "Task"
      ? ` extends Omit<TypedContext, ${omit}>`
      : "";

  //Both should never be true, but ¯\_(ツ)_/¯
  return baseSchemaSuffix + typedContextSubtypeSuffix;
}

//Todo: update when Schema type in API is updated
function getBaseSchema(schema: Schema, allSchemas: QuerySchemasResponse) {
  const baseSchema = allSchemas.find((s) => {
    if (!schema.$mixin) {
      return false;
    }

    return s.id === schema.$mixin["$ref"];
  });
  return baseSchema;
}
function emitTypeProperties(
  typescriptEmitter: TypeScriptEmitter,
  schema: Schema,
  baseSchemaProperties?: SchemaProperties,
  typedContextProperties?: SchemaProperties
) {
  // Filter out deprecated properties, that start with _
  const deprecationFilteredProperties = Object.entries(
    schema.properties || []
  ).filter(([key]) => !key.startsWith("_"));
  // Filter out all properties that are defined in the base schema
  const baseSchemaFilteredProperties = deprecationFilteredProperties.filter(
    ([key]) => !baseSchemaProperties?.[key]
  );

  let filteredProperties = baseSchemaFilteredProperties;
  if (typeof schema?.alias_for === "object" && schema.alias_for.id === "Task") {
    filteredProperties = deprecationFilteredProperties.filter(
      ([key]) => !typedContextProperties?.[key]
    );
  }
  // Sort the object by key
  filteredProperties.sort((a, b) => (a[0] > b[0] ? 1 : -1));

  filteredProperties.forEach(([key, value]) => {
    if (typeof value !== "object" || value === null) {
      throw new Error(
        `Property ${key} in schema ${schema.id} is not an object`
      );
    }

    // If neither type or $ref is defined, we can't generate a type. Log an error
    if (!("type" in value) && !("$ref" in value)) {
      typescriptEmitter.appendError(
        `No type or $ref defined for property ${key} in schema ${schema.id}`
      );
    }

    const isRequired =
      schema.required?.includes(key) || schema.primary_key?.includes(key);

    let type;
    if ("$ref" in value && value.$ref) {
      type = value.$ref;
    }
    if ("type" in value && value.type) {
      verifyValidType(value.type);
      type = convertTypeToTsType(key, value);
    }
    let prefix = "";
    // If the property is immutable, add a readonly prefix
    if (schema.immutable?.includes(key) || schema.computed?.includes(key)) {
      prefix = `readonly `;
    }

    // All properties are optional, adds a question mark
    typescriptEmitter.appendCode(`${prefix}${key}${!isRequired ? "?" : ""}: ${type};`);
  });
}

function convertTypeToTsType(key: string, value: TypedSchemaProperty): string {
  // Fix some types that are not supported by TypeScript
  if (value.type === "integer") {
    return "number";
  }

  if (value.type === "variable") {
    return "string | number | boolean | string[]"; // Or maybe string?
  }

  // If the type is an array, we need to check if the items are a built in type or a reference
  if (value.type === "array" || value.type === "mapped_array") {
    if (!value.items) {
      throw new Error(`No items defined for array ${key}`);
    }

    if (value.items.$ref) {
      return `${value.items.$ref}[]`;
    }
  }

  return value.type;
}
function verifyValidType(type: string) {
  if (
    ![
      "object",
      "array",
      "string",
      "number",
      "boolean",
      "mapped_array",
      "integer",
      "variable",
    ].includes(type)
  ) {
    throw new Error(`Invalid type ${type}`);
  }
}