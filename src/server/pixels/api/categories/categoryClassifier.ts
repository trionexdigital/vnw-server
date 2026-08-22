/**
 * Automatic VIP-number category classifier.
 *
 * This module is deliberately self-contained and deterministic: the storefront
 * never needs Numberwale (or any other third-party service) at runtime. Bump the
 * version whenever matcher semantics change so persisted category rows can be
 * rebuilt safely.
 */

export const CATEGORY_CLASSIFIER_VERSION = 2;
export const CLASSIFIER_VERSION = CATEGORY_CLASSIFIER_VERSION;

export const CATEGORY_SLUGS = [
    'without-248-numbers',
    'mirror-numbers',
    'semi-mirror-numbers',
    'two-digit-numbers',
    'three-digit-numbers',
    'counting-numbers',
    '786-numbers',
    '108-numbers',
    'doubling-numbers',
    'ab-ab-xy-xy-numbers',
    'ab-ab-ab-numbers',
    'start-ab-ab-numbers',
    'middle-ab-ab-numbers',
    'ending-ab-ab-numbers',
    'abc-abc-abc-numbers',
    'abc-abc-numbers',
    'aaa-bbb-numbers',
    'triple-numbers',
    'tetra-numbers',
    'penta-numbers',
    'hexa-numbers',
    'septa-numbers',
    'octa-numbers',
    'unique-numbers',
] as const;

export type CategorySlug = typeof CATEGORY_SLUGS[number];

export interface NumberCategory {
    slug: CategorySlug;
    name: string;
    description: string;
    icon: string;
    examples: readonly string[];
    aliases: readonly string[];
    /** Numberwale-style catalog order. */
    sortOrder: number;
    /** Lower values win after score and match-kind tie breaking. */
    priority: number;
}

/** Zero-based positions in the canonical ten-digit number. */
export interface NumberMatchSpan {
    start: number;
    end: number;
}

export interface NumberCategoryMatch extends NumberCategory {
    /** Digits that prove the selected category; start inclusive, end exclusive. */
    match_spans: NumberMatchSpan[];
}

export interface NumberClassification {
    canonicalNumber: string;
    categories: NumberCategoryMatch[];
    primaryCategory: NumberCategoryMatch;
    classifierVersion: number;
}

export interface NumberCategoryApiModel {
    slug: CategorySlug;
    name: string;
    description: string;
    icon: string;
    examples: readonly string[];
    aliases: readonly string[];
    sort_order: number;
    priority: number;
    match_spans?: NumberMatchSpan[];
}

export type NumberCategoryMatchApiModel = Omit<NumberCategoryApiModel, 'match_spans'> & {
    match_spans: NumberMatchSpan[];
};

