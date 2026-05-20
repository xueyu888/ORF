import type { StepParams } from "../_framework/types";

export function requiredString(params: StepParams, key: string) {
  const value = params[key];
  if (typeof value !== "string") {
    throw new Error(`参数 ${key} 必须是 string`);
  }
  return value;
}

export function optionalString(params: StepParams, key: string) {
  const value = params[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new Error(`参数 ${key} 必须是 string`);
  }
  return value;
}

export function requiredNumber(params: StepParams, key: string) {
  const value = params[key];
  if (typeof value !== "number") {
    throw new Error(`参数 ${key} 必须是 number`);
  }
  return value;
}

export function optionalNumber(params: StepParams, key: string) {
  const value = params[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "number") {
    throw new Error(`参数 ${key} 必须是 number`);
  }
  return value;
}

export function optionalBoolean(params: StepParams, key: string) {
  const value = params[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "boolean") {
    throw new Error(`参数 ${key} 必须是 boolean`);
  }
  return value;
}
