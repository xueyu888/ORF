export type SavedCredentialAccount = {
  displayName?: string;
  email: string;
  id: string;
  updatedAt: string;
};

type SavedCredentialProvider = "browser" | "desktop";
type SavedCredentialStatus = "error" | "success" | "unsupported";

export type SavedCredentialAccountsResult = {
  accounts: SavedCredentialAccount[];
  provider: SavedCredentialProvider;
  reason?: string;
  status: SavedCredentialStatus;
};

export type SavedCredentialPasswordResult = {
  password?: string;
  reason?: string;
  status: SavedCredentialStatus;
};

type LegacySavedLoginAccount = SavedCredentialAccount & {
  password: string;
};

type DesktopCredentialBridgeResult<T> = {
  data?: T;
  reason?: string;
  status: SavedCredentialStatus;
};

type DesktopCredentialBridge = {
  deleteAccount?: (accountId: string) => Promise<DesktopCredentialBridgeResult<{ accounts: SavedCredentialAccount[] }>>;
  getPassword?: (accountId: string) => Promise<DesktopCredentialBridgeResult<{ password: string }>>;
  listAccounts?: () => Promise<DesktopCredentialBridgeResult<{ accounts: SavedCredentialAccount[] }>>;
  saveAccount?: (payload: { displayName?: string; email: string; password: string }) => Promise<DesktopCredentialBridgeResult<{ accounts: SavedCredentialAccount[] }>>;
};

type BrowserPasswordCredentialConstructor = new (data: { id: string; name?: string; password: string }) => Credential;

type BrowserCredentialNavigator = Navigator & {
  credentials?: Navigator["credentials"] & {
    store?: (credential: Credential) => Promise<Credential | null>;
  };
};

declare global {
  interface Window {
    PasswordCredential?: BrowserPasswordCredentialConstructor;
    orfDesktopCredentials?: DesktopCredentialBridge;
  }
}

const legacySavedLoginAccountsKey = "orf.auth.savedLoginAccounts.v1";
const maxSavedCredentialAccounts = 10;

export async function initializeSavedCredentialAccounts(): Promise<SavedCredentialAccountsResult> {
  if (isDesktopCredentialVaultAvailable()) {
    await migrateLegacySavedLoginAccountsToDesktopVault();
    return listDesktopCredentialAccounts();
  }

  clearLegacySavedLoginAccounts();
  return { accounts: [], provider: "browser", status: "success" };
}

export async function rememberSuccessfulCredential(input: { displayName?: string; email: string; password: string }): Promise<SavedCredentialAccountsResult> {
  if (isDesktopCredentialVaultAvailable()) {
    return saveDesktopCredentialAccount(input);
  }

  clearLegacySavedLoginAccounts();
  const browserStatus = await storeBrowserPasswordCredential(input);
  return { accounts: [], provider: "browser", reason: browserStatus.reason, status: browserStatus.status === "error" ? "error" : "success" };
}

export async function forgetSavedCredentialByEmail(email: string): Promise<SavedCredentialAccountsResult> {
  if (!isDesktopCredentialVaultAvailable()) {
    clearLegacySavedLoginAccounts();
    return { accounts: [], provider: "browser", status: "success" };
  }

  return deleteDesktopCredentialAccount(savedCredentialAccountId(email));
}

export async function readSavedCredentialPassword(accountId: string): Promise<SavedCredentialPasswordResult> {
  if (!isDesktopCredentialVaultAvailable()) {
    return { status: "unsupported", reason: "desktop_credential_vault_unavailable" };
  }

  try {
    const vault = window.orfDesktopCredentials;
    const result = await vault?.getPassword?.(accountId);
    if (result?.status === "success" && typeof result.data?.password === "string") {
      return { password: result.data.password, status: "success" };
    }
    return { status: result?.status ?? "error", reason: result?.reason ?? "desktop_credential_vault_failed" };
  } catch {
    return { status: "error", reason: "desktop_credential_vault_failed" };
  }
}

export function findSavedCredentialAccountByEmail(accounts: SavedCredentialAccount[], email: string) {
  const normalizedEmail = normalizeSavedCredentialEmail(email);
  return accounts.find((account) => account.email === normalizedEmail) ?? null;
}

export function savedCredentialAccountInitial(account: SavedCredentialAccount) {
  return (account.displayName || account.email).trim().charAt(0).toUpperCase() || "O";
}

function isDesktopCredentialVaultAvailable() {
  return typeof window !== "undefined" && Boolean(window.orfDesktopCredentials);
}

async function listDesktopCredentialAccounts(): Promise<SavedCredentialAccountsResult> {
  try {
    const result = await window.orfDesktopCredentials?.listAccounts?.();
    return {
      accounts: normalizeSavedCredentialAccounts(result?.data?.accounts),
      provider: "desktop",
      reason: result?.reason,
      status: result?.status ?? "error",
    };
  } catch {
    return { accounts: [], provider: "desktop", reason: "desktop_credential_vault_failed", status: "error" };
  }
}