const catalog: NumberCategory[] = [
    { slug: 'without-248-numbers', name: 'Without 248 Numbers (Numerology)', description: 'Numbers that contain none of the digits 2, 4, or 8.', icon: 'shield-check', examples: ['9653107539'], aliases: ['without-248', 'without-248-number'], sortOrder: 1, priority: 180 },
    { slug: 'mirror-numbers', name: 'Mirror Numbers', description: 'A palindrome or a number made from two identical five-digit halves.', icon: 'mirror', examples: ['7693976939'], aliases: ['mirror', 'mirror-number'], sortOrder: 2, priority: 20 },
    { slug: 'semi-mirror-numbers', name: 'Semi Mirror Numbers', description: 'A four-digit block that appears twice without overlapping.', icon: 'panels-top-left', examples: ['6005646005'], aliases: ['semi-mirror', 'semi-mirror-number'], sortOrder: 3, priority: 70 },
    { slug: 'two-digit-numbers', name: 'Two Digit Numbers', description: 'The complete number uses exactly two distinct digits.', icon: 'binary', examples: ['6969669699'], aliases: ['two-digit', '2-digit-numbers'], sortOrder: 4, priority: 160 },
    { slug: 'three-digit-numbers', name: 'Three Digit Numbers', description: 'The complete number uses exactly three distinct digits.', icon: 'digits', examples: ['9070907709'], aliases: ['three-digit', '3-digit-numbers'], sortOrder: 5, priority: 170 },
    { slug: 'counting-numbers', name: 'Counting Numbers', description: 'Contains three or more consecutive ascending or descending values.', icon: 'list-ordered', examples: ['6789123456', '9505152978'], aliases: ['counting', 'sequential-numbers'], sortOrder: 6, priority: 80 },
    { slug: '786-numbers', name: '786 Numbers', description: 'Contains the significant sequence 786.', icon: 'sparkles', examples: ['9178605032'], aliases: ['786', '786-number'], sortOrder: 7, priority: 100 },
    { slug: '108-numbers', name: '108 Numbers', description: 'Contains the significant sequence 108.', icon: 'sparkles', examples: ['9510873064'], aliases: ['108', '108-number'], sortOrder: 8, priority: 110 },
    { slug: 'doubling-numbers', name: 'Doubling Numbers', description: 'Contains three adjacent digit pairs such as AABBCC.', icon: 'copy', examples: ['9911223344'], aliases: ['doubling', 'double-numbers'], sortOrder: 9, priority: 90 },
    { slug: 'ab-ab-xy-xy-numbers', name: 'AB AB XY XY Numbers', description: 'Contains two different non-overlapping ABAB blocks.', icon: 'blocks', examples: ['9191878765'], aliases: ['ab-ab-xy-xy'], sortOrder: 10, priority: 30 },
    { slug: 'ab-ab-ab-numbers', name: 'AB AB AB Numbers', description: 'The same two-digit block occurs three times without overlapping.', icon: 'repeat-2', examples: ['9191912345'], aliases: ['ab-ab-ab'], sortOrder: 11, priority: 40 },
    { slug: 'start-ab-ab-numbers', name: 'Start AB AB Numbers', description: 'Starts with an ABAB block.', icon: 'align-start-horizontal', examples: ['9191406385'], aliases: ['start-ab-ab'], sortOrder: 12, priority: 50 },
    { slug: 'middle-ab-ab-numbers', name: 'Middle AB AB Numbers', description: 'Contains an internal ABAB block away from both ends.', icon: 'align-center-horizontal', examples: ['9060032323'], aliases: ['middle-ab-ab'], sortOrder: 13, priority: 50 },
    { slug: 'ending-ab-ab-numbers', name: 'Ending AB AB Numbers', description: 'Ends with an ABAB block.', icon: 'align-end-horizontal', examples: ['9060481010'], aliases: ['ending-ab-ab', 'end-ab-ab'], sortOrder: 14, priority: 50 },
    { slug: 'abc-abc-abc-numbers', name: 'ABC ABC ABC Numbers', description: 'The same three-digit block occurs three times without overlapping.', icon: 'repeat-2', examples: ['9129129123'], aliases: ['abc-abc-abc'], sortOrder: 15, priority: 35 },
    { slug: 'abc-abc-numbers', name: 'ABC ABC Numbers', description: 'The same three-digit block occurs twice without overlapping.', icon: 'repeat', examples: ['9129123456'], aliases: ['abc-abc'], sortOrder: 16, priority: 45 },
    { slug: 'aaa-bbb-numbers', name: 'AAA BBB Numbers', description: 'A run of one digit is followed by a run of a different digit.', icon: 'group', examples: ['9777666123'], aliases: ['aaa-bbb'], sortOrder: 17, priority: 60 },
    { slug: 'triple-numbers', name: 'Triple Numbers', description: 'Contains at least three identical consecutive digits.', icon: 'badge-3', examples: ['9006136333'], aliases: ['triple', 'tripple-numbers'], sortOrder: 18, priority: 17 },
    { slug: 'tetra-numbers', name: 'Tetra Numbers', description: 'Contains at least four identical consecutive digits.', icon: 'badge-4', examples: ['9777712345'], aliases: ['tetra', 'quad-numbers'], sortOrder: 19, priority: 16 },
    { slug: 'penta-numbers', name: 'Penta Numbers', description: 'Contains at least five identical consecutive digits.', icon: 'badge-5', examples: ['9777771234'], aliases: ['penta'], sortOrder: 20, priority: 15 },
    { slug: 'hexa-numbers', name: 'Hexa Numbers', description: 'Contains at least six identical consecutive digits.', icon: 'badge-6', examples: ['9777777123'], aliases: ['hexa'], sortOrder: 21, priority: 14 },
    { slug: 'septa-numbers', name: 'Septa Numbers', description: 'Contains at least seven identical consecutive digits.', icon: 'badge-7', examples: ['9777777712'], aliases: ['septa', 'hepta-numbers'], sortOrder: 22, priority: 13 },
    { slug: 'octa-numbers', name: 'Octa Numbers', description: 'Contains at least eight identical consecutive digits.', icon: 'badge-8', examples: ['9777777771'], aliases: ['octa'], sortOrder: 23, priority: 12 },
    { slug: 'unique-numbers', name: 'Unique Numbers', description: 'Distinctive numbers that do not match another automatic pattern.', icon: 'gem', examples: ['9650741832'], aliases: ['unique', 'unique-number'], sortOrder: 24, priority: 999 },
];

