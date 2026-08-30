# Evidence AI provisioning

OCR is now one Evidence AI workflow. It stores the source and machine result in
Stratus and writes chain-of-custody metadata to the existing `Evidence` table.
No separate `OcrResult` table or File Store folder is required.

See [EVIDENCE-AI.md](./EVIDENCE-AI.md) for the complete plate, crowd, face,
object, safety, barcode, and OCR workflows and the repeatable smoke test.
