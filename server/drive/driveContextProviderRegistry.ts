import type { DriveContextType } from "../../src/types/orf";

export interface DriveContextReference {
  readonly id: string;
  readonly title: string;
}

export interface DriveContextProvider {
  readonly protocolVersion: 1;
  readonly type: DriveContextType;
  getReferences(input: { readonly contextIds: readonly string[]; readonly storageScopeId: string }): Promise<readonly DriveContextReference[]>;
  searchReferences(input: { readonly limit?: number; readonly query: string; readonly storageScopeId: string }): Promise<readonly DriveContextReference[]>;
}

const providers = new Map<DriveContextType, DriveContextProvider>();

export function registerDriveContextProvider(provider: DriveContextProvider) {
  if (provider.protocolVersion !== 1) {
    throw new Error(`Unsupported drive context provider protocol for ${provider.type}.`);
  }
  if (providers.has(provider.type)) {
    throw new Error(`Drive context provider already registered: ${provider.type}.`);
  }
  providers.set(provider.type, provider);
}

export function requireDriveContextProvider(type: DriveContextType) {
  const provider = providers.get(type);
  if (!provider) {
    throw new Error(`Drive context provider is not registered: ${type}.`);
  }
  return provider;
}