export const CATEGORY_CATALOG: ReadonlyArray<NumberCategory> = Object.freeze(
    catalog.map((category) => Object.freeze({
        ...category,
        examples: Object.freeze([...category.examples]),
        aliases: Object.freeze([...category.aliases]),
    })),
);

export interface CategoryReferenceVectors {
    positive: readonly string[];
    negative: readonly string[];
}

/**
 * Golden vectors live beside the matcher version so changing a rule requires
 * an intentional fixture review and classifier-version bump.
 */
export const CATEGORY_REFERENCE_VECTORS: Readonly<Record<CategorySlug, CategoryReferenceVectors>> = Object.freeze(
    Object.fromEntries(CATEGORY_CATALOG.map((category) => [category.slug, Object.freeze({
        positive: Object.freeze([...category.examples]),
        negative: Object.freeze(category.slug === 'unique-numbers' ? ['9777777771'] : ['9650741832']),
    })])) as Record<CategorySlug, CategoryReferenceVectors>,
);

const CATEGORY_BY_SLUG = new Map<CategorySlug, NumberCategory>(
    CATEGORY_CATALOG.map((category) => [category.slug, category]),
);

const CATEGORY_BY_ALIAS = new Map<string, NumberCategory>();
for (const category of CATEGORY_CATALOG) {
    CATEGORY_BY_ALIAS.set(category.slug, category);
    CATEGORY_BY_ALIAS.set(category.name.toLowerCase(), category);
    for (const alias of category.aliases) CATEGORY_BY_ALIAS.set(alias.toLowerCase(), category);
}

/**
 * Accept common display formatting and an optional Indian country code, then
 * return exactly ten mobile digits. Invalid input throws a user-safe error.
 */
export function normalizeIndianNumber(input: unknown): string {
    if (typeof input !== 'string' && typeof input !== 'number') {
        throw new Error('A valid mobile number is required.');
    }

    let value = String(input).trim();
    if (!value) throw new Error('A valid mobile number is required.');

    value = value.replace(/[\s().-]/g, '');
    if (!/^\+?\d+$/.test(value)) {
        throw new Error('Mobile number may contain only digits and standard separators.');
    }

    if (value.startsWith('+')) value = value.slice(1);
    if (value.length === 12 && value.startsWith('91')) value = value.slice(2);

    if (!/^[6-9]\d{9}$/.test(value)) {
        throw new Error('Enter a valid 10-digit Indian mobile number.');
    }
    return value;
}

export function isCategorySlug(value: unknown): value is CategorySlug {
    return typeof value === 'string' && CATEGORY_BY_SLUG.has(value as CategorySlug);
}

