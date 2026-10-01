/** Store adapter for the internal app's category and subcategory matchers. */
import {
    CATEGORY_TAXONOMY,
    getMatchingCategories,
    type Category,
    type Subcategory,
} from './internalCategoryTaxonomy';

export const CATEGORY_CLASSIFIER_VERSION = 4;
export const CLASSIFIER_VERSION = CATEGORY_CLASSIFIER_VERSION;
export const CATEGORY_CATALOG: ReadonlyArray<Category> = CATEGORY_TAXONOMY;
export const CATEGORY_SLUGS = CATEGORY_TAXONOMY.map(category => category.slug);
export type CategorySlug = string;

export interface NumberCategoryMatchApiModel {
    id: number;
    slug: string;
    name: string;
    sort_order: number;
    match_spans: { start: number; end: number }[];
    subcategories: Subcategory[];
}

export interface NumberClassification {
    canonicalNumber: string;
    categories: NumberCategoryMatchApiModel[];
    primaryCategory: NumberCategoryMatchApiModel | null;
    classifierVersion: number;
}

const bySlug = new Map(CATEGORY_TAXONOMY.map(category => [category.slug, category]));
const byName = new Map(CATEGORY_TAXONOMY.map(category => [category.name.toLowerCase(), category]));

export function normalizeIndianNumber(input: unknown): string {
    if (typeof input !== 'string' && typeof input !== 'number') throw new Error('A valid mobile number is required.');
    let value = String(input).trim().replace(/[\s().-]/g, '');
    if (!/^\+?\d+$/.test(value)) throw new Error('Mobile number may contain only digits and standard separators.');
    if (value.startsWith('+')) value = value.slice(1);
    if (value.length === 12 && value.startsWith('91')) value = value.slice(2);
    if (value.length === 11 && value.startsWith('0')) value = value.slice(1);
    if (!/^[6-9]\d{9}$/.test(value)) throw new Error('Enter a valid 10-digit Indian mobile number.');
    return value;
}

export function isCategorySlug(value: unknown): value is CategorySlug {
    return typeof value === 'string' && bySlug.has(value);
}

export function resolveCategorySlug(value: unknown): CategorySlug | undefined {
    if (typeof value !== 'string') return undefined;
    const cleaned = value.trim();
    return bySlug.get(cleaned)?.slug || byName.get(cleaned.toLowerCase())?.slug;
}

export function getCategoryBySlug(value: unknown): Category | undefined {
    return bySlug.get(resolveCategorySlug(value) || '');
}

export function getSubcategoryForCategory(categorySlug: string, subcategoryId: number): Subcategory | undefined {
    return bySlug.get(categorySlug)?.subcategories.find(subcategory => subcategory.id === subcategoryId);
}

