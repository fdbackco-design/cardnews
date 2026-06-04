import { Router, Request, Response } from "express";
import {
  checkCredentials,
  createToken,
  validateToken,
  revokeToken,
} from "../services/authService";

export const authRoutes = Router();

function extractToken(req: Request): string {
  const header = String(req.headers["authorization"] ?? "");
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

// POST /api/auth/login
authRoutes.post("/login", (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown>;
  const username = String(body["username"] ?? "").trim();
  const password = String(body["password"] ?? "").trim();

  if (checkCredentials(username, password)) {
    const token = createToken();
    res.json({ ok: true, token });
  } else {
    res.status(401).json({ ok: false, error: "아이디 또는 비밀번호가 올바르지 않습니다." });
  }
});

// POST /api/auth/logout
authRoutes.post("/logout", (req: Request, res: Response) => {
  const token = extractToken(req);
  if (token) revokeToken(token);
  res.json({ ok: true });
});

// GET /api/auth/status
authRoutes.get("/status", (req: Request, res: Response) => {
  const token = extractToken(req);
  res.json({ authenticated: token ? validateToken(token) : false });
});