export function resolveCategorySlug(value: unknown): CategorySlug | undefined {
    if (typeof value !== 'string') return undefined;
    return CATEGORY_BY_ALIAS.get(value.trim().toLowerCase())?.slug;
}

export function getCategoryBySlug(slug: unknown): NumberCategory | undefined {
    const canonicalSlug = resolveCategorySlug(slug);
    return canonicalSlug ? CATEGORY_BY_SLUG.get(canonicalSlug) : undefined;
}

export function categoryToApiModel(category: NumberCategory | NumberCategoryMatch): NumberCategoryApiModel {
    const model: NumberCategoryApiModel = {
        slug: category.slug,
        name: category.name,
        description: category.description,
        icon: category.icon,
        examples: category.examples,
        aliases: category.aliases,
        sort_order: category.sortOrder,
        priority: category.priority,
    };
    if ('match_spans' in category) {
        model.match_spans = category.match_spans.map((span) => ({ ...span }));
    }
    return model;
}

export function categoryMatchToApiModel(category: NumberCategoryMatch): NumberCategoryMatchApiModel {
    return {
        ...categoryToApiModel(category),
        match_spans: category.match_spans.map((span) => ({ ...span })),
    } as NumberCategoryMatchApiModel;
}

function countDistinctDigits(value: string): number {
    return new Set(value.split('')).size;
}

function occurrenceIndexes(value: string, block: string): number[] {
    const indexes: number[] = [];
    for (let i = 0; i <= value.length - block.length; i += 1) {
        if (value.slice(i, i + block.length) === block) indexes.push(i);
    }
    return indexes;
}

interface MatchEvidence {
    spans: NumberMatchSpan[];
    blockValue?: string;
}

interface MatchCandidate extends MatchEvidence {
    category: NumberCategory;
    score: number;
    classRank: number;
}

const STRUCTURAL_SLUGS = new Set<CategorySlug>([
    'mirror-numbers',
    'semi-mirror-numbers',
    'doubling-numbers',
    'ab-ab-xy-xy-numbers',
    'ab-ab-ab-numbers',
    'start-ab-ab-numbers',
    'middle-ab-ab-numbers',
    'ending-ab-ab-numbers',
    'abc-abc-abc-numbers',
    'abc-abc-numbers',
    'aaa-bbb-numbers',
]);

const REPEAT_TIERS = new Map<CategorySlug, number>([
    ['triple-numbers', 3],
    ['tetra-numbers', 4],
    ['penta-numbers', 5],
    ['hexa-numbers', 6],
    ['septa-numbers', 7],
    ['octa-numbers', 8],
]);

const LITERAL_OR_COUNTING_SLUGS = new Set<CategorySlug>([
    'counting-numbers',
    '786-numbers',
    '108-numbers',
]);

function spanLength(span: NumberMatchSpan): number {
    return span.end - span.start;
}

function explainedDigitCount(spans: NumberMatchSpan[]): number {
    return spans.reduce((total, span) => total + spanLength(span), 0);
}

function firstSpanStart(spans: NumberMatchSpan[]): number {
    return spans.length ? spans[0].start : Number.MAX_SAFE_INTEGER;
}

function compareSpanLists(left: NumberMatchSpan[], right: NumberMatchSpan[]): number {
    const length = Math.min(left.length, right.length);
    for (let index = 0; index < length; index += 1) {
        const byStart = left[index].start - right[index].start;
        if (byStart !== 0) return byStart;
        const byEnd = left[index].end - right[index].end;
        if (byEnd !== 0) return byEnd;
    }
    return left.length - right.length;
}

function normalizeEvidence(evidence: MatchEvidence): MatchEvidence {
    const spans = evidence.spans
        .filter((span) => Number.isInteger(span.start)
            && Number.isInteger(span.end)
            && span.start >= 0
            && span.end <= 10
            && span.start < span.end)
        .map((span) => ({ start: span.start, end: span.end }))
        .sort((left, right) => left.start - right.start || left.end - right.end);
    return { spans, blockValue: evidence.blockValue };
}