function searchWords(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function containsPhrase(haystack: string, phrase: string): boolean {
    return phrase.length >= 3 && (` ${haystack} `).includes(` ${phrase} `);
}

/** Infer only exact, unambiguous taxonomy names; selected UI filters take precedence. */
export function inferCategorySelectionFromText(query: string, preferredSlug?: string): { category?: string; subcategory_id?: number } {
    const words = searchWords(query);
    const preferred = preferredSlug && bySlug.get(preferredSlug);
    const categoryHits = CATEGORY_TAXONOMY.flatMap(category => {
        const phrases = [searchWords(category.name), searchWords(category.slug)];
        const length = Math.max(0, ...phrases.filter(phrase => containsPhrase(words, phrase)).map(phrase => phrase.length));
        return length ? [{ category, length }] : [];
    }).sort((a, b) => b.length - a.length);
    const namedCategory = categoryHits.length && (categoryHits.length === 1 || categoryHits[0].length > categoryHits[1].length)
        ? categoryHits[0].category : undefined;
    const parent = preferred || namedCategory;
    const possibleParents = parent ? [parent] : CATEGORY_TAXONOMY;
    const subHits = possibleParents.flatMap(category => category.subcategories.flatMap(subcategory => {
        const phrase = searchWords(subcategory.name);
        if (phrase === searchWords(category.name) || !containsPhrase(words, phrase)) return [];
        return [{ category, subcategory, length: phrase.length }];
    })).sort((a, b) => b.length - a.length);
    const child = subHits.length && (subHits.length === 1 || subHits[0].length > subHits[1].length)
        ? subHits[0] : undefined;
    return {
        ...(parent || child ? { category: (parent || child!.category).slug } : {}),
        ...(child ? { subcategory_id: child.subcategory.id } : {}),
    };
}

export function categoryToApiModel(category: Category) {
    return {
        id: category.id,
        slug: category.slug,
        name: category.name,
        sort_order: CATEGORY_TAXONOMY.indexOf(category) + 1,
        subcategories: category.subcategories.map(subcategory => ({ ...subcategory })),
    };
}

export function categoryMatchToApiModel(category: NumberCategoryMatchApiModel): NumberCategoryMatchApiModel {
    return { ...category, subcategories: category.subcategories.map(subcategory => ({ ...subcategory })), match_spans: [] };
}

export function classifyNumber(input: unknown): NumberClassification {
    const canonicalNumber = normalizeIndianNumber(input);
    const matches = getMatchingCategories(canonicalNumber);
    const categories = matches.map(({ category, subcategories }) => ({
        ...categoryToApiModel(category),
        subcategories: subcategories.map(subcategory => ({ ...subcategory })),
        match_spans: [],
    }));
    return { canonicalNumber, categories, primaryCategory: categories[0] || null, classifierVersion: CATEGORY_CLASSIFIER_VERSION };
}

export function decorateNumberCategories<T extends Record<string, any>>(row: T, _categorySlugs?: unknown): T & {
    categories: NumberCategoryMatchApiModel[];
    primary_category: NumberCategoryMatchApiModel | null;
    category_name: string | null;
    category_slug: string | null;
    classifier_version: number;
} {
    const value = row.number_value ?? row.display_number;
    const classification = value ? classifyNumber(value) : null;
    return {
        ...row,
        categories: classification?.categories || [],
        primary_category: classification?.primaryCategory || null,
        category_name: classification?.primaryCategory?.name || null,
        category_slug: classification?.primaryCategory?.slug || null,
        classifier_version: CATEGORY_CLASSIFIER_VERSION,
    };
}

export interface CategorySqlConnection {
    query(sql: string, params?: any[]): Promise<any>;
}

/** Keep both browsing indexes in the same caller-owned transaction as the number. */
export async function syncNumberCategories(connection: CategorySqlConnection, numberId: number, numberValue: unknown): Promise<NumberClassification> {
    if (!Number.isInteger(numberId) || numberId <= 0) throw new Error('A valid number ID is required.');
    const classification = classifyNumber(numberValue);
    await connection.query('DELETE FROM vip_number_subcategories WHERE number_id = ?', [numberId]);
    await connection.query('DELETE FROM vip_number_categories WHERE number_id = ?', [numberId]);
    // Use the exact same complete classification returned by detail and preview.
    // A child match also makes its parent browseable, even when the internal app's
    // independent broad matcher is narrower than that child matcher.
    const categorySlugs = classification.categories.map(category => category.slug);
    const subcategoryPairs: Array<[number, number]> = classification.categories.flatMap(category =>
        category.subcategories.map(subcategory => [category.id, subcategory.id] as [number, number]),
    );
    if (categorySlugs.length) await connection.query(
        `INSERT INTO vip_number_categories (number_id, category_slug, classifier_version) VALUES ${categorySlugs.map(() => '(?,?,?)').join(',')}`,
        categorySlugs.flatMap(slug => [numberId, slug, CATEGORY_CLASSIFIER_VERSION]),
    );
    if (subcategoryPairs.length) await connection.query(
        `INSERT INTO vip_number_subcategories (number_id, category_id, subcategory_id, classifier_version) VALUES ${subcategoryPairs.map(() => '(?,?,?,?)').join(',')}`,
        subcategoryPairs.flatMap(([categoryId, subcategoryId]) => [numberId, categoryId, subcategoryId, CATEGORY_CLASSIFIER_VERSION]),
    );
    return classification;
}
