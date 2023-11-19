import { expect, test, vi } from "vitest";
import { emitToString } from "./emit";
import { QuerySchemasResponse, Schema } from "@ftrack/api";
import { readFile } from "fs/promises";
import { join } from "path";

test("emitting with no schemas returns error", async () => {
  //act
  const emitResult = await emitToString(
    "4.13.8",
    "https://ftrack.example.com",
    []
  );

  //assert
  expect(emitResult?.errors[0]).toBe("No schemas found!");
});

test("schema subtype of TypedContext", async () => {
  //arrange
  vi.setSystemTime(new Date(2023, 1, 1));

  const schemas: Array<Partial<Schema>> = [
    getTypedContextSchema(),
    {
      id: "SomeInterfaceName",
      alias_for: {
        id: "Task",
      },
    },
  ];

  //act
  const emitResult = await emitToString(
    "4.13.8",
    "https://ftrack.example.com",
    schemas as QuerySchemasResponse
  );

  //assert
  expect(emitResult.errors).toEqual([]);
  expect(emitResult.prettifiedContent).toMatchFileSnapshot(join(".", "__snapshots__", "schema-subtype-of-TypedContext.snap"));
});

test("schema has base schema", async () => {
  //arrange
  vi.setSystemTime(new Date(2023, 1, 1));

  const schemas: Array<Partial<Schema>> = [
    getTypedContextSchema(),
    {
      id: "SomeInterfaceName",
      $mixin: { $ref: "SomeBaseSchema" },
    },
    {
      id: "SomeBaseSchema",
      type: "variable",
    },
  ];

  //act
  const emitResult = await emitToString(
    "4.13.8",
    "https://ftrack.example.com",
    schemas as QuerySchemasResponse
  );

  //assert
  expect(emitResult.errors).toEqual([]);
  expect(emitResult.prettifiedContent).toMatchFileSnapshot(join(".", "__snapshots__", "schema-has-base-schema.snap"));
});

test("schema has immutable property", async () => {
  //arrange
  vi.setSystemTime(new Date(2023, 1, 1));

  const schemas: Array<Partial<Schema>> = [
    getTypedContextSchema(),
    {
      id: "SomeInterfaceName",
      properties: {
        immutableProperty: {
          type: "variable",
        },
      },
      immutable: ["immutableProperty"],
    },
  ];

  //act
  const emitResult = await emitToString(
    "4.13.8",
    "https://ftrack.example.com",
    schemas as QuerySchemasResponse
  );

  //assert
  expect(emitResult.errors).toEqual([]);
  expect(emitResult.prettifiedContent).toMatchFileSnapshot(join(".", "__snapshots__", "schema-has-immutable-property.snap"));
});

test("schema has integer type", async () => {
  //arrange
  vi.setSystemTime(new Date(2023, 1, 1));

  const schemas: Array<Partial<Schema>> = [
    getTypedContextSchema(),
    {
      id: "SomeInterfaceName",
      properties: {
        integerProperty: {
          type: "integer",
        },
      },
    },
  ];

  //act
  const emitResult = await emitToString(
    "4.13.8",
    "https://ftrack.example.com",
    schemas as QuerySchemasResponse
  );

  //assert
  expect(emitResult.errors).toEqual([]);
  expect(emitResult.prettifiedContent).toMatchFileSnapshot(join(".", "__snapshots__", "schema-has-integer-type.snap"));
});

test("schema has variable type", async () => {
  //arrange
  vi.setSystemTime(new Date(2023, 1, 1));

  const schemas: Array<Partial<Schema>> = [
    getTypedContextSchema(),
    {
      id: "SomeInterfaceName",
      properties: {
        integerProperty: {
          type: "variable",
        },
      },
    },
  ];

  //act
  const emitResult = await emitToString(
    "4.13.8",
    "https://ftrack.example.com",
    schemas as QuerySchemasResponse
  );

  //assert
  expect(emitResult.errors).toEqual([]);
  expect(emitResult.prettifiedContent).toMatchSnapshot();
});

test("schema has array type", async () => {
  //arrange
  vi.setSystemTime(new Date(2023, 1, 1));

  const schemas: Array<Partial<Schema>> = [
    getTypedContextSchema(),
    {
      id: "SomeInterfaceName",
      properties: {
        arrayProperty: {
          type: "array",
          items: {
            $ref: "ArrayItem",
          },
        },
        mappedArrayProperty: {
          type: "mapped_array",
          items: {
            $ref: "ArrayItem",
          },
        },
      },
    },
    {
      id: "ArrayItem",
      type: "variable",
    },
  ];

  //act
  const emitResult = await emitToString(
    "4.13.8",
    "https://ftrack.example.com",
    schemas as QuerySchemasResponse
  );

  //assert
  expect(emitResult.errors).toEqual([]);
  expect(emitResult.prettifiedContent).toMatchFileSnapshot(join(".", "__snapshots__", "schema-has-array-type.snap"));
});


test("default ftrack schema", async () => {
  //arrange
  vi.setSystemTime(new Date(2023, 1, 1));

  const schemaContents = await readFile("./source/__snapshots__/defaultSchema.json");
  const schemas: Array<Schema> = JSON.parse(schemaContents.toString());

  //act
  const emitResult = await emitToString(
    "4.13.8",
    "https://ftrack.example.com",
    schemas
  );

  //assert
  expect(emitResult.errors).toEqual([]);
  expect(emitResult.prettifiedContent).toMatchFileSnapshot(join(".", "__snapshots__", "default-ftrack-schema.snap"));
});

function getTypedContextSchema() {
  return {
    id: "TypedContext",
    properties: {},
  } as Partial<Schema> as Schema;
}