function chooseBestEvidence(candidates: MatchEvidence[]): MatchEvidence | undefined {
    return candidates
        .map(normalizeEvidence)
        .filter((candidate) => candidate.spans.length > 0)
        .sort((left, right) => explainedDigitCount(right.spans) - explainedDigitCount(left.spans)
            || firstSpanStart(left.spans) - firstSpanStart(right.spans)
            || String(left.blockValue || '').localeCompare(String(right.blockValue || ''))
            || compareSpanLists(left.spans, right.spans))[0];
}

function repeatedBlockEvidence(
    value: string,
    blockSize: number,
    requiredOccurrences: number,
    acceptBlock: (block: string) => boolean = () => true,
): MatchEvidence | undefined {
    const seen = new Set<string>();
    const candidates: MatchEvidence[] = [];
    for (let i = 0; i <= value.length - blockSize; i += 1) {
        const block = value.slice(i, i + blockSize);
        if (!acceptBlock(block)) continue;
        if (seen.has(block)) continue;
        seen.add(block);

        const accepted: number[] = [];
        let nextAllowedIndex = 0;
        for (const index of occurrenceIndexes(value, block)) {
            if (index < nextAllowedIndex) continue;
            accepted.push(index);
            nextAllowedIndex = index + blockSize;
        }
        if (accepted.length >= requiredOccurrences) {
            candidates.push({
                spans: accepted.map((index) => ({ start: index, end: index + blockSize })),
                blockValue: block,
            });
        }
    }
    return chooseBestEvidence(candidates);
}

interface AbabWindow { index: number; pair: string; }

function ababWindows(value: string): AbabWindow[] {
    const windows: AbabWindow[] = [];
    for (let i = 0; i <= value.length - 4; i += 1) {
        const pair = value.slice(i, i + 2);
        if (pair[0] !== pair[1] && value.slice(i + 2, i + 4) === pair) {
            windows.push({ index: i, pair });
        }
    }
    return windows;
}

function ababXyxyEvidence(value: string): MatchEvidence | undefined {
    const windows = ababWindows(value);
    const candidates: MatchEvidence[] = [];
    for (let i = 0; i < windows.length; i += 1) {
        for (let j = i + 1; j < windows.length; j += 1) {
            const left = windows[i];
            const right = windows[j];
            const nonOverlapping = left.index + 4 <= right.index || right.index + 4 <= left.index;
            if (nonOverlapping && left.pair !== right.pair) {
                const ordered = [left, right].sort((a, b) => a.index - b.index);
                const spans: NumberMatchSpan[] = [];
                for (const window of ordered) {
                    spans.push(
                        { start: window.index, end: window.index + 2 },
                        { start: window.index + 2, end: window.index + 4 },
                    );
                }
                candidates.push({
                    spans,
                    blockValue: `${ordered[0].pair}:${ordered[1].pair}`,
                });
            }
        }
    }
    return chooseBestEvidence(candidates);
}

function doublingEvidence(value: string): MatchEvidence | undefined {
    const candidates: MatchEvidence[] = [];
    for (let start = 0; start <= value.length - 6; start += 1) {
        const spans: NumberMatchSpan[] = [];
        const pairDigits: string[] = [];
        for (let index = start; index + 2 <= value.length; index += 2) {
            if (value[index] !== value[index + 1]) break;
            spans.push({ start: index, end: index + 2 });
            pairDigits.push(value[index]);
        }
        if (spans.length >= 3 && new Set(pairDigits).size >= 2) {
            candidates.push({ spans, blockValue: pairDigits.join('') });
        }
    }
    return chooseBestEvidence(candidates);
}

