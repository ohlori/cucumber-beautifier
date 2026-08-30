import { SemanticTokens } from 'vscode-languageserver';

import {
    getGherkinDialect,
} from './gherkin';
import { escaprRegExpForPureText } from './util';

export function getGherkinSemanticTokens(
    text: string,
    fallbackLanguage: string
): SemanticTokens {
    const dialect = getGherkinDialect(fallbackLanguage);
    const stepKeyword = new RegExp(
        `^(\\s*)(${dialect.stepPattern})(?=\\s)`
    );
    const titlePattern = Array.from(new Set([
        ...dialect.feature,
        ...dialect.rule,
        ...dialect.background,
        ...dialect.scenario,
        ...dialect.scenarioOutline,
        ...dialect.examples,
    ]))
        .sort((left, right) => right.length - left.length)
        .map(escaprRegExpForPureText)
        .join('|');
    const titleKeyword = new RegExp(
        `^(\\s*)(${titlePattern})(?=\\s*:)`
    );
    const data = new Array<number>();
    let previousLine = 0;
    let previousCharacter = 0;
    let hasToken = false;
    let docStringDelimiter: '"""' | '```' | null = null;

    text.split(/\r?\n/g).forEach((line, lineNumber) => {
        const trimmedLine = line.trimStart();
        if (docStringDelimiter) {
            if (trimmedLine.startsWith(docStringDelimiter)) {
                docStringDelimiter = null;
            }
            return;
        }
        if (trimmedLine.startsWith('"""')) {
            docStringDelimiter = '"""';
            return;
        }
        if (trimmedLine.startsWith('```')) {
            docStringDelimiter = '```';
            return;
        }

        const match = line.match(stepKeyword) || line.match(titleKeyword);
        if (!match) {
            return;
        }

        const character = match[1].length;
        const deltaLine = hasToken ? lineNumber - previousLine : lineNumber;
        const deltaCharacter = deltaLine === 0
            ? character - previousCharacter
            : character;
        data.push(deltaLine, deltaCharacter, match[2].length, 0, 0);
        previousLine = lineNumber;
        previousCharacter = character;
        hasToken = true;
    });

    return { data };
}
