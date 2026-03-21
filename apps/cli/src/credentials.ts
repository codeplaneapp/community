import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const SERVICE_NAME = "codeplane-cli";

interface CredentialStoreBackend {
  delete(host: string): boolean;
  get(host: string): string | null;
  set(host: string, token: string): void;
}

export class SecureStorageUnavailableError extends Error {
  constructor(message = "Secure credential storage is unavailable on this system.") {
    super(message);
    this.name = "SecureStorageUnavailableError";
  }
}

function normalizeHost(host: string): string {
  const normalized = host.trim().toLowerCase();
  if (!normalized) {
    throw new Error("Hostname is required for credential storage.");
  }
  return normalized;
}

function readTestStore(path: string): Record<string, string> {
  if (!existsSync(path)) {
    return {};
  }

  const raw = readFileSync(path, "utf8").trim();
  if (!raw) {
    return {};
  }

  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Invalid credential store file: ${path}`);
  }

  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value === "string") {
      result[key] = value;
    }
  }
  return result;
}

function writeTestStore(path: string, data: Record<string, string>): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
}

function isCredentialMissingMessage(text: string): boolean {
  return /could not be found|not found|item not found|cannot find/i.test(text);
}

function exitStatus(error: unknown): number | null {
  if (!error || typeof error !== "object" || !("status" in error)) {
    return null;
  }
  return typeof error.status === "number" ? error.status : null;
}

function isMissingCredentialError(error: unknown): boolean {
  const status = exitStatus(error);
  if (status === 44) {
    return true;
  }
  return isCredentialMissingMessage(toErrorText(error));
}

function toErrorText(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error);
  }

  const stderr =
    "stderr" in error && typeof error.stderr === "string"
      ? error.stderr
      : "stderr" in error && error.stderr instanceof Uint8Array
        ? Buffer.from(error.stderr).toString("utf8")
        : "";
  const stdout =
    "stdout" in error && typeof error.stdout === "string"
      ? error.stdout
      : "stdout" in error && error.stdout instanceof Uint8Array
        ? Buffer.from(error.stdout).toString("utf8")
        : "";

  return [stderr, stdout, error.message].filter(Boolean).join("\n");
}

function testFileBackend(path: string): CredentialStoreBackend {
  return {
    delete(host) {
      const data = readTestStore(path);
      const existed = Object.hasOwn(data, host);
      if (existed) {
        delete data[host];
        writeTestStore(path, data);
      }
      return existed;
    },
    get(host) {
      const data = readTestStore(path);
      return data[host] ?? null;
    },
    set(host, token) {
      const data = readTestStore(path);
      data[host] = token;
      writeTestStore(path, data);
    },
  };
}

function macOSBackend(): CredentialStoreBackend | null {
  if (!Bun.which("security")) {
    return null;
  }

  return {
    delete(host) {
      try {
        execFileSync(
          "security",
          ["delete-generic-password", "-s", SERVICE_NAME, "-a", host],
          { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
        );
        return true;
      } catch (error) {
        if (isMissingCredentialError(error)) {
          return false;
        }
        throw new Error(`Failed to delete token from macOS Keychain: ${toErrorText(error)}`);
      }
    },
    get(host) {
      try {
        const output = execFileSync(
          "security",
          ["find-generic-password", "-s", SERVICE_NAME, "-a", host, "-w"],
          { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
        );
        return output.trim() || null;
      } catch (error) {
        if (isMissingCredentialError(error)) {
          return null;
        }
        throw new Error(`Failed to read token from macOS Keychain: ${toErrorText(error)}`);
      }
    },
    set(host, token) {
      try {
        execFileSync(
          "security",
          ["add-generic-password", "-U", "-s", SERVICE_NAME, "-a", host, "-w", token],
          { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
        );
      } catch (error) {
        throw new Error(`Failed to save token to macOS Keychain: ${toErrorText(error)}`);
      }
    },
  };
}

function linuxBackend(): CredentialStoreBackend | null {
  if (!Bun.which("secret-tool")) {
    return null;
  }

  return {
    delete(host) {
      try {
        execFileSync(
          "secret-tool",
          ["clear", "service", SERVICE_NAME, "host", host],
          { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
        );
        return true;
      } catch (error) {
        if (isMissingCredentialError(error)) {
          return false;
        }
        throw new Error(`Failed to delete token from Secret Service: ${toErrorText(error)}`);
      }
    },
    get(host) {
      try {
        const output = execFileSync(
          "secret-tool",
          ["lookup", "service", SERVICE_NAME, "host", host],
          { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
        );
        return output.trim() || null;
      } catch (error) {
        if (isMissingCredentialError(error)) {
          return null;
        }
        throw new Error(`Failed to read token from Secret Service: ${toErrorText(error)}`);
      }
    },
    set(host, token) {
      try {
        execFileSync(
          "secret-tool",
          ["store", "--label=Codeplane CLI token", "service", SERVICE_NAME, "host", host],
          {
            encoding: "utf8",
            input: token,
            stdio: ["pipe", "pipe", "pipe"],
          },
        );
      } catch (error) {
        throw new Error(`Failed to save token to Secret Service: ${toErrorText(error)}`);
      }
    },
  };
}

function windowsBackend(): CredentialStoreBackend | null {
  const shell = Bun.which("pwsh") ?? Bun.which("powershell");
  if (!shell) {
    return null;
  }
  const shellPath = shell;

  const common = [
    "[Windows.Security.Credentials.PasswordVault, Windows.Security.Credentials, ContentType=WindowsRuntime] > $null",
    "$vault = New-Object Windows.Security.Credentials.PasswordVault",
  ].join("; ");

  function run(script: string, env: Record<string, string>): string {
    return execFileSync(
      shellPath,
      ["-NoProfile", "-NonInteractive", "-Command", `${common}; ${script}`],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          CODEPLANE_CRED_SERVICE: SERVICE_NAME,
          ...env,
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
  }

  return {
    delete(host) {
      try {
        run(
          [
            "$cred = $vault.Retrieve($env:CODEPLANE_CRED_SERVICE, $env:CODEPLANE_CRED_HOST)",
            "$vault.Remove($cred)",
          ].join("; "),
          { CODEPLANE_CRED_HOST: host },
        );
        return true;
      } catch (error) {
        if (isMissingCredentialError(error)) {
          return false;
        }
        throw new Error(`Failed to delete token from Windows Credential Locker: ${toErrorText(error)}`);
      }
    },
    get(host) {
      try {
        const output = run(
          [
            "$cred = $vault.Retrieve($env:CODEPLANE_CRED_SERVICE, $env:CODEPLANE_CRED_HOST)",
            "$cred.RetrievePassword()",
            "[Console]::Out.Write($cred.Password)",
          ].join("; "),
          { CODEPLANE_CRED_HOST: host },
        );
        return output.trim() || null;
      } catch (error) {
        if (isMissingCredentialError(error)) {
          return null;
        }
        throw new Error(`Failed to read token from Windows Credential Locker: ${toErrorText(error)}`);
      }
    },
    set(host, token) {
      try {
        run(
          [
            "try {",
            "  $existing = $vault.Retrieve($env:CODEPLANE_CRED_SERVICE, $env:CODEPLANE_CRED_HOST)",
            "  $vault.Remove($existing)",
            "} catch {}",
            "$cred = New-Object Windows.Security.Credentials.PasswordCredential(",
            "  $env:CODEPLANE_CRED_SERVICE,",
            "  $env:CODEPLANE_CRED_HOST,",
            "  $env:CODEPLANE_CRED_TOKEN",
            ")",
            "$vault.Add($cred)",
          ].join(" "),
          {
            CODEPLANE_CRED_HOST: host,
            CODEPLANE_CRED_TOKEN: token,
          },
        );
      } catch (error) {
        throw new Error(`Failed to save token to Windows Credential Locker: ${toErrorText(error)}`);
      }
    },
  };
}

function resolveBackend(): CredentialStoreBackend | null {
  const testStorePath = process.env.CODEPLANE_TEST_CREDENTIAL_STORE_FILE?.trim();
  if (testStorePath) {
    return testFileBackend(testStorePath);
  }

  if (process.env.CODEPLANE_DISABLE_SYSTEM_KEYRING === "1") {
    return null;
  }

  switch (process.platform) {
    case "darwin":
      return macOSBackend();
    case "linux":
      return linuxBackend();
    case "win32":
      return windowsBackend();
    default:
      return null;
  }
}

export function loadStoredToken(host: string): string | null {
  const backend = resolveBackend();
  if (!backend) {
    return null;
  }

  return backend.get(normalizeHost(host));
}

export function storeToken(host: string, token: string): void {
  const backend = resolveBackend();
  if (!backend) {
    throw new SecureStorageUnavailableError(
      "Secure credential storage is unavailable. Use CODEPLANE_TOKEN for headless or CI workflows.",
    );
  }

  backend.set(normalizeHost(host), token.trim());
}

export function deleteStoredToken(host: string): boolean {
  const backend = resolveBackend();
  if (!backend) {
    return false;
  }

  return backend.delete(normalizeHost(host));
}
