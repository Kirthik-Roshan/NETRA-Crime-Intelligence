# Prediction model status in the India data center

Catalyst's current Zia AutoML documentation states that AutoML is unavailable in
the IN data center. The `KspHacks` project uses `api.catalyst.zoho.in`, so a Zia
AutoML model cannot be trained or selected for this project.

NETRA therefore uses an explainable baseline over Cloud Scale FIRs and criminal
links. It exposes every input factor, source FIR, confidence, time window, and
human-review notice. It does not label this output as Zia AutoML.

The Function retains an optional `AUTOML_MODEL_ID` integration for a future
project in a supported data center and calls the official
`app.zia().automl(modelId, input)` API there.
