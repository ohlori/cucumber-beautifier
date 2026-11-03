import * as path from 'path';

import {
  GherkinType,
  getDefinitionGherkinTypeLower,
  getGherkinDialect,
  getGherkinType,
  getGherkinTypeLower,
  normalizeGherkinLanguage,
  supportedGherkinLanguages,
} from '../src/gherkin';
import { getGherkinSemanticTokens } from '../src/semantic.tokens';
import { getFileContent } from '../src/util';

describe('global Gherkin language selection', () => {
  it('uses English by default and ignores Slovenian In', () => {
    expect(getGherkinType('Given', 'en')).toBe(GherkinType.Given);
    expect(getGherkinType('In', 'en')).toBe(GherkinType.Other);
  });

  it('recognizes In as And when Slovenian is selected', () => {
    expect(getGherkinType('In', 'sl')).toBe(GherkinType.And);
  });

  it('prefers the selected dialect for conflicting definition keywords', () => {
    expect(getDefinitionGherkinTypeLower('Dan', 'bm'))
      .toBe(GherkinType.And);
  });

  it('falls back to English for an invalid language', () => {
    expect(normalizeGherkinLanguage('not-supported')).toBe('en');
  });

  it('keeps the manifest language choices synchronized with the data', () => {
    const manifest = JSON.parse(getFileContent(path.resolve(
      __dirname,
      '../../package.json'
    )));
    const setting = manifest.contributes.configuration.properties[
      'cucumberautocomplete.gherkinLanguage'
    ];
    expect(setting.scope).toBe('window');
    expect(setting.default).toBe('en');
    expect(setting.enum).toStrictEqual(supportedGherkinLanguages);
    expect(setting.enumItemLabels).toStrictEqual(
      supportedGherkinLanguages.map((language) => {
        const dialect = getGherkinDialect(language);
        return `${dialect.name} — ${dialect.native}`;
      })
    );
  });

  it('keeps syntax highlighting without treating In as a keyword', () => {
    const grammar = JSON.parse(getFileContent(path.resolve(
      __dirname,
      '../../syntaxes/feature.tmLanguage.json'
    )));
    expect(grammar.patterns).toContainEqual({ include: '#step_keyword' });
    expect(grammar.patterns).toContainEqual({
      include: '#feature_keyword',
    });
    expect(grammar.patterns).toContainEqual({
      include: '#feature_element_keyword',
    });
    const stepKeyword = new RegExp(grammar.repository.step_keyword.match);
    expect(stepKeyword.test('  Given a highlighted step')).toBe(true);
    expect(stepKeyword.test('  In order to keep prose unhighlighted'))
      .toBe(false);
  });

  it('highlights only step keywords from the selected language', () => {
    const text = [
      'Feature: Language selection',
      '  In order to compare reviews',
      '  And the comparison is displayed',
    ].join('\n');
    const english = getGherkinSemanticTokens(text, 'en');
    const slovenian = getGherkinSemanticTokens(text, 'sl');

    expect(english.data).toStrictEqual([
      0, 0, 7, 0, 0,
      2, 2, 3, 0, 0,
    ]);
    expect(slovenian.data).toStrictEqual([1, 2, 2, 0, 0]);
  });

  it('does not highlight keywords inside doc strings', () => {
    const text = [
      'Given a real step',
      '  """text/plain',
      'Given inside a quoted doc string',
      '  """',
      '  ```',
      'When inside a backtick doc string',
      '  ```',
      'Then another real step',
    ].join('\n');

    expect(getGherkinSemanticTokens(text, 'en').data).toStrictEqual([
      0, 0, 5, 0, 0,
      7, 0, 4, 0, 0,
    ]);
  });

  it('escapes punctuation in official dialect keywords', () => {
    expect(() => new RegExp(getGherkinDialect('en-lol').stepPattern))
      .not.toThrow();
  });
});

const classifications = [
  { word: 'Given', mixedCaseWord: 'gIvEn', type: GherkinType.Given },
  { word: 'When', mixedCaseWord: 'wHeN', type: GherkinType.When },
  { word: 'Then', mixedCaseWord: 'tHeN', type: GherkinType.Then },
  { word: 'And', mixedCaseWord: 'aNd', type: GherkinType.And },
  { word: 'But', mixedCaseWord: 'bUt', type: GherkinType.But },
  { word: 'Unknown', mixedCaseWord: 'uNkNoWn', type: GherkinType.Other },
];

describe('Gherkin keyword classification', () => {
  it.each(classifications)(
    'classifies $word with exact matching',
    ({ word, type }) => {
      expect(getGherkinType(word)).toBe(type);
    }
  );

  it.each(classifications)(
    'classifies $mixedCaseWord case-insensitively',
    ({ mixedCaseWord, type }) => {
      expect(getGherkinTypeLower(mixedCaseWord)).toBe(type);
    }
  );
});
