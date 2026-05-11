#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const DEFAULT_TIMEOUT_MS = 15_000;

const PROVIDERS = {
  modelark: {
    label: "BytePlus ModelArk / Volcengine Ark",
    keyEnvNames: ["ARK_API_KEY"],
    baseUrls: [
      "https://ark.ap-southeast.bytepluses.com/api/v3",
    ],
    endpoints: ["/models", "/models?page=1&limit=100"],
    authStrategies: [
      {
        label: "Authorization: Bearer",
        headers: (apiKey) => ({ Authorization: `Bearer ${apiKey}` }),
      },
    ],
  },
  seedanceapi: {
    label: "Seedance API REST",
    keyEnvNames: ["SEEDANCE_API_KEY"],
    baseUrls: [
      "https://seedanceapi.org",
    ],
    endpoints: [
      "/v2/models",
      "/v1/models",
      "/models",
      "/api/v2/models",
      "/api/v1/models",
    ],
    authStrategies: [
      {
        label: "Authorization: Bearer",
        headers: (apiKey) => ({ Authorization: `Bearer ${apiKey}` }),
      },
      {
        label: "X-API-Key",
        headers: (apiKey) => ({ "X-API-Key": apiKey }),
      },
    ],
  },
};

function usage() {
  return `
Usage:
  npm run probe:seedance
  npm run probe:seedance -- --provider modelark
  npm run probe:seedance -- --provider seedanceapi --base-url https://seedanceapi.org

Environment:
  SEEDANCE_API_KEY       Seedance-style API key.
  ARK_API_KEY            BytePlus/Volcengine ModelArk API key.
  SEEDANCE_PROVIDER      auto, modelark, or seedanceapi. Defaults to auto.
  SEEDANCE_BASE_URL      Optional API base URL override.
  SEEDANCE_KEY_ENV       Optional explicit key env name to read.
  SEEDANCE_PROBE_TIMEOUT_MS

Options:
  --provider <name>      auto, modelark, or seedanceapi.
  --base-url <url>       Try only this base URL.
  --key-env <name>       Read the API key from this env var.
  --include-failed       Print every failed probe attempt.
  --json                 Print machine-readable JSON.
  --timeout-ms <ms>      Per-request timeout. Defaults to 15000.

This probe only sends GET requests to model-list style endpoints. It does not call
video generation endpoints or create billable jobs. To avoid leaking credentials
to the wrong service, provider defaults use one host only; pass --base-url for
the exact API host shown in your provider dashboard.
`.trim();
}

function parseArgs(argv) {
  const args = {
    provider: process.env.SEEDANCE_PROVIDER || "auto",
    baseUrl: process.env.SEEDANCE_BASE_URL || "",
    keyEnvName: process.env.SEEDANCE_KEY_ENV || "",
    includeFailed: false,
    json: false,
    timeoutMs: Number(process.env.SEEDANCE_PROBE_TIMEOUT_MS || DEFAULT_TIMEOUT_MS),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const readValue = (name) => {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`${name} requires a value.`);
      }
      index += 1;
      return value;
    };

    if (arg === "--provider") {
      args.provider = readValue(arg);
    } else if (arg === "--base-url") {
      args.baseUrl = readValue(arg);
    } else if (arg === "--key-env") {
      args.keyEnvName = readValue(arg);
    } else if (arg === "--include-failed") {
      args.includeFailed = true;
    } else if (arg === "--json") {
      args.json = true;
    } else if (arg === "--timeout-ms") {
      args.timeoutMs = Number(readValue(arg));
    } else if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (!Number.isFinite(args.timeoutMs) || args.timeoutMs <= 0) {
    throw new Error("--timeout-ms must be a positive number.");
  }

  return args;
}

function parseEnvFile(filePath) {
  if (!existsSync(filePath)) {
    return {};
  }

  const parsed = {};
  const content = readFileSync(filePath, "utf8");

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) {
      continue;
    }

    const [, key, rawValue] = match;
    parsed[key] = stripEnvValue(rawValue);
  }

  return parsed;
}

