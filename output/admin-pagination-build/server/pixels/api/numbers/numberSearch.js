"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NUMBER_PATTERN_PRESETS = void 0;
exports.normalizeStructuredSearch = normalizeStructuredSearch;
exports.validatePrice = validatePrice;
exports.compileStructuredSearch = compileStructuredSearch;
exports.sanitizeAiFilters = sanitizeAiFilters;
exports.NUMBER_PATTERN_PRESETS = [
    'double',
    'triple',
    'tetra',
    'penta',
    'hexa',
    'counting',
    'doubling',
    'abc_abc',
    'ab_ab',
    'mirror',
    'semi_mirror',
];
const DIGITS_SQL = 'REPLACE(n.number_value, " ", "")';
function optionalDigits(value, label) {
    if (value === undefined || value === null || value === '')
        return undefined;
    const digits = String(value).replace(/\s+/g, '');
    if (!/^\d{1,10}$/.test(digits)) {
        throw new Error(`${label} must contain 1 to 10 digits.`);
    }
    return digits;
}
function optionalInteger(value, label, minimum, maximum) {
    if (value === undefined || value === null || value === '')
        return undefined;
    const number = Number(value);
    if (!Number.isInteger(number) || number < minimum || number > maximum) {
        throw new Error(`${label} must be an integer from ${minimum} to ${maximum}.`);
    }
    return number;
}
function optionalPattern(value, label) {
    if (value === undefined || value === null || value === '')
        return undefined;
    const normalized = String(value).trim().toLowerCase().replace(/[\s-]+/g, '_');
    if (!exports.NUMBER_PATTERN_PRESETS.includes(normalized)) {
        throw new Error(`${label} is not a supported pattern preset.`);
    }
    return normalized;
}
function digitArray(value, label) {
    if (value === undefined || value === null || value === '')
        return undefined;
    if (!Array.isArray(value))
        throw new Error(`${label} must be an array.`);
    if (value.length > 10)
        throw new Error(`${label} supports at most 10 entries.`);
    const normalized = value
        .map((entry, index) => optionalDigits(entry, `${label} entry ${index + 1}`))
        .filter((entry) => Boolean(entry));
    return normalized.length ? normalized : undefined;
}
function normalizeFrequencies(value) {
    if (value === undefined || value === null || value === '')
        return undefined;
    if (!Array.isArray(value))
        throw new Error('digit_frequencies must be an array.');
    if (value.length > 10)
        throw new Error('digit_frequencies supports at most 10 groups.');
    const seen = new Set();
    const frequencies = value.map((entry, index) => {
        if (!entry || typeof entry !== 'object') {
            throw new Error(`Frequency group ${index + 1} is invalid.`);
        }
        const digit = optionalInteger(entry.digit, `Frequency digit ${index + 1}`, 0, 9);
        if (digit === undefined)
            throw new Error(`Frequency digit ${index + 1} is required.`);
        if (seen.has(digit))
            throw new Error(`Frequency digit ${digit} can only be used once.`);
        seen.add(digit);
        const min = optionalInteger(entry.min, `Minimum count for digit ${digit}`, 1, 10);
        const max = optionalInteger(entry.max, `Maximum count for digit ${digit}`, 1, 10);
        if (min === undefined && max === undefined) {
            throw new Error(`Frequency digit ${digit} needs a minimum or maximum count.`);
        }
        if (min !== undefined && max !== undefined && min > max) {
            throw new Error(`Minimum count for digit ${digit} cannot exceed its maximum.`);
        }
        return Object.assign(Object.assign({ digit }, (min !== undefined ? { min } : {})), (max !== undefined ? { max } : {}));
    });
    return frequencies.length ? frequencies : undefined;
}
function normalizeStructuredSearch(raw) {
    if (raw === undefined || raw === null || raw === '')
        return {};
    if (typeof raw !== 'object' || Array.isArray(raw))
        throw new Error('search must be an object.');
    const input = raw;
    const startsWith = optionalDigits(input.starts_with, 'starts_with');
    const startsPattern = optionalPattern(input.starts_with_pattern, 'starts_with_pattern');
    const endsWith = optionalDigits(input.ends_with, 'ends_with');
    const endsPattern = optionalPattern(input.ends_with_pattern, 'ends_with_pattern');
    if (startsWith && startsPattern) {
        throw new Error('Choose either starts_with or starts_with_pattern, not both.');
    }
    if (endsWith && endsPattern) {
        throw new Error('Choose either ends_with or ends_with_pattern, not both.');
    }
    let exactMask;
    if (input.exact_mask !== undefined && input.exact_mask !== null && input.exact_mask !== '') {
        exactMask = String(input.exact_mask).replace(/\s+/g, '');
        if (!/^[\d?]{10}$/.test(exactMask)) {
            throw new Error('exact_mask must contain exactly 10 digits or ? wildcards.');
        }
    }
    return Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign({}, (startsWith ? { starts_with: startsWith } : {})), (startsPattern ? { starts_with_pattern: startsPattern } : {})), (optionalDigits(input.anywhere, 'anywhere') ? { anywhere: optionalDigits(input.anywhere, 'anywhere') } : {})), (endsWith ? { ends_with: endsWith } : {})), (endsPattern ? { ends_with_pattern: endsPattern } : {})), (digitArray(input.must_contain, 'must_contain') ? { must_contain: digitArray(input.must_contain, 'must_contain') } : {})), (digitArray(input.must_not_contain, 'must_not_contain') ? { must_not_contain: digitArray(input.must_not_contain, 'must_not_contain') } : {})), (optionalInteger(input.digit_sum, 'digit_sum', 0, 90) !== undefined
        ? { digit_sum: optionalInteger(input.digit_sum, 'digit_sum', 0, 90) } : {})), (optionalInteger(input.mid_sum, 'mid_sum', 0, 17) !== undefined
        ? { mid_sum: optionalInteger(input.mid_sum, 'mid_sum', 0, 17) } : {})), (optionalInteger(input.score_sum, 'score_sum', 1, 9) !== undefined
        ? { score_sum: optionalInteger(input.score_sum, 'score_sum', 1, 9) } : {})), (exactMask ? { exact_mask: exactMask } : {})), (normalizeFrequencies(input.digit_frequencies)
        ? { digit_frequencies: normalizeFrequencies(input.digit_frequencies) } : {})), (input.include_alternatives === true ? { include_alternatives: true } : {}));
}
function validatePrice(value, label) {
    if (value === undefined || value === null || value === '')
        return undefined;
    const price = Number(value);
    if (!Number.isFinite(price) || price < 0 || price > 1000000) {
        throw new Error(`${label} must be from ₹0 to ₹10,00,000.`);
    }
    return price;
}
function digitSumSql() {
    return Array.from({ length: 10 }, (_, index) => `CAST(SUBSTRING(${DIGITS_SQL}, ${index + 1}, 1) AS UNSIGNED)`).join(' + ');
}
function anchoredSubstring(edge, length) {
    return edge === 'start'
        ? `LEFT(${DIGITS_SQL}, ${length})`
        : `RIGHT(${DIGITS_SQL}, ${length})`;
}
function compilePattern(pattern, edge) {
    const startAt = (length) => edge === 'start' ? 1 : 11 - length;
    const char = (position) => `SUBSTRING(${DIGITS_SQL}, ${position}, 1)`;
    const repeated = (length) => {
        const start = startAt(length);
        return Array.from({ length: length - 1 }, (_, index) => `${char(start)} = ${char(start + index + 1)}`).join(' AND ');
    };
    if (pattern === 'double')
        return repeated(2);
    if (pattern === 'triple')
        return repeated(3);
    if (pattern === 'tetra')
        return repeated(4);
    if (pattern === 'penta')
        return repeated(5);
    if (pattern === 'hexa')
        return repeated(6);
    if (pattern === 'abc_abc') {
        const start = startAt(6);
        return `SUBSTRING(${DIGITS_SQL}, ${start}, 3) = SUBSTRING(${DIGITS_SQL}, ${start + 3}, 3)`;
    }
    if (pattern === 'ab_ab') {
        const start = startAt(4);
        return `SUBSTRING(${DIGITS_SQL}, ${start}, 2) = SUBSTRING(${DIGITS_SQL}, ${start + 2}, 2)`;
    }
    if (pattern === 'doubling') {
        const start = startAt(6);
        return [
            `${char(start)} = ${char(start + 1)}`,
            `${char(start + 2)} = ${char(start + 3)}`,
            `${char(start + 4)} = ${char(start + 5)}`,
        ].join(' AND ');
    }
    if (pattern === 'counting') {
        return `${anchoredSubstring(edge, 3)} IN (${Array.from({ length: 16 }, () => '?').join(', ')})`;
    }
    if (pattern === 'mirror') {
        return `(${DIGITS_SQL} = REVERSE(${DIGITS_SQL}) OR LEFT(${DIGITS_SQL}, 5) = RIGHT(${DIGITS_SQL}, 5))`;
    }
    return edge === 'start'
        ? `LOCATE(LEFT(${DIGITS_SQL}, 4), SUBSTRING(${DIGITS_SQL}, 5)) > 0`
        : `LOCATE(RIGHT(${DIGITS_SQL}, 4), LEFT(${DIGITS_SQL}, 6)) > 0`;
}
const COUNTING_SEQUENCES = [
    '012', '123', '234', '345', '456', '567', '678', '789',
    '987', '876', '765', '654', '543', '432', '321', '210',
];
function compileStructuredSearch(raw) {
    const search = normalizeStructuredSearch(raw);
    const where = [];
    const params = [];
    if (search.starts_with) {
        where.push(`${DIGITS_SQL} LIKE ?`);
        params.push(`${search.starts_with}%`);
    }
    if (search.starts_with_pattern) {
        where.push(`(${compilePattern(search.starts_with_pattern, 'start')})`);
        if (search.starts_with_pattern === 'counting')
            params.push(...COUNTING_SEQUENCES);
    }
    if (search.anywhere) {
        where.push(`${DIGITS_SQL} LIKE ?`);
        params.push(`%${search.anywhere}%`);
    }
    if (search.ends_with) {
        where.push(`${DIGITS_SQL} LIKE ?`);
        params.push(`%${search.ends_with}`);
    }
    if (search.ends_with_pattern) {
        where.push(`(${compilePattern(search.ends_with_pattern, 'end')})`);
        if (search.ends_with_pattern === 'counting')
            params.push(...COUNTING_SEQUENCES);
    }
    (search.must_contain || []).forEach((value) => {
        where.push(`${DIGITS_SQL} LIKE ?`);
        params.push(`%${value}%`);
    });
    (search.must_not_contain || []).forEach((value) => {
        where.push(`${DIGITS_SQL} NOT LIKE ?`);
        params.push(`%${value}%`);
    });
    const sumSql = digitSumSql();
    if (search.digit_sum !== undefined) {
        where.push(`(${sumSql}) = ?`);
        params.push(search.digit_sum);
    }
    if (search.mid_sum !== undefined) {
        where.push(`(FLOOR((${sumSql}) / 10) + MOD((${sumSql}), 10)) = ?`);
        params.push(search.mid_sum);
    }
    if (search.score_sum !== undefined) {
        where.push(`(CASE WHEN (${sumSql}) = 0 THEN 0 ELSE 1 + MOD((${sumSql}) - 1, 9) END) = ?`);
        params.push(search.score_sum);
    }
    if (search.exact_mask) {
        where.push(`${DIGITS_SQL} LIKE ?`);
        params.push(search.exact_mask.replace(/\?/g, '_'));
    }
    (search.digit_frequencies || []).forEach((frequency) => {
        const frequencySql = `(CHAR_LENGTH(${DIGITS_SQL}) - CHAR_LENGTH(REPLACE(${DIGITS_SQL}, ?, "")))`;
        if (frequency.min !== undefined) {
            where.push(`${frequencySql} >= ?`);
            params.push(String(frequency.digit), frequency.min);
        }
        if (frequency.max !== undefined) {
            where.push(`${frequencySql} <= ?`);
            params.push(String(frequency.digit), frequency.max);
        }
    });
    return { where, params, search };
}
function sanitizeAiFilters(raw) {
    const parsed = raw && typeof raw === 'object' && !Array.isArray(raw)
        ? raw
        : {};
    const allowedSort = ['newest', 'price_asc', 'price_desc', 'discount', 'popular'];
    const allowedBadge = ['NONE', 'TRENDING', 'RARE', 'EXCLUSIVE', 'PREMIUM'];
    const sort = allowedSort.includes(String(parsed.sort)) ? String(parsed.sort) : 'popular';
    const priceMin = validatePrice(parsed.price_min, 'price_min');
    const priceMax = validatePrice(parsed.price_max, 'price_max');
    if (priceMin !== undefined && priceMax !== undefined && priceMin > priceMax) {
        throw new Error('price_min cannot exceed price_max.');
    }
    const search = normalizeStructuredSearch(parsed.search || {});
    return Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign({}, (parsed.q && /^\d{1,10}$/.test(String(parsed.q).replace(/\s+/g, ''))
        ? { q: String(parsed.q).replace(/\s+/g, '') } : {})), (parsed.category ? { category: String(parsed.category) } : {})), (parsed.numerology && Number(parsed.numerology) >= 1 && Number(parsed.numerology) <= 9
        ? { numerology: Number(parsed.numerology) } : {})), (priceMin !== undefined ? { price_min: priceMin } : {})), (priceMax !== undefined ? { price_max: priceMax } : {})), (parsed.operator && /^[\w -]{1,20}$/.test(String(parsed.operator))
        ? { operator: String(parsed.operator) } : {})), (allowedBadge.includes(String(parsed.badge).toUpperCase())
        ? { badge: String(parsed.badge).toUpperCase() } : {})), (Object.keys(search).length ? { search } : {})), { sort, limit: 12 });
}
//# sourceMappingURL=numberSearch.js.map