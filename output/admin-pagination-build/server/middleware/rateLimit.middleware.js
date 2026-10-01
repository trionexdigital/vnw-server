"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var _a, _b;
Object.defineProperty(exports, "__esModule", { value: true });
exports.router = void 0;
const express_1 = __importDefault(require("express"));
exports.router = express_1.default.Router();
// A07: throttle credential endpoints to slow brute-force / credential stuffing.
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = 10; // per IP per window per endpoint
const LIMITED_PATHS = ['/vipnumberworld/auth/login', '/vipnumberworld/auth/register', '/vipnumberworld/auth/forgot-request'];
const hits = new Map();
exports.router.use((req, res, next) => {
    if (!LIMITED_PATHS.includes(req.path))
        return next();
    const fwd = req.headers['x-forwarded-for'] || '';
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
(_b = (_a = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits)
        if (now > v.reset)
            hits.delete(k);
}, WINDOW_MS)).unref) === null || _b === void 0 ? void 0 : _b.call(_a);
//# sourceMappingURL=rateLimit.middleware.js.map