function countingEvidence(value: string): MatchEvidence | undefined {
    const candidates: MatchEvidence[] = [];
    for (let start = 0; start < value.length; start += 1) {
        for (let width = 1; width <= 3 && start + width <= value.length; width += 1) {
            const token = value.slice(start, start + width);
            if (token.length > 1 && token.startsWith('0')) continue;
            const first = Number(token);
            for (const direction of [1, -1]) {
                const spans: NumberMatchSpan[] = [{ start, end: start + width }];
                const terms: number[] = [first];
                let cursor = start + width;
                let expected = first + direction;
                while (expected >= 0 && cursor < value.length) {
                    const expectedText = String(expected);
                    if (value.slice(cursor, cursor + expectedText.length) !== expectedText) break;
                    spans.push({ start: cursor, end: cursor + expectedText.length });
                    terms.push(expected);
                    cursor += expectedText.length;
                    expected += direction;
                }
                if (spans.length >= 3) {
                    candidates.push({ spans, blockValue: terms.join(':') });
                }
            }
        }
    }
    return chooseBestEvidence(candidates);
}

function literalEvidence(value: string, literal: string): MatchEvidence | undefined {
    const accepted: number[] = [];
    let nextAllowedIndex = 0;
    for (const index of occurrenceIndexes(value, literal)) {
        if (index < nextAllowedIndex) continue;
        accepted.push(index);
        nextAllowedIndex = index + literal.length;
    }
    if (!accepted.length) return undefined;
    return {
        spans: accepted.map((index) => ({ start: index, end: index + literal.length })),
        blockValue: literal,
    };
}

function longestRunEvidence(value: string, minimumLength: number): MatchEvidence | undefined {
    const candidates: MatchEvidence[] = [];
    let start = 0;
    while (start < value.length) {
        let end = start + 1;
        while (end < value.length && value[end] === value[start]) end += 1;
        if (end - start >= minimumLength) {
            candidates.push({ spans: [{ start, end }], blockValue: value[start] });
        }
        start = end;
    }
    return chooseBestEvidence(candidates);
}

function aaaBbbEvidence(value: string): MatchEvidence | undefined {
    const candidates: MatchEvidence[] = [];
    for (let index = 0; index <= value.length - 6; index += 1) {
        const first = value.slice(index, index + 3);
        const second = value.slice(index + 3, index + 6);
        if (first[0] === first[1] && first[1] === first[2]
            && second[0] === second[1] && second[1] === second[2]
            && first[0] !== second[0]) {
            candidates.push({
                spans: [
                    { start: index, end: index + 3 },
                    { start: index + 3, end: index + 6 },
                ],
                blockValue: `${first[0]}:${second[0]}`,
            });
        }
    }
    return chooseBestEvidence(candidates);
}

function positionedAbabEvidence(value: string, position: 'start' | 'middle' | 'ending'): MatchEvidence | undefined {
    const candidates = ababWindows(value)
        .filter((window) => position === 'start'
            ? window.index === 0
            : position === 'ending'
                ? window.index === 6
                : window.index > 0 && window.index < 6)
        .map((window) => ({
            spans: [{ start: window.index, end: window.index + 4 }],
            blockValue: window.pair,
        }));
    return chooseBestEvidence(candidates);
}

