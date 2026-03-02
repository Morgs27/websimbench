import {
  DOCS_CURRENT_VERSION,
  DOCS_LATEST_VERSION,
  DOCS_VERSION_OPTIONS,
  type DocsVersionOption,
} from "@/config/version";
import { docsV010 } from "./v0.1.0";
import { docsV011 } from "./v0.1.1";
import { docsV012 } from "./v0.1.2";
import { docsV013 } from "./v0.1.3";
import { docsV014 } from "./v0.1.4";
import type { DocsPage, DocsVersion } from "./types";

const versionMap: Record<string, DocsVersion> = {
  [docsV014.id]: docsV014,
  [docsV013.id]: docsV013,
  [docsV012.id]: docsV012,
  [docsV011.id]: docsV011,
  [docsV010.id]: docsV010,
};

const aliasMap: Partial<Record<DocsVersionOption, DocsVersion["id"]>> = {
  [DOCS_LATEST_VERSION]: DOCS_CURRENT_VERSION,
};

export const getDocsVersion = (
  requestedVersion: string | undefined,
): DocsVersion => {
  const key =
    requestedVersion && requestedVersion in aliasMap
      ? aliasMap[requestedVersion as DocsVersionOption]
      : requestedVersion;

  if (key && key in versionMap) {
    return versionMap[key];
  }

  return versionMap[DOCS_CURRENT_VERSION];
};

export const resolveDocsVersionLabel = (
  requestedVersion: string | undefined,
): DocsVersionOption => {
  if (!requestedVersion) {
    return DOCS_LATEST_VERSION;
  }

  if (requestedVersion in aliasMap) {
    return requestedVersion as DocsVersionOption;
  }

  // Check if it's a known version string (e.g. "v0.1.0")
  if (requestedVersion in versionMap) {
    return requestedVersion as DocsVersionOption;
  }

  return DOCS_LATEST_VERSION;
};

export const findDocsPage = (
  docsVersion: DocsVersion,
  pageId: string | undefined,
): DocsPage => {
  if (pageId) {
    const found = docsVersion.pages.find((page) => page.id === pageId);
    if (found) {
      return found;
    }
  }

  return docsVersion.pages[0];
};

export const getAvailableDocsVersions = (): DocsVersionOption[] => [
  ...DOCS_VERSION_OPTIONS,
];
