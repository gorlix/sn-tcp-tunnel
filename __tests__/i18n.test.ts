import {getStrings, getCurrentLocale, normaliseLocale} from '../src/i18n';

describe('i18n', () => {
  describe('getStrings', () => {
    it('returns Italian strings for locale "it"', () => {
      const s = getStrings('it');
      expect(s.active).toBe('ATTIVO');
      expect(s.inactive).toBe('INATTIVO');
      expect(s.start).toBe('AVVIA TUNNEL');
      expect(s.stop).toBe('SPEGNI TUNNEL');
      expect(s.save).toBe('SALVA');
      expect(s.back).toBe('Indietro');
    });

    it('returns English strings for locale "en"', () => {
      const s = getStrings('en');
      expect(s.active).toBe('ACTIVE');
      expect(s.inactive).toBe('INACTIVE');
      expect(s.start).toBe('START TUNNEL');
      expect(s.stop).toBe('STOP TUNNEL');
      expect(s.save).toBe('SAVE');
      expect(s.back).toBe('Back');
    });

    it('errPortBusyMsg formats port number', () => {
      const it = getStrings('it');
      expect(it.errPortBusyMsg(8888)).toContain('8888');
      const en = getStrings('en');
      expect(en.errPortBusyMsg(7890)).toContain('7890');
    });
  });

  describe('normaliseLocale', () => {
    it('normalises "it" → "it"', () => {
      expect(normaliseLocale('it')).toBe('it');
    });
    it('normalises "it_IT" → "it"', () => {
      expect(normaliseLocale('it_IT')).toBe('it');
    });
    it('normalises "en-US" → "en"', () => {
      expect(normaliseLocale('en-US')).toBe('en');
    });
    it('unknown locale → "en" fallback', () => {
      expect(normaliseLocale('de')).toBe('en');
      expect(normaliseLocale('zh_CN')).toBe('en');
      expect(normaliseLocale(null)).toBe('en');
    });
  });

  describe('getCurrentLocale', () => {
    it('returns a supported locale string', () => {
      const locale = getCurrentLocale();
      expect(['it', 'en']).toContain(locale);
    });
  });
});
