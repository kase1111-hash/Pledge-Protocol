/**
 * Outbound HTTP to URLs that users or admins supply (webhook and
 * integration deliveries, oracle API endpoints).
 *
 * A user who can make the server send requests to a URL of their choosing can
 * otherwise reach internal services (cloud metadata endpoints, databases,
 * admin panels) and, since delivery logs record responses, read them. So:
 *
 *  - only http(s) URLs without embedded credentials are accepted
 *  - the destination address is checked when the connection is made, after
 *    DNS resolution, so a hostname cannot pass validation and then resolve
 *    to a private address (DNS rebinding)
 *  - redirects are not followed
 *  - response bodies are capped
 *
 * Set ALLOW_PRIVATE_WEBHOOK_TARGETS=true to permit private and loopback
 * destinations, e.g. for local development.
 */

import http from "http";
import https from "https";
import dns from "dns";
import net from "net";
import type { LookupFunction } from "net";

/** Address ranges that are not reachable public internet hosts */
const blocked = new net.BlockList();
for (const [address, prefix] of [
  ["0.0.0.0", 8], // "this network"
  ["10.0.0.0", 8], // private
  ["100.64.0.0", 10], // carrier-grade NAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local, including cloud metadata (169.254.169.254)
  ["172.16.0.0", 12], // private
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.0.2.0", 24], // documentation
  ["192.88.99.0", 24], // 6to4 relay
  ["192.168.0.0", 16], // private
  ["198.18.0.0", 15], // benchmarking
  ["198.51.100.0", 24], // documentation
  ["203.0.113.0", 24], // documentation
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved, including broadcast
] as const) {
  blocked.addSubnet(address, prefix, "ipv4");
}
for (const [address, prefix] of [
  ["::", 128], // unspecified
  ["::1", 128], // loopback
  ["100::", 64], // discard
  ["2001:db8::", 32], // documentation
  ["fc00::", 7], // unique local
  ["fe80::", 10], // link-local
  ["ff00::", 8], // multicast
] as const) {
  blocked.addSubnet(address, prefix, "ipv6");
}

/**
 * The IPv4 address embedded in an IPv4-mapped (::ffff:a.b.c.d), IPv4-
 * compatible (::a.b.c.d) or NAT64 (64:ff9b::a.b.c.d) IPv6 address
 */
function embeddedIpv4(address: string): string | null {
  const lower = address.toLowerCase();
  const dotted = lower.match(/^(?:::ffff:|::|64:ff9b::)(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) return dotted[1];

  const hex = lower.match(/^(?:::ffff:|64:ff9b::)([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hex) {
    const high = parseInt(hex[1], 16);
    const low = parseInt(hex[2], 16);
    return [high >> 8, high & 255, low >> 8, low & 255].join(".");
  }
  return null;
}

/**
 * Whether an IP address is a public internet address
 */
export function isPublicAddress(address: string): boolean {
  const family = net.isIP(address);
  if (family === 4) {
    return !blocked.check(address, "ipv4");
  }
  if (family === 6) {
    const ipv4 = embeddedIpv4(address);
    if (ipv4) return isPublicAddress(ipv4);
    return !blocked.check(address, "ipv6");
  }
  return false;
}

function privateTargetsAllowed(): boolean {
  return process.env.ALLOW_PRIVATE_WEBHOOK_TARGETS === "true";
}

/**
 * Why a URL may not be used as a webhook target, or null if it may. Checks
 * what can be known without DNS; the resolved address is checked at connect
 * time.
 */
export function webhookUrlProblem(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return "Invalid URL";
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return "URL must use http or https";
  }
  if (url.username || url.password) {
    return "URL must not contain credentials";
  }

  if (!privateTargetsAllowed()) {
    // URL normalizes numeric forms (e.g. http://2130706433) to dotted IPv4
    const host = url.hostname.replace(/^\[|\]$/g, "");
    if (net.isIP(host) && !isPublicAddress(host)) {
      return "URL must not point to a private or reserved address";
    }
    if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) {
      return "URL must not point to a local host name";
    }
  }

  return null;
}

/**
 * DNS lookup that refuses non-public addresses. Rejects if any resolved
 * address is non-public, so the connection cannot land on an internal one.
 */
const publicOnlyLookup: LookupFunction = (hostname, options, callback) => {
  dns.lookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) {
      callback(error, "", 0);
      return;
    }
    const list = addresses as dns.LookupAddress[];
    const rejected = list.find((a) => !isPublicAddress(a.address));
    if (list.length === 0 || (rejected && !privateTargetsAllowed())) {
      const err = new Error(
        `Refusing to connect to ${hostname}: resolves to a non-public address`
      ) as NodeJS.ErrnoException;
      err.code = "EBLOCKEDADDRESS";
      callback(err, "", 0);
      return;
    }
    if ((options as dns.LookupOptions).all) {
      (callback as unknown as (err: null, addresses: dns.LookupAddress[]) => void)(null, list);
    } else {
      callback(null, list[0].address, list[0].family);
    }
  });
};

export interface OutboundResponse {
  status: number;
  /** Response body, truncated to maxResponseBytes */
  body: string;
}

export interface OutboundRequest {
  method?: "GET" | "HEAD" | "POST" | "PUT" | "PATCH" | "DELETE";
  headers?: Record<string, string>;
  body?: string;
  timeoutMs: number;
  maxResponseBytes?: number;
}

/** Headers callers may not set: they would desynchronize or redirect the request */
const RESERVED_HEADERS = new Set(["host", "content-length", "transfer-encoding", "connection"]);

/**
 * Send a request to a user-supplied URL with the protections described above
 */
export async function requestUserUrl(rawUrl: string, options: OutboundRequest): Promise<OutboundResponse> {
  const problem = webhookUrlProblem(rawUrl);
  if (problem) {
    throw new Error(problem);
  }

  const url = new URL(rawUrl);
  const client = url.protocol === "https:" ? https : http;
  const maxBytes = options.maxResponseBytes ?? 64 * 1024;
  const headers: Record<string, string | number> = Object.fromEntries(
    Object.entries(options.headers ?? {}).filter(([name]) => !RESERVED_HEADERS.has(name.toLowerCase()))
  );
  if (options.body !== undefined) {
    headers["Content-Length"] = Buffer.byteLength(options.body);
  }

  return new Promise<OutboundResponse>((resolve, reject) => {
    const request = client.request(
      url,
      {
        method: options.method ?? (options.body === undefined ? "GET" : "POST"),
        headers,
        lookup: publicOnlyLookup,
        timeout: options.timeoutMs,
        // A fresh connection per request: no pooled socket bypasses the lookup
        agent: false,
      },
      (response) => {
        const chunks: Buffer[] = [];
        let size = 0;
        response.on("data", (chunk: Buffer) => {
          if (size >= maxBytes) return;
          chunks.push(chunk.subarray(0, maxBytes - size));
          size += chunk.length;
          if (size >= maxBytes) {
            response.destroy();
            resolve({ status: response.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") });
          }
        });
        response.on("end", () =>
          resolve({ status: response.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") })
        );
        response.on("error", reject);
      }
    );

    request.on("timeout", () => request.destroy(new Error(`Request timed out after ${options.timeoutMs}ms`)));
    request.on("error", reject);
    request.end(options.body);
  });
}

/**
 * POST to a user-supplied URL with the protections described above
 */
export async function postToUserUrl(
  rawUrl: string,
  options: {
    headers: Record<string, string>;
    body: string;
    timeoutMs: number;
    maxResponseBytes?: number;
  }
): Promise<OutboundResponse> {
  return requestUserUrl(rawUrl, { ...options, method: "POST" });
}
