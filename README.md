# Cucumber Beautifier

An unofficial [fork](https://github.com/ohlori/cucumber-beautifier) of [VSCucumberAutoComplete](https://github.com/alexkrechik/VSCucumberAutoComplete), based on upstream version `3.1.1`. Current fork version: **3.1.2**. It is not affiliated with or endorsed by the original author.

## Changes

- Adds the global `cucumberautocomplete.gherkinLanguage` setting for all feature files. Select a supported language in Settings; the default is English (`en`). For example, Slovenian (`sl`) recognizes `In` as a step keyword, while English treats `In order to ...` as prose. File-level `# language:` comments do not override this setting.
- Adds `cucumberautocomplete.skipStepValidationTags` (e.g. `["@ai"]`). Missing-step diagnostics are skipped for steps under a Feature, Rule, Scenario, or Scenario Outline that carries any listed tag. Tags inherit downward (Feature → Rule → Scenario). Background steps only skip when Feature or Rule is tagged.
- Fixes step validation, definition lookup, and completion for these literal characters. The examples are illustrative; no step text is hardcoded.

| Character   | Example                      |
| ----------- | ---------------------------- |
| `(` and `)` | `question mark (?) icon`     |
| `?`         | `question mark (?) icon`     |
| `+`         | `+ Add Email Address button` |
| `'`         | `doesn't work`               |
| `/`         | `AM/PM`                      |
| `-`         | `12-hour format`             |
| `,`         | `alpha, beta`                |

### `skipStepValidationTags` example

```json
{
  "cucumberautocomplete.skipStepValidationTags": ["@ai"]
}
```

With that setting, a scenario tagged `@ai` will not show `Was unable to find step for "..."` for undefined steps (useful for Midscene/AI-driven steps)

See the [original README](https://github.com/alexkrechik/VSCucumberAutoComplete#readme) for usage and other settings.

License: [MIT](https://github.com/ohlori/cucumber-beautifier/blob/master/LICENSE) · [Third-party notices](https://github.com/ohlori/cucumber-beautifier/blob/master/THIRD_PARTY_NOTICES.md)
