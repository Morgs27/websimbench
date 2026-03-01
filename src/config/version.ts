export const CURRENT_VERSION = "0.1.4";

export const APP_VERSION_LABEL = `v${CURRENT_VERSION}`;

export const PACKAGE_NAME = "@websimbench/agentyx";

export const DOCS_LATEST_VERSION = "latest" as const;
export const DOCS_CURRENT_VERSION = `v${CURRENT_VERSION}` as const;

export const DOCS_VERSION_HISTORY = [
  "v0.1.0",
  "v0.1.1",
  "v0.1.2",
  "v0.1.3",
  "v0.1.4",
] as const;

export const DOCS_VERSION_OPTIONS = [
  DOCS_LATEST_VERSION,
  ...[...DOCS_VERSION_HISTORY].reverse(),
] as const;

export type DocsVersionOption =
  | typeof DOCS_LATEST_VERSION
  | (typeof DOCS_VERSION_HISTORY)[number];

export const DOCS_DEFAULT_PAGE = "overview";