const matchers: Record<Exclude<CategorySlug, 'unique-numbers'>, (value: string) => MatchEvidence | undefined> = {
    'without-248-numbers': (value) => !/[248]/.test(value)
        ? { spans: [{ start: 0, end: value.length }] }
        : undefined,
    'mirror-numbers': (value) => value === value.split('').reverse().join('') || value.slice(0, 5) === value.slice(5)
        ? { spans: [{ start: 0, end: 5 }, { start: 5, end: 10 }], blockValue: value.slice(0, 5) }
        : undefined,
    'semi-mirror-numbers': (value) => repeatedBlockEvidence(value, 4, 2),
    'two-digit-numbers': (value) => countDistinctDigits(value) === 2
        ? { spans: [{ start: 0, end: value.length }] }
        : undefined,
    'three-digit-numbers': (value) => countDistinctDigits(value) === 3
        ? { spans: [{ start: 0, end: value.length }] }
        : undefined,
    'counting-numbers': countingEvidence,
    '786-numbers': (value) => literalEvidence(value, '786'),
    '108-numbers': (value) => literalEvidence(value, '108'),
    'doubling-numbers': doublingEvidence,
    'ab-ab-xy-xy-numbers': ababXyxyEvidence,
    'ab-ab-ab-numbers': (value) => repeatedBlockEvidence(value, 2, 3, (block) => block[0] !== block[1]),
    'start-ab-ab-numbers': (value) => positionedAbabEvidence(value, 'start'),
    'middle-ab-ab-numbers': (value) => positionedAbabEvidence(value, 'middle'),
    'ending-ab-ab-numbers': (value) => positionedAbabEvidence(value, 'ending'),
    'abc-abc-abc-numbers': (value) => repeatedBlockEvidence(value, 3, 3),
    'abc-abc-numbers': (value) => repeatedBlockEvidence(value, 3, 2),
    'aaa-bbb-numbers': aaaBbbEvidence,
    'triple-numbers': (value) => longestRunEvidence(value, 3),
    'tetra-numbers': (value) => longestRunEvidence(value, 4),
    'penta-numbers': (value) => longestRunEvidence(value, 5),
    'hexa-numbers': (value) => longestRunEvidence(value, 6),
    'septa-numbers': (value) => longestRunEvidence(value, 7),
    'octa-numbers': (value) => longestRunEvidence(value, 8),
};

function matchClassRank(slug: CategorySlug): number {
    if (STRUCTURAL_SLUGS.has(slug)) return 0;
    if (REPEAT_TIERS.has(slug)) return 1;
    if (LITERAL_OR_COUNTING_SLUGS.has(slug)) return 2;
    if (slug === 'two-digit-numbers' || slug === 'three-digit-numbers') return 3;
    if (slug === 'without-248-numbers') return 4;
    return 5;
}

function matchScore(slug: CategorySlug, evidence: MatchEvidence): number {
    if (REPEAT_TIERS.has(slug)) {
        return Math.min(10, spanLength(evidence.spans[0]) + 2);
    }
    if (slug === 'two-digit-numbers' || slug === 'three-digit-numbers') return 10;
    if (slug === 'without-248-numbers') return 0;
    return Math.min(10, explainedDigitCount(evidence.spans));
}

function toCategoryMatch(category: NumberCategory, evidence: MatchEvidence): NumberCategoryMatch {
    return {
        ...category,
        match_spans: normalizeEvidence(evidence).spans,
    };
}

function compareCandidates(left: MatchCandidate, right: MatchCandidate): number {
    return right.score - left.score
        || left.classRank - right.classRank
        || left.category.priority - right.category.priority
        || left.category.sortOrder - right.category.sortOrder
        || firstSpanStart(left.spans) - firstSpanStart(right.spans)
        || String(left.blockValue || '').localeCompare(String(right.blockValue || ''));
}

function categoryCandidates(canonicalNumber: string): MatchCandidate[] {
    const candidates: MatchCandidate[] = [];
    for (const slug of CATEGORY_SLUGS) {
        if (slug === 'unique-numbers') continue;
        const evidence = matchers[slug](canonicalNumber);
        if (!evidence) continue;
        const normalized = normalizeEvidence(evidence);
        const category = CATEGORY_BY_SLUG.get(slug) as NumberCategory;
        candidates.push({
            category,
            ...normalized,
            score: matchScore(slug, normalized),
            classRank: matchClassRank(slug),
        });
    }
    return candidates;
}

/** Return the evidence for one matcher without changing the exclusive winner. */
export function matchNumberCategory(input: unknown, slug: CategorySlug): NumberCategoryMatch | undefined {
    const canonicalNumber = normalizeIndianNumber(input);
    const category = CATEGORY_BY_SLUG.get(slug);
    if (!category) return undefined;
    if (slug === 'unique-numbers') {
        return categoryCandidates(canonicalNumber).length === 0
            ? toCategoryMatch(category, { spans: [] })
            : undefined;
    }
    const evidence = matchers[slug](canonicalNumber);
    return evidence ? toCategoryMatch(category, evidence) : undefined;
}

