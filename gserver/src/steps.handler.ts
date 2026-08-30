import { globSync } from 'glob';
import * as commentParser from 'doctrine';

import {
    Definition,
    CompletionItem,
    Diagnostic,
    DiagnosticSeverity,
    Position,
    Location,
    Range,
    CompletionItemKind,
    InsertTextFormat,
} from 'vscode-languageserver';

import {
    getOSPath,
    getFileContent,
    clearComments,
    getMD5Id,
    escapeRegExp,
    escaprRegExpForPureText,
    getTextRange,
    getSortPrefix,
} from './util';

import {
    allGherkinDefinitionWords,
    GherkinType,
    getDefinitionGherkinTypeLower,
    getGherkinDialect,
    getGherkinType,
    getGherkinTypeLower,
    normalizeGherkinLanguage,
} from './gherkin';

import { Settings, StepSettings, CustomParameter } from './types';

export type Step = {
  id: string;
  reg: RegExp;
  partialReg: RegExp;
  isCucumberExpression: boolean;
  completionVariants: string[];
  text: string;
  desc: string;
  def: Definition;
  count: number;
  gherkin: GherkinType;
  documentation: string;
};

export type StepsCountHash = {
  [step: string]: number;
};

interface JSDocComments {
  [key: number]: string;
}

export default class StepsHandler {
    elements: Step[] = [];

    elementsHash: { [step: string]: boolean } = {};

    elemenstCountHash: StepsCountHash = {};

    settings: Settings;

    constructor(root: string, settings: Settings) {
        const { syncfeatures, steps } = settings;
        this.settings = settings;
        this.populate(root, steps);
        if (syncfeatures === true) {
            this.setElementsHash(`${root}/**/*.feature`);
        } else if (typeof syncfeatures === 'string') {
            this.setElementsHash(`${root}/${syncfeatures}`);
        }
    }

    getGherkinRegEx() {
        const language = normalizeGherkinLanguage(
            this.settings.gherkinLanguage
        );
        const pattern = getGherkinDialect(language).stepPattern;
        return new RegExp(`^(\\s*)(${pattern})(\\s+)(.*)`);
    }

    getElements(): Step[] {
        return this.elements;
    }

    setElementsHash(path: string): void {
        this.elemenstCountHash = {};
        const files = globSync(path);
        files.forEach((f) => {
            const text = getFileContent(f);
            text.split(/\r?\n/g).forEach((line) => {
                const match = this.getGherkinMatch(line, text);
                if (match) {
                    const step = this.getStepByText(match[4]);
                    if (step) {
                        this.incrementElementCount(step.id);
                    }
                }
            });
        });
        this.elements.forEach((el) => (el.count = this.getElementCount(el.id)));
    }

    incrementElementCount(id: string) {
        if (this.elemenstCountHash[id]) {
            this.elemenstCountHash[id]++;
        } else {
            this.elemenstCountHash[id] = 1;
        }
    }

    getElementCount(id: string) {
        return this.elemenstCountHash[id] || 0;
    }

    getStepRegExp() {
    //Actually, we dont care what the symbols are before our 'Gherkin' word
    //But they shouldn't end with letter
        const startPart = "^((?:[^'\"/]*?[^\\w])|.{0})";

        //All the steps should be declared using any gherkin keyword. We should get first 'gherkin' word
        const gherkinPart =
      this.settings.gherkinDefinitionPart ||
      `(${allGherkinDefinitionWords}|defineStep|Step|StepDefinition)`;

        //All the symbols, except of symbols, using as step start and letters, could be between gherkin word and our step
        const nonStepStartSymbols = '[^/\'"`\\w]*?';

        // Step part getting
        const { stepRegExSymbol } = this.settings;
        // Step text could be placed between '/' symbols (ex. in JS) or between quotes, like in Java
        const stepStart = stepRegExSymbol ? `(${stepRegExSymbol})` : '(/|\'|"|`)';
        // ref to RegEx Example: https://regex101.com/r/mS1zJ8/1
        // Use a RegEx that peeks ahead to ensure escape character can still work, like `\'`.
        const stepBody = '((?:(?=(?:\\\\)*)\\\\.|.)*?)';
        //Step should be ended with same symbol it begins
        const stepEnd = stepRegExSymbol ? stepRegExSymbol : '\\3';

        //Our RegExp will be case-insensitive to support cases like TypeScript (...@when...)
        const r = new RegExp(
            startPart +
        gherkinPart +
        nonStepStartSymbols +
        stepStart +
        stepBody +
        stepEnd,
            'i'
        );

        // /^((?:[^'"\/]*?[^\w])|.{0})(Given|When|Then|And|But|defineStep)[^\/'"\w]*?(\/|'|")([^\3]+)\3/i
        return r;
    }

