# Cucumber Beautifier

An unofficial [fork](https://github.com/ohlori/cucumber-beautifier) of [VSCucumberAutoComplete](https://github.com/alexkrechik/VSCucumberAutoComplete), based on upstream version `3.1.1`. It is not affiliated with or endorsed by the original author.

## Changes

- Adds the global `cucumberautocomplete.gherkinLanguage` setting for all feature files. Select a supported language in Settings; the default is English (`en`). For example, Slovenian (`sl`) recognizes `In` as a step keyword, while English treats `In order to ...` as prose. File-level `# language:` comments do not override this setting.
- Fixes step validation, definition lookup, and completion for these literal characters. The examples are illustrative; no step text is hardcoded.

| Character | Example |
| --- | --- |
| `(` and `)` | `question mark (?) icon` |
| `?` | `question mark (?) icon` |
| `+` | `+ Add Email Address button` |
| `'` | `doesn't work` |
| `/` | `AM/PM` |
| `-` | `12-hour format` |
| `,` | `alpha, beta` |

See the [original README](https://github.com/alexkrechik/VSCucumberAutoComplete#readme) for usage and other settings.

License: [MIT](https://github.com/ohlori/cucumber-beautifier/blob/master/LICENSE) · [Third-party notices](https://github.com/ohlori/cucumber-beautifier/blob/master/THIRD_PARTY_NOTICES.md)
