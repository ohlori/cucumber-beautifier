import { normalizeGherkinLanguage } from './gherkin';
import { BaseSettings, Settings } from './types';

export function normalizeSettings(baseSettings: BaseSettings): Settings {
    return {
        ...baseSettings,
        gherkinLanguage: normalizeGherkinLanguage(baseSettings?.gherkinLanguage),
        skipStepValidationTags: new Array<string>().concat(
            baseSettings?.skipStepValidationTags ?? []
        ),
        steps: new Array<string>()
            .concat(baseSettings?.steps ?? [])
            .filter((step) => typeof step === 'string' && step.trim().length > 0),
    };
}
