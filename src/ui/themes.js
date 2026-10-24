// The interface designs one can switch between under "Design". Apart from the current
// glass look, each is a style sheet in src/themes/ that is added to the page when chosen.
import checklista from '../themes/checklista.css';
import crt from '../themes/crt.css';
import dsky from '../themes/dsky.css';
import mcc from '../themes/mcc.css';
import nasa75 from '../themes/nasa75.css';

export const THEMES = [
  { id: 'glas', name: 'Nuvarande', note: 'Mjukt glas, som hittills', css: '' },
  { id: 'mcc', name: 'Mission Control 1969', note: 'Konsoler med upplysta tryckknappar', css: mcc },
  { id: 'dsky', name: 'Apollo DSKY', note: 'Färddatorns tangentbord och gröna siffror', css: dsky },
  { id: 'crt', name: 'Bärnstensskärm', note: 'Terminal med bärnstensfärgad fosfor', css: crt },
  { id: 'nasa75', name: 'NASA 1975', note: 'Grafiska manualen: Helvetica och NASA-rött', css: nasa75 },
  { id: 'checklista', name: 'Checklista', note: 'Apollos maskinskrivna färdpärmar', css: checklista },
];

export const DEFAULT_THEME = 'glas';

/**
 * Puts a design on the page: data-theme on <html> and its style sheet in <style id="theme-style">.
 * @returns {typeof THEMES[number]} the design applied (the default for an unknown id)
 */
export function applyTheme(id, doc = document) {
  const theme = THEMES.find((t) => t.id === id) || THEMES.find((t) => t.id === DEFAULT_THEME);
  doc.documentElement.dataset.theme = theme.id;
  let style = doc.getElementById('theme-style');
  if (!style) {
    style = doc.createElement('style');
    style.id = 'theme-style';
    doc.head.append(style);
  }
  if (style.textContent !== theme.css) style.textContent = theme.css;
  return theme;
}