    geStepDefinitionMatch(line: string) {
        return line.match(this.getStepRegExp());
    }

    getOutlineVars(text: string) {
        const language = normalizeGherkinLanguage(
            this.settings.gherkinLanguage
        );
        const examplesPattern = getGherkinDialect(language).examples
            .slice()
            .sort((left, right) => right.length - left.length)
            .map(escaprRegExpForPureText)
            .join('|');
        const examplesHeader = new RegExp(
            `^\\s*(?:${examplesPattern}):\\s*$`
        );
        return text.split(/\r?\n/g).reduce((res, a, i, arr) => {
            if (examplesHeader.test(a) && arr[i + 2]) {
                const names = arr[i + 1].split(/\s*\|\s*/).slice(1, -1);
                const values = arr[i + 2].split(/\s*\|\s*/).slice(1, -1);
                names.forEach((n, i) => {
                    if (values[i]) {
                        res[n] = values[i];
                    }
                });
            }
            return res;
        }, {} as Record<string, string>);
    }

    getGherkinMatch(line: string, document: string) {
        const outlineMatch = line.match(/<.*?>/g);
        if (outlineMatch) {
            const outlineVars = this.getOutlineVars(document);
            //We should support both outlines lines variants - with and without quotes
            const pureLine = outlineMatch
                .map((s) => s.replace(/<|>/g, ''))
                .reduce((resLine, key) => {
                    if (outlineVars[key]) {
                        resLine = resLine.replace(`<${key}>`, outlineVars[key]);
                    }
                    return resLine;
                }, line);
            const quotesLine = outlineMatch
                .map((s) => s.replace(/<|>/g, ''))
                .reduce((resLine, key) => {
                    if (outlineVars[key]) {
                        resLine = resLine.replace(`<${key}>`, `"${outlineVars[key]}"`);
                    }
                    return resLine;
                }, line);
            const pureMatch = pureLine.match(this.getGherkinRegEx());
            const quotesMatch = quotesLine.match(this.getGherkinRegEx());
            if (quotesMatch && quotesMatch[4] && this.getStepByText(quotesMatch[4])) {
                return quotesMatch;
            } else {
                return pureMatch;
            }
        }
        return line.match(this.getGherkinRegEx());
    }

    handleCustomParameters(step: string) {
        const { customParameters } = this.settings;
        if (!customParameters.length) {
            return step;
        }
        customParameters.forEach((p: CustomParameter) => {
            if (p.isRegex) {
                const { parameter, value, flags } = p;
                try {
                    step = step.replace(new RegExp(parameter, flags), value);
                    return;
                } catch {
                    return;
                }
            }
            
            const { parameter, value } = p;
            step = step.split(parameter).join(value);
        });
        return step;
    }