export function classifyNumber(input: unknown): NumberClassification {
    const canonicalNumber = normalizeIndianNumber(input);
    const winner = categoryCandidates(canonicalNumber).sort(compareCandidates)[0];
    const primaryCategory = winner
        ? toCategoryMatch(winner.category, winner)
        : toCategoryMatch(CATEGORY_BY_SLUG.get('unique-numbers') as NumberCategory, { spans: [] });
    const categories = [primaryCategory];

    return {
        canonicalNumber,
        categories,
        primaryCategory,
        classifierVersion: CATEGORY_CLASSIFIER_VERSION,
    };
}

function categorySlugsFromUnknown(value: unknown): CategorySlug[] {
    let raw = value;
    if (typeof raw === 'string') {
        const text = raw;
        try { raw = JSON.parse(text); }
        catch { raw = text.split(','); }
    }
    if (!Array.isArray(raw)) return [];
    const slugs = raw
        .map((item) => typeof item === 'string' ? item : (item as any)?.slug)
        .map(resolveCategorySlug)
        .filter((slug): slug is CategorySlug => Boolean(slug));
    return [...new Set(slugs)];
}

/** Attach an exclusive primary category and one-release compatibility fields. */
export function decorateNumberCategories<T extends Record<string, any>>(row: T, categorySlugs?: unknown): T & {
    categories: NumberCategoryMatchApiModel[];
    primary_category: NumberCategoryMatchApiModel;
    category_name: string;
    category_slug: CategorySlug;
    classifier_version: number;
} {
    const numberValue = row.number_value ?? row.display_number;
    let primaryCategory: NumberCategoryMatch | undefined;
    if (categorySlugs === undefined
        && numberValue !== undefined
        && numberValue !== null
        && String(numberValue).trim()) {
        primaryCategory = classifyNumber(numberValue).primaryCategory;
    }
    if (!primaryCategory) {
        const authoritativeSlug = resolveCategorySlug(row.primary_category?.slug ?? row.category_slug);
        const suppliedSlugs = categorySlugsFromUnknown(categorySlugs ?? row.category_slugs ?? row.categories);
        const slug = authoritativeSlug || suppliedSlugs
            .map((item) => CATEGORY_BY_SLUG.get(item) as NumberCategory)
            .sort((left, right) => left.priority - right.priority || left.sortOrder - right.sortOrder)[0]?.slug
            || 'unique-numbers';
        primaryCategory = toCategoryMatch(CATEGORY_BY_SLUG.get(slug) as NumberCategory, { spans: [] });
    }
    const primaryApiCategory = categoryMatchToApiModel(primaryCategory);
    const categories = [primaryApiCategory];
    return {
        ...row,
        categories,
        primary_category: primaryApiCategory,
        category_name: primaryApiCategory.name,
        category_slug: primaryApiCategory.slug,
        classifier_version: CATEGORY_CLASSIFIER_VERSION,
    };
}

export interface CategorySqlConnection {
    query(sql: string, params?: any[]): Promise<any>;
}

/**
 * Replace a number's derived category rows using the caller's pool/transaction.
 * The helper intentionally does not begin or commit a transaction.
 */
export async function syncNumberCategories(
    connection: CategorySqlConnection,
    numberId: number,
    numberValue: unknown,
): Promise<NumberClassification> {
    if (!Number.isInteger(numberId) || numberId <= 0) throw new Error('A valid number ID is required.');
    const classification = classifyNumber(numberValue);
    await connection.query('DELETE FROM vip_number_categories WHERE number_id = ?', [numberId]);
    await connection.query(
        'INSERT INTO vip_number_categories (number_id, category_slug, classifier_version) VALUES (?,?,?)',
        [numberId, classification.primaryCategory.slug, CATEGORY_CLASSIFIER_VERSION],
    );
    return classification;
}
