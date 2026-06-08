export type SavedLoginAccount = {
  displayName?: string;
  email: string;
  id: string;
  password: string;
  updatedAt: string;
};

const savedLoginAccountsKey = "orf.auth.savedLoginAccounts.v1";
const maxSavedLoginAccounts = 10;

export function loadSavedLoginAccounts(): SavedLoginAccount[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(savedLoginAccountsKey) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(toSavedLoginAccount)
      .filter((account): account is SavedLoginAccount => Boolean(account))
      .sort((first, second) => Date.parse(second.updatedAt) - Date.parse(first.updatedAt))
      .slice(0, maxSavedLoginAccounts);
  } catch {
    return [];
  }
}

export function upsertSavedLoginAccount(input: { displayName?: string; email: string; password: string }) {
  const email = normalizeSavedLoginEmail(input.email);
  if (!email || !input.password) return loadSavedLoginAccounts();

  const accounts = loadSavedLoginAccounts();
  const previous = accounts.find((account) => account.email === email);
  const existing = accounts.filter((account) => account.email !== email);
  const account: SavedLoginAccount = {
    displayName: cleanSavedLoginText(input.displayName) ?? previous?.displayName,
    email,
    id: savedLoginAccountId(email),
    password: input.password,
    updatedAt: new Date().toISOString(),
  };
  const next = [account, ...existing].slice(0, maxSavedLoginAccounts);
  writeSavedLoginAccounts(next);
  return next;
}

export function removeSavedLoginAccount(accountId: string) {
  const next = loadSavedLoginAccounts().filter((account) => account.id !== accountId);
  writeSavedLoginAccounts(next);
  return next;
}

export function removeSavedLoginAccountByEmail(email: string) {
  return removeSavedLoginAccount(savedLoginAccountId(email));
}

export function findSavedLoginAccountByEmail(accounts: SavedLoginAccount[], email: string) {
  const normalizedEmail = normalizeSavedLoginEmail(email);
  return accounts.find((account) => account.email === normalizedEmail) ?? null;
}

export function savedLoginAccountInitial(account: SavedLoginAccount) {
  return (account.displayName || account.email).trim().charAt(0).toUpperCase() || "O";
}

function toSavedLoginAccount(value: unknown): SavedLoginAccount | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<SavedLoginAccount>;
  const email = normalizeSavedLoginEmail(item.email ?? "");
  const password = typeof item.password === "string" ? item.password : "";
  if (!email || !password) return null;
  return {
    displayName: cleanSavedLoginText(item.displayName),
    email,
    id: savedLoginAccountId(email),
    password,
    updatedAt: validIsoDate(item.updatedAt) ?? new Date(0).toISOString(),
  };
}

function writeSavedLoginAccounts(accounts: SavedLoginAccount[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(savedLoginAccountsKey, JSON.stringify(accounts));
}

function savedLoginAccountId(email: string) {
  return normalizeSavedLoginEmail(email);
}

function normalizeSavedLoginEmail(email: string) {
  return email.trim().toLowerCase();
}

function cleanSavedLoginText(value: string | undefined) {
  const text = value?.trim();
  return text || undefined;
}

function validIsoDate(value: string | undefined) {
  if (!value) return null;
  return Number.isNaN(Date.parse(value)) ? null : value;
}
