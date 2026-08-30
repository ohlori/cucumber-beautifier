import languageData from './gherkin-languages.json';
import { escaprRegExpForPureText } from './util';

const STEP_TYPES = ['given', 'when', 'then', 'and', 'but'] as const;

type StepType = typeof STEP_TYPES[number];

interface LanguageSource {
    and: string[];
    background: string[];
    but: string[];
    examples: string[];
    feature: string[];
    given: string[];
    name: string;
    native: string;
    rule: string[];
    scenario: string[];
    scenarioOutline: string[];
    then: string[];
    when: string[];
}

export interface GherkinDialect extends LanguageSource {
    code: string;
    stepKeywords: string[];
    stepPattern: string;
}

export const DEFAULT_GHERKIN_LANGUAGE = 'en';

const languages = languageData as Record<string, LanguageSource>;

export const supportedGherkinLanguages = Object.freeze(
    Object.keys(languages).sort()
);

const normalize = (words: string[]) => Array.from(
    new Set(words
        .map((word) => word.trim())
        .filter((word) => Boolean(word) && word !== '*'))
);

const dialectCache = new Map<string, GherkinDialect>();

export function normalizeGherkinLanguage(language?: string): string {
    return language && Object.prototype.hasOwnProperty.call(languages, language)
        ? language
        : DEFAULT_GHERKIN_LANGUAGE;
}

export function getGherkinDialect(language?: string): GherkinDialect {
    const code = normalizeGherkinLanguage(language);
    const cached = dialectCache.get(code);
    if (cached) {
        return cached;
    }

    const source = languages[code];
    const dialect = STEP_TYPES.reduce((result, type) => {
        result[type] = normalize(source[type]);
        return result;
    }, {
        ...source,
        code,
        stepKeywords: new Array<string>(),
        stepPattern: '',
    } as GherkinDialect);

    dialect.stepKeywords = Array.from(new Set([
        ...STEP_TYPES.flatMap((type) => dialect[type]),
        '*',
    ]));
    dialect.stepPattern = dialect.stepKeywords
        .slice()
        .sort((left, right) => right.length - left.length)
        .map(escaprRegExpForPureText)
        .join('|');

    dialectCache.set(code, dialect);
    return dialect;
}

export const allGherkinDefinitionWords = Array.from(new Set(
    supportedGherkinLanguages.flatMap(
        (language) => getGherkinDialect(language).stepKeywords
    )
))
    .sort((left, right) => right.length - left.length)
    .map(escaprRegExpForPureText)
    .join('|');

export enum GherkinType {
    Given,
    When,
    Then,
    And,
    But,
    Other
}

const TYPES = [
    GherkinType.Given,
    GherkinType.When,
    GherkinType.Then,
    GherkinType.And,
    GherkinType.But,
] as const;

export function getGherkinType(
    word: string,
    language = DEFAULT_GHERKIN_LANGUAGE
): GherkinType {
    const dialect = getGherkinDialect(language);
    for (let index = 0; index < STEP_TYPES.length; index++) {
        if (dialect[STEP_TYPES[index]].includes(word)) {
            return TYPES[index];
        }
    }
    return GherkinType.Other;
}

export function getGherkinTypeLower(
    word: string,
    language = DEFAULT_GHERKIN_LANGUAGE
): GherkinType {
    const lowerWord = word.toLowerCase();
    const dialect = getGherkinDialect(language);
    for (let index = 0; index < STEP_TYPES.length; index++) {
        if (dialect[STEP_TYPES[index]].some(
            (keyword) => keyword.toLowerCase() === lowerWord
        )) {
            return TYPES[index];
        }
    }
    return GherkinType.Other;
}

export function getDefinitionGherkinTypeLower(
    word: string,
    preferredLanguage = DEFAULT_GHERKIN_LANGUAGE
): GherkinType {
    const language = normalizeGherkinLanguage(preferredLanguage);
    for (const candidateLanguage of [
        language,
        ...supportedGherkinLanguages.filter((code) => code !== language),
    ]) {
        const type = getGherkinTypeLower(word, candidateLanguage);
        if (type !== GherkinType.Other) {
            return type;
        }
    }
    return GherkinType.Other;
}
