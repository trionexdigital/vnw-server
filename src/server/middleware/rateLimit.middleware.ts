import express, { Request, Response, NextFunction } from "express";

export const router = express.Router();

// A07: throttle credential endpoints to slow brute-force / credential stuffing.
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = 10;          // per IP per window per endpoint
const LIMITED_PATHS = ['/vipnumberworld/auth/login', '/vipnumberworld/auth/register', '/vipnumberworld/auth/forgot-request'];

const hits = new Map<string, { count: number; reset: number }>();

router.use((req: Request, res: Response, next: NextFunction) => {
    if (!LIMITED_PATHS.includes(req.path)) return next();

    const fwd = (req.headers['x-forwarded-for'] as string) || '';
    const ip = (fwd.split(',')[0] || req.ip || 'unknown').trim();
    const key = ip + ':' + req.path;
    const now = Date.now();

    const rec = hits.get(key);
    if (!rec || now > rec.reset) {
        hits.set(key, { count: 1, reset: now + WINDOW_MS });
        return next();
    }

    rec.count++;
    if (rec.count > MAX_ATTEMPTS) {
        return res.status(429).json({ status: -41, info: 'Too many attempts. Please try again in a few minutes.' });
    }
    next();
});

// Periodically purge expired buckets to bound memory.
setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (now > v.reset) hits.delete(k);
}, WINDOW_MS).unref?.();