    specialParameters = [
        //Ruby interpolation (like `#{Something}` ) should be replaced with `.*`
        //https://github.com/alexkrechik/VSCucumberAutoComplete/issues/65
        [/#{(.*?)}/g, '.*'],

        //Parameter-types
        //https://github.com/alexkrechik/VSCucumberAutoComplete/issues/66
        //https://docs.cucumber.io/cucumber/cucumber-expressions/
        [/{float}/g, '-?\\d*\\.?\\d+'],
        [/{int}/g, '-?\\d+'],
        [/{stringInDoubleQuotes}/g, '"[^"]+"'],
        [/{word}/g, '[^\\s]+'],
        [/{string}/g, "(\"|')[^\\1]*\\1"],
        [/{}/g, '.*'],
    ] as const

    getRegTextForPureStep(step: string) {
        const parameterChanges = new Array<string>();

        // Replace parameters with unique non-RegExp tokens before escaping.
        this.specialParameters.forEach(([parameter, change]) => {
            step = step.replace(parameter, () => {
                const token = `\uE000${parameterChanges.length}\uE001`;
                parameterChanges.push(change);
                return token;
            });
        });
    
        // Escape all special symbols
        step = escaprRegExpForPureText(step);

        // Restore every parameter as its intended RegExp fragment.
        parameterChanges.forEach((change, index) => {
            step = step.replace(
                `\uE000${index}\uE001`,
                () => change
            );
        });

        // Compile the final regex
        return `^${step}$`;
    }

    shouldUseCucumberExpression(step: string, delimiter?: string) {
        // Doubled source backslashes preserve explicitly escaped Cucumber
        // punctuation. Plus signs are also literals in a
        // Cucumber expression, but a RegExp would interpret them as quantifiers.
        // Keep all other quoted patterns in the legacy RegExp mode: quoted
        // RegExp definitions such as `I enter (.*)` are supported historically.
        if (delimiter === undefined || delimiter === '/') {
            return false;
        }
        const hasStrongRegExpSyntax = /(^\^|\$$)/.test(step) ||
            /\.\*|\.\+|\[[^\]]+\]|\\{1,2}[dDsSwWbB1-9]|\(\?[:=!<]|\||\)(?:[+*?]|\{\d+(?:,\d*)?\})/.test(step);
        if (hasStrongRegExpSyntax) {
            return false;
        }
        return /\\\\[{}()/\\]/.test(step) || /[()+?/]/.test(step);
    }

    getRegTextForCucumberExpression(step: string) {
        const regexChanges = new Array<string>();
        const preserveRegExp = (change: string) => {
            const token = `\uE000${regexChanges.length}\uE001`;
            regexChanges.push(change);
            return token;
        };

        // Preserve punctuation escaped through both the source string and the
        // Cucumber expression before removing the source-level backslashes.
        step = step.replace(/\\\\([{}()/\\])/g, (_match, symbol: string) =>
            preserveRegExp(escaprRegExpForPureText(symbol))
        );
        step = this.getTextForQuotedStep(step);

        this.specialParameters.forEach(([parameter, change]) => {
            step = step.replace(parameter, () => preserveRegExp(change));
        });

        // Unknown parameter types are still supported as wildcards.
        step = step.replace(/{(?![\d,])[^}]*}/g, () =>
            preserveRegExp('.*')
        );

        // Ambiguous quoted punctuation supports both its literal spelling and
        // Cucumber-expression optional/alternative semantics.
        step = step.replace(/\(([^()]*)\)/g, (match, optionalText: string) =>
            preserveRegExp(
                `(?:${escaprRegExpForPureText(match)}|` +
                `(?:${escaprRegExpForPureText(optionalText)})?)`
            )
        );
        step = step.replace(/[^\s/]+(?:\/[^\s/]+)+/g, (alternatives) =>
            preserveRegExp(
                `(?:${escaprRegExpForPureText(alternatives)}|` +
                `${alternatives
                    .split('/')
                    .map(escaprRegExpForPureText)
                    .join('|')})`
            )
        );

