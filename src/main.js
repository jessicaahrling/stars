// Boot: start the app, or explain what is missing.
import { App } from './app.js';

function boot() {
  try {
    window.stjarnhimlen = new App(document);
  } catch (err) {
    console.error(err);
    const box = document.createElement('div');
    box.className = 'fallback';
    box.textContent = /WebGL/i.test(String(err && err.message))
      ? 'Stjärnhimlen behöver WebGL. Prova en annan webbläsare eller slå på hårdvaruacceleration.'
      : 'Stjärnhimlen kunde inte starta. Ladda om sidan för att försöka igen.';
    document.body.append(box);
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
