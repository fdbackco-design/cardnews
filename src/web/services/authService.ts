import * as crypto from "crypto";

const ADMIN_USER = process.env["AUTH_USERNAME"] ?? "admin";
const ADMIN_PASS = process.env["AUTH_PASSWORD"] ?? "0703";

const validTokens = new Set<string>();

export function checkCredentials(username: string, password: string): boolean {
  return username === ADMIN_USER && password === ADMIN_PASS;
}

export function createToken(): string {
  const token = crypto.randomBytes(32).toString("hex");
  validTokens.add(token);
  return token;
}

export function validateToken(token: string): boolean {
  return validTokens.has(token);
}

export function revokeToken(token: string): void {
  validTokens.delete(token);
}
