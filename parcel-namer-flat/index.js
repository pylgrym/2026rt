const { Namer } = require("@parcel/plugin");
const path = require("path");

/**
 * Emits flat, hash-free bundle names (e.g. `index.js`, `style.css`,
 * `square.ttf`) so the contents of `dist/` are stable and can be
 * committed to version control. Entry bundles (like `index.html`) and
 * anything that needs a stable name fall through to Parcel's defaults.
 */
module.exports = new Namer({
  name({ bundle }) {
    // Let Parcel name entries and stable-named bundles itself.
    if (bundle.needsStableName) {
      return null;
    }

    const entry = bundle.getMainEntry();
    if (!entry) {
      // No single source (e.g. a shared bundle) — defer to defaults.
      return null;
    }

    const base = path.basename(entry.filePath, path.extname(entry.filePath));
    return `${base}.${bundle.type}`;
  },
});
