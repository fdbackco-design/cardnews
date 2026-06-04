import { Request, Response, NextFunction } from "express";
import { validateToken } from "../services/authService";

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = String(req.headers["authorization"] ?? "");
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (token && validateToken(token)) {
    next();
    return;
  }
  res.status(401).json({ error: "로그인이 필요합니다." });
}
