# Synthetic Accused Reference Portraits

This folder contains 70 fictional, AI-generated reference portraits for the
70 consolidated profiles derived from the synthetic official-schema `Accused`
rows. None of the images depicts a real accused person or a KSP source image.

- High-resolution PNG files stay here for controlled EvidenceAI tests.
- Optimized 512 px WebP files are generated in `public/synthetic-profiles`.
- `manifest.json` binds each image to an immutable derived profile ID and its
  deterministic Catalyst Stratus object key.
- The official 28-table KSP schema is unchanged. Portraits are external object
  assets, never new or altered `Accused` columns.

Rebuild and verify the delivery files with:

```bash
node scripts/build-profile-assets.mjs
```

