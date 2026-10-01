"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scoreSimilarNumber = scoreSimilarNumber;
exports.rankSimilarNumbers = rankSimilarNumbers;
const categoryClassifier_1 = require("../categories/categoryClassifier");
function commonPrefix(left, right) {
    let index = 0;
    while (index < left.length && index < right.length && left[index] === right[index])
        index += 1;
    return index;
}
function commonSuffix(left, right) {
    let count = 0;
    while (count < left.length && count < right.length
        && left[left.length - 1 - count] === right[right.length - 1 - count])
        count += 1;
    return count;
}
function matchingPositions(left, right) {
    const length = Math.min(left.length, right.length);
    let matches = 0;
    for (let index = 0; index < length; index += 1) {
        if (left[index] === right[index])
            matches += 1;
    }
    return matches;
}
function digitFrequencyOverlap(left, right) {
    const leftCounts = Array(10).fill(0);
    const rightCounts = Array(10).fill(0);
    for (const digit of left)
        leftCounts[Number(digit)] += 1;
    for (const digit of right)
        rightCounts[Number(digit)] += 1;
    return leftCounts.reduce((total, count, digit) => total + Math.min(count, rightCounts[digit]), 0);
}
function priceCloseness(sourcePrice, candidatePrice) {
    const largest = Math.max(Math.abs(sourcePrice), Math.abs(candidatePrice), 1);
    return Math.max(0, 1 - Math.abs(sourcePrice - candidatePrice) / largest);
}
function scoreSimilarNumber(sourceRow, candidateRow) {
    var _a, _b;
    const source = (0, categoryClassifier_1.decorateNumberCategories)(sourceRow);
    const candidate = (0, categoryClassifier_1.decorateNumberCategories)(candidateRow);
    const sourceNumber = (0, categoryClassifier_1.normalizeIndianNumber)((_a = source.number_value) !== null && _a !== void 0 ? _a : source.display_number);
    const candidateNumber = (0, categoryClassifier_1.normalizeIndianNumber)((_b = candidate.number_value) !== null && _b !== void 0 ? _b : candidate.display_number);
    const prefixLength = commonPrefix(sourceNumber, candidateNumber);
    const suffixLength = commonSuffix(sourceNumber, candidateNumber);
    const positionalMatches = matchingPositions(sourceNumber, candidateNumber);
    const frequencyOverlap = digitFrequencyOverlap(sourceNumber, candidateNumber);
    const sourceCategories = new Set(source.categories.map((category) => category.slug));
    const categoryMatch = candidate.categories.some((category) => sourceCategories.has(category.slug));
    const numerologyMatch = Number(source.numerology_sum) > 0
        && Number(source.numerology_sum) === Number(candidate.numerology_sum);
    const closeness = priceCloseness(Number(source.offer_price) || 0, Number(candidate.offer_price) || 0);
    // Category and visible digit resemblance intentionally dominate the softer
    // numerology and price signals. Integer points keep ordering deterministic.
    const score = (categoryMatch ? 1000 : 0)
        + (prefixLength * 85)
        + (suffixLength * 95)
        + (positionalMatches * 24)
        + (frequencyOverlap * 8)
        + (numerologyMatch ? 110 : 0)
        + Math.round(closeness * 80);
    return {
        item: candidate,
        score,
        categoryMatch,
        prefixLength,
        suffixLength,
        positionalMatches,
        frequencyOverlap,
        numerologyMatch,
        priceCloseness: closeness,
    };
}
function rankSimilarNumbers(source, candidates) {
    return candidates
        .filter((candidate) => Number(candidate.number_id) !== Number(source.number_id))
        .filter((candidate) => String(candidate.status || '').toUpperCase() === 'AVAILABLE')
        .filter((candidate) => Number(candidate.stock) > 0)
        .map((candidate) => scoreSimilarNumber(source, candidate))
        .sort((left, right) => {
        if (right.score !== left.score)
            return right.score - left.score;
        const views = Number(right.item.views || 0) - Number(left.item.views || 0);
        if (views !== 0)
            return views;
        const created = new Date(right.item.created_at || 0).getTime()
            - new Date(left.item.created_at || 0).getTime();
        if (created !== 0)
            return created;
        return Number(right.item.number_id) - Number(left.item.number_id);
    })
        .map(({ item }) => (Object.assign(Object.assign({}, item), { is_premium: Boolean(Number(item.is_featured)) })));
}
//# sourceMappingURL=similarNumbers.js.map