function stripEnvValue(rawValue) {
  let value = rawValue.trim();
  const hashIndex = value.search(/\s+#/);
  if (hashIndex !== -1) {
    value = value.slice(0, hashIndex).trim();
  }

  const quote = value[0];
  if ((quote === "\"" || quote === "'") && value.endsWith(quote)) {
    value = value.slice(1, -1);
  }

  return value.replace(/\\n/g, "\n");
}

function loadLocalEnv() {
  const root = process.cwd();
  return {
    ...parseEnvFile(resolve(root, ".env")),
    ...parseEnvFile(resolve(root, ".env.local")),
  };
}

function getEnvValue(name, localEnv) {
  return process.env[name] || localEnv[name] || "";
}

function selectedProviders(providerName) {
  if (providerName === "auto") {
    return Object.keys(PROVIDERS);
  }

  if (!PROVIDERS[providerName]) {
    throw new Error(`Unsupported provider "${providerName}". Use auto, modelark, or seedanceapi.`);
  }

  return [providerName];
}

function resolveApiKey(provider, args, localEnv) {
  const envNames = args.keyEnvName ? [args.keyEnvName] : provider.keyEnvNames;

  for (const envName of envNames) {
    const value = getEnvValue(envName, localEnv);
    if (value) {
      return { envName, value };
    }
  }

  return { envName: envNames.join(" or "), value: "" };
}

function uniqueStrings(values) {
  return [...new Set(values.filter(Boolean))];
}

function joinUrl(baseUrl, endpoint) {
  const trimmedBase = baseUrl.replace(/\/+$/, "");
  const normalizedEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  return `${trimmedBase}${normalizedEndpoint}`;
}

async function fetchJson(url, headers, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        ...headers,
      },
      signal: controller.signal,
    });
    const text = await response.text();
    const body = parseJsonMaybe(text);

    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      body,
      snippet: body ? "" : compactSnippet(text),
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      statusText: error.name === "AbortError" ? "Timed out" : error.message,
      body: null,
      snippet: "",
    };
  } finally {
    clearTimeout(timeout);
  }
}