        step = escaprRegExpForPureText(step);
        for (let index = regexChanges.length - 1; index >= 0; index--) {
            step = step.replace(
                `\uE000${index}\uE001`,
                () => regexChanges[index]
            );
        }
        return `^${step}$`;
    }

    getCucumberExpressionCompletionVariants(step: string) {
        const maxVariants = 256;
        let optionalCandidates = 0;
        let alternativeCandidates = 0;
        const literalChanges = new Array<string>();
        const preserveLiteral = (literal: string) => {
            const token = `\uE000${literalChanges.length}\uE001`;
            literalChanges.push(literal);
            return token;
        };

        // Protect escaped punctuation so literal parentheses and slashes are
        // not expanded as optional or alternative Cucumber-expression text.
        step = step.replace(/\\\\([{}()/\\])/g, (_match, symbol: string) =>
            preserveLiteral(symbol)
        );
        step = this.getTextForQuotedStep(step);

        const addVariant = (variants: string[], variant: string) => {
            if (variants.length < maxVariants && !~variants.indexOf(variant)) {
                variants.push(variant);
            }
            return variants;
        };
        const expandOptionalText = (
            text: string,
            variants = new Array<string>()
        ): string[] => {
            if (optionalCandidates >= maxVariants) {
                return variants;
            }
            const match = text.match(/\(([^()]*)\)/);
            if (!match || match.index === undefined) {
                optionalCandidates++;
                return addVariant(variants, text);
            }
            const before = text.slice(0, match.index);
            const after = text.slice(match.index + match[0].length);
            expandOptionalText(
                before + preserveLiteral(match[0]) + after,
                variants
            );
            expandOptionalText(before + after, variants);
            return expandOptionalText(before + match[1] + after, variants);
        };
        const expandAlternativeText = (
            text: string,
            variants = new Array<string>()
        ): string[] => {
            if (alternativeCandidates >= maxVariants) {
                return variants;
            }
            const match = text.match(/[^\s/]+(?:\/[^\s/]+)+/);
            if (!match || match.index === undefined) {
                alternativeCandidates++;
                return addVariant(variants, text);
            }
            const before = text.slice(0, match.index);
            const after = text.slice(match.index + match[0].length);
            expandAlternativeText(
                before + preserveLiteral(match[0]) + after,
                variants
            );
            return match[0].split('/').reduce((expanded, alternative) => {
                expandAlternativeText(before + alternative + after, expanded);
                return expanded;
            }, variants);
        };

        const variants = expandOptionalText(step).reduce((expanded, variant) => {
            expandAlternativeText(variant, expanded);
            return expanded;
        }, new Array<string>());
        return variants.map((variant) =>
            literalChanges.reduce(
                (restored, literal, index) => restored.replace(
                    `\uE000${index}\uE001`,
                    () => literal
                ),
                variant
            )
        );
    }

    getBestCompletionVariant(variants: string[], typedStep: string) {
        return variants.reduce((best, variant) => {
            const commonPrefixLength = variant.split('').reduce(
                (length, character, index) =>
                    length === index && character === typedStep[index]
                        ? length + 1
                        : length,
                0
            );
            return commonPrefixLength > best.commonPrefixLength
                ? { commonPrefixLength, variant }
                : best;
        }, {
            commonPrefixLength: -1,
            variant: variants[0],
        }).variant;
    }

    getRegTextForStep(step: string) {

        this.specialParameters.forEach(([parameter, change]) => {
            step = step.replace(parameter, change)
        })

        //Optional Text
        step = step.replace(/\(([a-z\s]+)\)/g, '($1)?');

        //Alternative text a/b/c === (a|b|c)
        step = step.replace(
            /([a-zA-Z]+)(?:\/([a-zA-Z]+))+/g,
            (match) => `(${match.replace(/\//g, '|')})`
        );

        //Handle Cucumber Expressions (like `{Something}`) should be replaced with `.*`
        //https://github.com/alexkrechik/VSCucumberAutoComplete/issues/99
        //Cucumber Expressions Custom Parameter Type Documentation
        //https://docs.cucumber.io/cucumber-expressions/#custom-parameters
        step = step.replace(/([^\\]|^){(?![\d,])(.*?)}/g, '$1.*');

        //Escape all the regex symbols to avoid errors
        step = escapeRegExp(step);

        return step;
    }

    getPartialRegParts(
        text: string,
        pureText = this.settings.pureTextSteps,
        cucumberExpression = false
    ) {
    // We should separate got string into the parts by space symbol
    // But we should not touch /()/ RegEx elements
        text = cucumberExpression
            ? this.getRegTextForCucumberExpression(text)
            : pureText
                ? this.getRegTextForPureStep(text)
                : this.getRegTextForStep(text);
        let currString = '';
        let bracesMode = false;
        let openingBracesNum = 0;
        let closingBracesNum = 0;
        const res = [];
        for (let i = 0; i <= text.length; i++) {
            const currSymbol = text[i];
            if (i === text.length) {
                res.push(currString);
            } else if (bracesMode) {
                //We should do this hard check to avoid circular braces errors
                if (currSymbol === ')') {
                    closingBracesNum++;
                    if (openingBracesNum === closingBracesNum) {
                        bracesMode = false;
                    }
                }
                if (currSymbol === '(') {
                    openingBracesNum++;
                }
                currString += currSymbol;
            } else {
                if (currSymbol === ' ') {
                    res.push(currString);
                    currString = '';
                } else if (currSymbol === '(') {
                    currString += '(';
                    bracesMode = true;
                    openingBracesNum = 1;
                    closingBracesNum = 0;
                } else {
                    currString += currSymbol;
                }
            }
        }
        return res;
    }

    getPartialRegText(
        regText: string,
        pureText = this.settings.pureTextSteps,
        cucumberExpression = false
    ) {
    //Same with main reg, only differ is match any string that same or less that current one
        return this.getPartialRegParts(
            regText,
            pureText,
            cucumberExpression
        )
            .map((el) => `(${el}|$)`)
            .join('( |$)')
            .replace(/^\^|^/, '^');
    }

    getTextForQuotedStep(step: string) {
    //Remove all the backslashes
        return step.replace(/\\/g, '');
    }

    getTextForStep(step: string) {
        step = this.getTextForQuotedStep(step);

        //Remove "string start" and "string end" RegEx symbols
        step = step.replace(/^\^|\$$/g, '');

        return step;
    }

    getDescForStep(step: string) {
    //Remove 'Function body' part
        step = step.replace(/\{.*/, '');

        //Remove spaces in the beginning end in the end of string
        step = step.replace(/^\s*/, '').replace(/\s*$/, '');

        return step;
    }

    getStepTextInvariants(step: string): string[] {
    //Handle regexp's like 'I do (one|to|three)'
    //TODO - generate correct num of invariants for the circular braces
        const bracesRegEx = /(\([^)()]+\|[^()]+\))/;
        if (~step.search(bracesRegEx)) {
            const match = step.match(bracesRegEx);
            const matchRes = match![1];
            const variants = matchRes
                .replace(/\(\?:/, '')
                .replace(/^\(|\)$/g, '')
                .split('|');
            return variants.reduce((varRes, variant) => {
                return varRes.concat(
                    this.getStepTextInvariants(step.replace(matchRes, variant))
                );
            }, new Array<string>());
        } else {
            return [step];
        }
    }

    getCompletionInsertText(
        step: string,
        stepPart: string,
        pureText = this.settings.pureTextSteps
    ) {
    // Return only part we need for our step
        let res = step;
        const strArray = this.getPartialRegParts(res, pureText);
        const currArray = new Array<string>();
        const { length } = strArray;
        for (let i = 0; i < length; i++) {
            currArray.push(strArray.shift()!);
            try {
                const r = new RegExp('^' + escapeRegExp(currArray.join(' ')));
                if (!r.test(stepPart)) {
                    res = new Array<string>()
                        .concat(currArray.slice(-1), strArray)
                        .join(' ');
                    break;
                }
            } catch (err) {
                //TODO - show some warning
            }
        }

        if (this.settings.smartSnippets) {
            /*
                Now we should change all the 'user input' items to some snippets
                Create our regexp for this:
                1) \(? - we be started from opening brace
                2) \\.|\[\[^\]]\] - [a-z] or \w or .
                3) \*|\+|\{[^\}]+\} - * or + or {1, 2}
                4) \)? - could be finished with opening brace
            */
            const match = res.match(
                /((?:\()?(?:\\.|\.|\[[^\]]+\])(?:\*|\+|\{[^}]+\})(?:\)?))/g
            );
            if (match) {
                for (let i = 0; i < match.length; i++) {
                    const num = i + 1;
                    res = res.replace(match[i], () => '${' + num + ':}');
                }
            }
        } else {
            //We can replace some outputs, ex. strings in brackets to make insert strings more neat
            res = res.replace(/"\[\^"\]\+"/g, '""');
        }

        if (pureText) {
            // Remove generated regex anchors before unescaping literal ones.
            res = res.replace(/^\^/, '');
            res = res.replace(/(^|[^\\])\$$/, '$1');
            // Replace all the escape chars for now.
            res = res.replace(/\\/g, '');
        }

        return res;
    }

    getDocumentation(stepRawComment: string) {
        const stepParsedComment = commentParser.parse(stepRawComment.trim(), {
            unwrap: true,
            sloppy: true,
            recoverable: true,
        });
        return (
            stepParsedComment.description ||
      (stepParsedComment.tags.find((tag) => tag.title === 'description') || {})
          .description ||
      (stepParsedComment.tags.find((tag) => tag.title === 'desc') || {})
          .description ||
      stepRawComment
        );
    }

    getSteps(
        fullStepLine: string,
        stepPart: string,
        def: Location,
        gherkin: GherkinType,
        comments: JSDocComments,
        stepDelimiter?: string
    ): Step[] {
        const stepsVariants = this.settings.stepsInvariants
            ? this.getStepTextInvariants(stepPart)
            : [stepPart];
        const desc = this.getDescForStep(fullStepLine);
        const comment = comments[def.range.start.line];
        const documentation = comment
            ? this.getDocumentation(comment)
            : fullStepLine;
        return stepsVariants.reduce((steps, step) => {
            const isCucumberExpression = !this.settings.pureTextSteps &&
                this.shouldUseCucumberExpression(step, stepDelimiter);
            let reg: RegExp;
            try {
                const regText = this.settings.pureTextSteps
                    ? this.getRegTextForPureStep(step)
                    : isCucumberExpression
                        ? this.getRegTextForCucumberExpression(step)
                        : this.getRegTextForStep(step);
                reg = new RegExp(regText);
            } catch (err) {
                // Filter invalid long regular expressions.
                return steps;
            }

            let partialReg;
            // Use long regular expression in case of error
            try {
                partialReg = new RegExp(
                    this.getPartialRegText(
                        step,
                        this.settings.pureTextSteps,
                        isCucumberExpression
                    )
                );
            } catch (err) {
                // Todo - show some warning
                partialReg = reg;
            }

            //Todo we should store full value here
            const text = this.settings.pureTextSteps
                ? step
                : isCucumberExpression
                    ? this.getTextForQuotedStep(step)
                    : this.getTextForStep(step);
            const completionVariants = isCucumberExpression
                ? this.getCucumberExpressionCompletionVariants(step)
                : [text];
            const id = 'step' + getMD5Id(text);
            const count = this.getElementCount(id);
            steps.push({
                id,
                reg,
                partialReg,
                isCucumberExpression,
                completionVariants,
                text,
                desc,
                def,
                count,
                gherkin,
                documentation,
            });
            return steps;
        }, new Array<Step>());
    }

    getMultiLineComments(content: string) {
        return content.split(/\r?\n/g).reduce(
            (res, line, i) => {
                if (~line.search(/^\s*\/\*/)) {
                    res.current = `${line}\n`;
                    res.commentMode = true;
                } else if (~line.search(/^\s*\*\//)) {
                    res.current += `${line}\n`;
                    res.comments[i + 1] = res.current;
                    res.commentMode = false;
                } else if (res.commentMode) {
                    res.current += `${line}\n`;
                }
                return res;
            },
            {
                comments: {} as JSDocComments,
                current: '',
                commentMode: false,
            }
        ).comments;
    }

    getFileSteps(filePath: string) {
        const fileContent = getFileContent(filePath);
        const fileComments = this.getMultiLineComments(fileContent);
        const definitionFile = clearComments(fileContent);
        return definitionFile
            .split(/\r?\n/g)
            .reduce((steps, line, lineIndex, lines) => {
                //TODO optimize
                let match;
                let finalLine = '';
                const currLine = this.handleCustomParameters(line);
                const currentMatch = this.geStepDefinitionMatch(currLine);
                //Add next line to our string to handle two-lines step definitions
                const nextLine = this.handleCustomParameters(lines[lineIndex + 1] || '');
                if (currentMatch) {
                    match = currentMatch;
                    finalLine = currLine;
                } else if (nextLine) {
                    const nextLineMatch = this.geStepDefinitionMatch(nextLine);
                    const bothLinesMatch = this.geStepDefinitionMatch(
                        currLine + nextLine
                    );
                    if (bothLinesMatch && !nextLineMatch) {
                        match = bothLinesMatch;
                        finalLine = currLine + nextLine;
                    }
                }
                if (match) {
                    const [, beforeGherkin, gherkinString, stepDelimiter, stepPart] = match;
                    const gherkin = getDefinitionGherkinTypeLower(
                        gherkinString,
                        this.settings.gherkinLanguage
                    );
                    const pos = Position.create(lineIndex, beforeGherkin.length);
                    const def = Location.create(
                        getOSPath(filePath),
                        Range.create(pos, pos)
                    );
                    steps = steps.concat(
                        this.getSteps(
                            finalLine,
                            stepPart,
                            def,
                            gherkin,
                            fileComments,
                            stepDelimiter
                        )
                    );
                }
                return steps;
            }, new Array<Step>());
    }

    validateConfiguration(
        settingsFile: string,
        stepsPathes: StepSettings,
        workSpaceRoot: string
    ) {
        return stepsPathes.reduce((res, path) => {
            const files = globSync(path);
            if (!files.length) {
                const searchTerm = path.replace(workSpaceRoot + '/', '');
                const range = getTextRange(
                    workSpaceRoot + '/' + settingsFile,
                    `"${searchTerm}"`
                );
                res.push({
                    severity: DiagnosticSeverity.Warning,
                    range: range,
                    message: 'No steps files found',
                    source: 'cucumberautocomplete',
                });
            }
            return res;
        }, new Array<Diagnostic>());
    }

    populate(root: string, stepsPathes: StepSettings) {
        this.elementsHash = {};
        this.elements = stepsPathes
            .reduce(
                (files, path) =>
                    files.concat(globSync(root + '/' + path, { absolute: true })),
                new Array<string>()
            )
            .reduce(
                (elements, f) =>
                    elements.concat(
                        this.getFileSteps(f).reduce((steps, step) => {
                            if (!this.elementsHash[step.id]) {
                                steps.push(step);
                                this.elementsHash[step.id] = true;
                            }
                            return steps;
                        }, new Array<Step>())
                    ),
                new Array<Step>()
            );
    }

    getStepByText(text: string, gherkin?: GherkinType) {
        return this.elements.find(
            (s) => {
                const isGherkinOk = gherkin !== undefined ? s.gherkin === gherkin : true;
                const isStepOk = s.reg.test(text);
                return isGherkinOk && isStepOk;
            }
        );
    }

    validate(line: string, lineNum: number, text: string) {
        line = line.replace(/\s*$/, '');
        const lineForError = line.replace(/^\s*/, '');
        const match = this.getGherkinMatch(line, text);
        if (!match) {
            return null;
        }
        const beforeGherkin = match[1];
        const gherkinPart = match[2];
        const gherkinWord = this.settings.strictGherkinValidation
            ? this.getStrictGherkinType(gherkinPart, lineNum, text)
            : undefined;
        const step = this.getStepByText(match[4], gherkinWord);
        if (step) {
            return null;
        } else {
            return {
                severity: DiagnosticSeverity.Warning,
                range: {
                    start: { line: lineNum, character: beforeGherkin.length },
                    end: { line: lineNum, character: line.length },
                },
                message: `Was unable to find step for "${lineForError}"`,
                source: 'cucumberautocomplete',
            } as Diagnostic;
        }
    }

    getDefinition(line: string, text: string) {
        const match = this.getGherkinMatch(line, text);
        if (!match) {
            return null;
        }
        const step = this.getStepByText(match[4]);
        return step ? step.def : null;
    }

    getStrictGherkinType(gherkinPart: string, lineNumber: number, text: string) {
        const language = normalizeGherkinLanguage(
            this.settings.gherkinLanguage
        );
        const gherkinType = getGherkinType(gherkinPart, language);
        if (gherkinType === GherkinType.And || gherkinType === GherkinType.But) {
            return text
                .split(/\r?\n/g)
                .slice(0, lineNumber)
                .reduceRight((res, val) => {
                    if (res === GherkinType.Other) {
                        const match = this.getGherkinMatch(val, text);
                        if (match) {
                            const [, , prevGherkinPart] = match;
                            const prevGherkinPartType = getGherkinTypeLower(
                                prevGherkinPart,
                                language
                            );
                            if (
                                ~[
                                    GherkinType.Given,
                                    GherkinType.When,
                                    GherkinType.Then,
                                ].indexOf(prevGherkinPartType)
                            ) {
                                res = prevGherkinPartType;
                            }
                        }
                    }
                    return res;
                }, GherkinType.Other);
        } else {
            return getGherkinTypeLower(gherkinPart, language);
        }
    }

    getCompletion(
        line: string,
        lineNumber: number,
        text: string
    ): CompletionItem[] | null {
    //Get line part without gherkin part
        const match = this.getGherkinMatch(line, text);
        if (!match) {
            return null;
        }
        const [, , gherkinPart, , stepPartBase] = match;
        //We don't need last word in our step part due to it could be incompleted
        let stepPart = stepPartBase || '';
        stepPart = stepPart.replace(/[^\s]+$/, '');
        const res = this.elements
        //Filter via gherkin words comparing if strictGherkinCompletion option provided
            .filter((step) => {
                if (this.settings.strictGherkinCompletion) {
                    const strictGherkinPart = this.getStrictGherkinType(
                        gherkinPart,
                        lineNumber,
                        text
                    );
                    return step.gherkin === strictGherkinPart;
                } else {
                    return true;
                }
            })
        //Current string without last word should partially match our regexp
            .filter((step) => step.partialReg.test(stepPart))
        //We got all the steps we need so we could make completions from them
            .map((step) => {
                return {
                    label: step.text,
                    kind: CompletionItemKind.Snippet,
                    data: step.id,
                    documentation: step.documentation,
                    sortText: getSortPrefix(step.count, 5) + '_' + step.text,
                    insertText: this.getCompletionInsertText(
                        this.getBestCompletionVariant(
                            step.completionVariants,
                            stepPartBase
                        ),
                        stepPart,
                        this.settings.pureTextSteps ||
                            step.isCucumberExpression
                    ),
                    insertTextFormat: InsertTextFormat.Snippet,
                };
            });
        return res.length ? res : null;
    }

    getCompletionResolve(item: CompletionItem) {
        this.incrementElementCount(item.data);
        return item;
    }
}
