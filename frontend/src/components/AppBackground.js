/**
 * AppBackground — Fixed, decorative backdrop rendered once behind every page.
 * Drifting aurora glows + a faded grid + vignette. Styles live in index.css.
 */

import React from 'react';

export default function AppBackground() {
  return (
    <div className="app-bg" aria-hidden="true">
      <div className="app-bg__aurora app-bg__aurora--teal" />
      <div className="app-bg__aurora app-bg__aurora--sky" />
      <div className="app-bg__aurora app-bg__aurora--violet" />
      <div className="app-bg__grid" />
      <div className="app-bg__spotlight" />
      <div className="app-bg__grid app-bg__grid--lit" />
      <div className="app-bg__scanline" />
      <div className="app-bg__vignette" />
    </div>
  );
}