async function saveDesktopCredentialAccount(input: { displayName?: string; email: string; password: string }): Promise<SavedCredentialAccountsResult> {
  try {
    const result = await window.orfDesktopCredentials?.saveAccount?.(input);
    return {
      accounts: normalizeSavedCredentialAccounts(result?.data?.accounts),
      provider: "desktop",
      reason: result?.reason,
      status: result?.status ?? "error",
    };
  } catch {
    return { accounts: [], provider: "desktop", reason: "desktop_credential_vault_failed", status: "error" };
  }
}

async function deleteDesktopCredentialAccount(accountId: string): Promise<SavedCredentialAccountsResult> {
  try {
    const result = await window.orfDesktopCredentials?.deleteAccount?.(accountId);
    return {
      accounts: normalizeSavedCredentialAccounts(result?.data?.accounts),
      provider: "desktop",
      reason: result?.reason,
      status: result?.status ?? "error",
    };
  } catch {
    return { accounts: [], provider: "desktop", reason: "desktop_credential_vault_failed", status: "error" };
  }
}

async function migrateLegacySavedLoginAccountsToDesktopVault() {
  const legacyAccounts = loadLegacySavedLoginAccounts();
  if (legacyAccounts.length === 0) return;

  for (const account of legacyAccounts) {
    const result = await saveDesktopCredentialAccount({
      displayName: account.displayName,
      email: account.email,
      password: account.password,
    });
    if (result.status !== "success") return;
  }

  clearLegacySavedLoginAccounts();
}

function loadLegacySavedLoginAccounts(): LegacySavedLoginAccount[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(legacySavedLoginAccountsKey) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(toLegacySavedLoginAccount)
      .filter((account): account is LegacySavedLoginAccount => Boolean(account))
      .sort((first, second) => Date.parse(second.updatedAt) - Date.parse(first.updatedAt))
      .slice(0, maxSavedCredentialAccounts);
  } catch {
    return [];
  }
}

function clearLegacySavedLoginAccounts() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(legacySavedLoginAccountsKey);
}

async function storeBrowserPasswordCredential(input: { displayName?: string; email: string; password: string }) {
  if (typeof window === "undefined") {
    return { status: "unsupported" as const, reason: "browser_credential_api_unavailable" };
  }

  const PasswordCredential = window.PasswordCredential;
  const credentials = (navigator as BrowserCredentialNavigator).credentials;
  if (typeof PasswordCredential !== "function" || typeof credentials?.store !== "function") {
    return { status: "unsupported" as const, reason: "browser_credential_api_unavailable" };
  }

  try {
    const credential = new PasswordCredential({
      id: normalizeSavedCredentialEmail(input.email),
      name: cleanSavedCredentialText(input.displayName) ?? normalizeSavedCredentialEmail(input.email),
      password: input.password,
    });
    await credentials.store(credential);
    return { status: "success" as const };
  } catch {
    return { status: "error" as const, reason: "browser_credential_api_failed" };
  }
}

function normalizeSavedCredentialAccounts(accounts: unknown): SavedCredentialAccount[] {
  if (!Array.isArray(accounts)) return [];
  return accounts
    .map(toSavedCredentialAccount)
    .filter((account): account is SavedCredentialAccount => Boolean(account))
    .sort((first, second) => Date.parse(second.updatedAt) - Date.parse(first.updatedAt))
    .slice(0, maxSavedCredentialAccounts);
}

function toSavedCredentialAccount(value: unknown): SavedCredentialAccount | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<SavedCredentialAccount>;
  const email = normalizeSavedCredentialEmail(item.email ?? "");
  if (!email) return null;
  return {
    displayName: cleanSavedCredentialText(item.displayName),
    email,
    id: savedCredentialAccountId(email),
    updatedAt: validIsoDate(item.updatedAt) ?? new Date(0).toISOString(),
  };
}

function toLegacySavedLoginAccount(value: unknown): LegacySavedLoginAccount | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<LegacySavedLoginAccount>;
  const account = toSavedCredentialAccount(item);
  const password = typeof item.password === "string" ? item.password : "";
  if (!account || !password) return null;
  return { ...account, password };
}

function savedCredentialAccountId(email: string) {
  return normalizeSavedCredentialEmail(email);
}

function normalizeSavedCredentialEmail(email: string) {
  return email.trim().toLowerCase();
}

function cleanSavedCredentialText(value: string | undefined) {
  const text = value?.trim();
  return text || undefined;
}

function validIsoDate(value: string | undefined) {
  if (!value) return null;
  return Number.isNaN(Date.parse(value)) ? null : value;
}
