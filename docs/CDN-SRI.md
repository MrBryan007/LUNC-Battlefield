# CDN / Supply-chain note — v12.0.12 stabilization

## Current
- Three.js **r128** loaded from cdnjs + jsDelivr (OrbitControls, GLTFLoader).
- No Subresource Integrity (SRI) hashes on the script tags.
- No Content-Security-Policy is enforced (correct for now — WebSockets, market APIs, and asset loads would break under a tight CSP).

## Risks
- A compromised CDN could serve altered Three.js.
- r128 is old. A future upgrade needs a dedicated migration pass (not done here).

## Recommended next step (not done in this pass)
1. Vendor `three.min.js`, `OrbitControls.js`, and `GLTFLoader.js` into `vendor/` at the exact r128 builds currently used.
2. Add SRI hashes once vendored or once a pinned CDN URL is chosen.
3. Do **not** upgrade Three.js in the same change.
4. Do **not** enforce a CSP until every WebSocket, API, and asset origin is listed.

## Status
Evaluated only. No vendor or SRI change in this commit so the live load path stays identical.
