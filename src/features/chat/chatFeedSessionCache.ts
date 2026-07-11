import type { ChatFeedSnapshot } from "./chatModels";

let feedSnapshots = new Map<string, ChatFeedSnapshot>();
let prefetchRequests = new Map<string, Promise<boolean>>();

export function chatFeedSessionSnapshots() {
  return feedSnapshots;
}

export function chatFeedSessionPrefetchRequests() {
  return prefetchRequests;
}

export function clearChatFeedSessionCache() {
  feedSnapshots = new Map<string, ChatFeedSnapshot>();
  prefetchRequests = new Map<string, Promise<boolean>>();
}