function parseJsonMaybe(text) {
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function compactSnippet(text) {
  return text.replace(/\s+/g, " ").trim().slice(0, 240);
}

function extractModels(value, path = "$", seen = new Set()) {
  if (value === null || value === undefined) {
    return [];
  }

  if (typeof value === "string") {
    return looksLikeModelPath(path) ? [{ id: value, path }] : [];
  }

  if (typeof value !== "object") {
    return [];
  }

  if (seen.has(value)) {
    return [];
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.flatMap((item, index) => {
      if (typeof item === "string") {
        return looksLikeModelPath(path) ? [{ id: item, path: `${path}[${index}]` }] : [];
      }

      if (item && typeof item === "object" && !Array.isArray(item)) {
        const model = modelFromObject(item, `${path}[${index}]`);
        const nested = extractModels(item, `${path}[${index}]`, seen);
        return model ? [model, ...nested] : nested;
      }

      return [];
    });
  }

  const direct = modelFromObject(value, path);
  const nested = Object.entries(value).flatMap(([key, child]) =>
    extractModels(child, `${path}.${key}`, seen),
  );

  return direct ? [direct, ...nested] : nested;
}

function looksLikeModelPath(path) {
  return /(^|\.)(data|items|models|model_list|modelList|results|endpoints)(\.|$|\[)/i.test(path);
}

function modelFromObject(object, path) {
  const id =
    object.id ||
    object.ID ||
    object.name ||
    object.Name ||
    object.model ||
    object.Model ||
    object.model_id ||
    object.modelId ||
    object.ModelId ||
    object.model_name ||
    object.modelName ||
    object.ModelName ||
    object.endpoint_id ||
    object.endpointId ||
    object.EndpointId;

  if (!id || typeof id !== "string") {
    return null;
  }

  if (!looksLikeModelPath(path) && !looksLikeModelId(id)) {
    return null;
  }

  return {
    id,
    owner: object.owned_by || object.owner || object.provider || object.vendor || "",
    created: object.created || object.created_at || object.CreateTime || "",
    path,
  };
}

function looksLikeModelId(value) {
  return /model|seed|dance|t2v|i2v|video|veo|ark|doubao|endpoint/i.test(value);
}

function dedupeModels(models) {
  const byId = new Map();
  for (const model of models) {
    if (!byId.has(model.id)) {
      byId.set(model.id, model);
    }
  }
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

async function probeProvider(providerName, args, localEnv) {
  const provider = PROVIDERS[providerName];
  const apiKey = resolveApiKey(provider, args, localEnv);
  const baseUrls = args.baseUrl ? [args.baseUrl] : provider.baseUrls;
  const attempts = [];

  if (!apiKey.value) {
    return {
      provider: providerName,
      label: provider.label,
      keyEnvName: apiKey.envName,
      missingKey: true,
      baseUrls,
      attempts,
      models: [],
    };
  }

  for (const baseUrl of baseUrls) {
    for (const endpoint of provider.endpoints) {
      for (const authStrategy of provider.authStrategies) {
        const url = joinUrl(baseUrl, endpoint);
        const response = await fetchJson(url, authStrategy.headers(apiKey.value), args.timeoutMs);
        const models = response.body ? dedupeModels(extractModels(response.body)) : [];
        const attempt = {
          provider: providerName,
          url,
          status: response.status,
          statusText: response.statusText,
          auth: authStrategy.label,
          models,
          bodyKeys: response.body && typeof response.body === "object"
            ? Object.keys(response.body).slice(0, 12)
            : [],
          snippet: response.snippet,
        };
        attempts.push(attempt);

        if (response.ok && models.length > 0) {
          return {
            provider: providerName,
            label: provider.label,
            keyEnvName: apiKey.envName,
            missingKey: false,
            baseUrls,
            attempts,
            winningAttempt: attempt,
            models,
          };
        }
      }
    }
  }

  return {
    provider: providerName,
    label: provider.label,
    keyEnvName: apiKey.envName,
    missingKey: false,
    baseUrls,
    attempts,
    models: [],
  };
}

function printTextReport(results, args) {
  console.log("Seedance model access probe");
  console.log("Only GET model-list probes were sent; no generation jobs were created.\n");

  for (const result of results) {
    console.log(`${result.models.length > 0 ? "[ok]" : "[miss]"} ${result.label}`);
    console.log(`  Key env: ${result.keyEnvName}${result.missingKey ? " (missing)" : ""}`);

    if (result.missingKey) {
      console.log("  Set the key env var, then run the probe again.\n");
      continue;
    }

    if (result.winningAttempt) {
      console.log(`  Endpoint: GET ${result.winningAttempt.url}`);
      console.log(`  Auth: ${result.winningAttempt.auth}`);
      console.log("  Models:");
      for (const model of result.models) {
        const suffix = model.owner ? ` (${model.owner})` : "";
        console.log(`    - ${model.id}${suffix}`);
      }
      console.log("");
      continue;
    }

    const statuses = uniqueStrings(
      result.attempts.map((attempt) =>
        attempt.status ? `${attempt.status} ${attempt.statusText}` : attempt.statusText,
      ),
    );
    console.log(`  No model-list endpoint returned model IDs.`);
    console.log(`  Attempt statuses: ${statuses.join(", ") || "none"}`);
    console.log("  Tip: pass --base-url if your dashboard gives a different API base URL.");

    if (args.includeFailed) {
      console.log("  Failed attempts:");
      for (const attempt of result.attempts) {
        const keys = attempt.bodyKeys.length ? ` keys=${attempt.bodyKeys.join(",")}` : "";
        const snippet = attempt.snippet ? ` snippet="${attempt.snippet}"` : "";
        console.log(`    - GET ${attempt.url} -> ${attempt.status || "-"} ${attempt.statusText}${keys}${snippet}`);
      }
    } else {
      console.log("  Rerun with --include-failed to see each URL that was checked.");
    }

    console.log("");
  }
}

async function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
      console.log(usage());
      return;
    }

    const providerNames = selectedProviders(args.provider);
    const localEnv = loadLocalEnv();
    const results = [];

    for (const providerName of providerNames) {
      results.push(await probeProvider(providerName, args, localEnv));
    }

    if (args.json) {
      console.log(JSON.stringify(results, null, 2));
    } else {
      printTextReport(results, args);
    }

    const hasModels = results.some((result) => result.models.length > 0);
    const allMissingKeys = results.every((result) => result.missingKey);
    process.exitCode = hasModels ? 0 : allMissingKeys ? 1 : 2;
  } catch (error) {
    console.error(error.message);
    console.error("");
    console.error(usage());
    process.exitCode = 1;
  }
}

await main();
